import { z } from 'zod'
import { prisma } from './prisma'
import { getSftp, listDir, readFile, writeFile, stat, joinPath, removeRecursive } from './sftp-pool'
import { safePath } from './sftp-auth'
import { forUser, forApp, getOrgLogin } from './github'
import { buildCobblemonTemplate, type TemplateVars } from './cobblemon-template'
import { audit } from './audit'

/**
 * Tool registry — shared by the MCP server (Phase 4) and any future
 * agent driver. Each tool has:
 *   - `schema`  : MCP/Anthropic-compatible JSON schema
 *   - `kind`    : "read" | "write" — exposed via MCP annotations so the
 *                  client can warn the user before destructive ops
 *   - `execute` : the actual TS implementation
 */

export type ToolKind = 'read' | 'write'

export type ToolContext = {
  userId: string
  /** Workspace bindings (optional — tools accept explicit args too) */
  machineId?: string | null
  repoOwner?: string | null
  repoName?: string | null
}

/** Minimal JSON Schema shape we expose. Matches what Anthropic / MCP expect. */
export type ToolSchema = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export type ToolDef = {
  schema: ToolSchema
  kind: ToolKind
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown>
}

/* ─── helpers ─── */

async function resolveMachineId(
  ctx: ToolContext,
  arg?: string | null,
): Promise<string> {
  if (arg) {
    const m = await prisma.machine.findFirst({ where: { OR: [{ id: arg }, { name: arg }] } })
    if (!m) throw new Error(`machine_not_found: ${arg}`)
    return m.id
  }
  if (!ctx.machineId) throw new Error('no_machine_in_workspace')
  return ctx.machineId
}

async function checkMachinePerm(ctx: ToolContext, machineId: string, needWrite: boolean) {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } })
  if (!user) throw new Error('user_gone')
  if (user.role === 'admin') return
  const perm = await prisma.machinePermission.findUnique({
    where: { userId_machineId: { userId: ctx.userId, machineId } },
  })
  if (!perm) throw new Error('no_permission_on_machine')
  if (needWrite && perm.level === 'read') throw new Error('read_only_on_machine')
}

/* ─── tool definitions ─── */

export const tools: Record<string, ToolDef> = {
  /* ============= MACHINES ============= */

  list_machines: {
    kind: 'read',
    schema: {
      name: 'list_machines',
      description:
        'List all SFTP machines the current user has access to. Returns name, host, and a short description.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    async execute(_input, ctx) {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } })
      const all = await prisma.machine.findMany({
        where:
          user?.role === 'admin'
            ? {}
            : { permissions: { some: { userId: ctx.userId } } },
        select: { id: true, name: true, host: true, port: true, description: true },
      })
      return { machines: all }
    },
  },

  /* ============= SFTP ============= */

  sftp_list: {
    kind: 'read',
    schema: {
      name: 'sftp_list',
      description:
        'List files and directories in a remote folder via SFTP. Returns names, types (file/dir/link), sizes, and modification dates.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Remote path. Use "." for the SSH user\'s home dir. Examples: ".", "mods", "config/cobblemon".',
          },
          machine: {
            type: 'string',
            description:
              'Optional machine name or id. Defaults to the workspace machine.',
          },
        },
        required: ['path'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({ path: z.string(), machine: z.string().optional().nullable() })
        .parse(input)
      const machineId = await resolveMachineId(ctx, args.machine)
      await checkMachinePerm(ctx, machineId, false)
      const sftp = await getSftp(machineId)
      const entries = await listDir(sftp, safePath(args.path))
      return {
        path: safePath(args.path),
        entries: entries
          .filter((e) => e.filename !== '.' && e.filename !== '..')
          .map((e) => ({
            name: e.filename,
            type: e.attrs.isDirectory() ? 'dir' : 'file',
            size: Number(e.attrs.size),
            mtime: new Date(Number(e.attrs.mtime) * 1000).toISOString(),
          })),
      }
    },
  },

  sftp_read: {
    kind: 'read',
    schema: {
      name: 'sftp_read',
      description:
        'Read the text content of a remote file via SFTP. Files larger than 256KB are truncated to avoid blowing the context.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Remote file path (e.g. "config/server.properties")' },
          machine: { type: 'string', description: 'Optional machine name/id.' },
        },
        required: ['path'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({ path: z.string(), machine: z.string().optional().nullable() })
        .parse(input)
      const machineId = await resolveMachineId(ctx, args.machine)
      await checkMachinePerm(ctx, machineId, false)
      const sftp = await getSftp(machineId)
      const p = safePath(args.path)
      const s = await stat(sftp, p)
      if (s.isDirectory()) throw new Error('is_directory')
      const buf = await readFile(sftp, p)
      const MAX = 256 * 1024
      const truncated = buf.length > MAX
      const slice = truncated ? buf.subarray(0, MAX) : buf
      // Refuse if looks binary
      if (slice.indexOf(0) !== -1) throw new Error('binary_file')
      return {
        path: p,
        size: buf.length,
        truncated,
        content: slice.toString('utf8'),
      }
    },
  },

  sftp_write: {
    kind: 'write',
    schema: {
      name: 'sftp_write',
      description:
        'Write text content to a remote file via SFTP. Overwrites existing content. Creates the file if missing. ⚠ destructive.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Remote file path' },
          content: { type: 'string', description: 'Full file contents (UTF-8)' },
          machine: { type: 'string', description: 'Optional machine name/id.' },
        },
        required: ['path', 'content'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({
          path: z.string(),
          content: z.string(),
          machine: z.string().optional().nullable(),
        })
        .parse(input)
      const machineId = await resolveMachineId(ctx, args.machine)
      await checkMachinePerm(ctx, machineId, true)
      const sftp = await getSftp(machineId)
      const p = safePath(args.path)
      await writeFile(sftp, p, Buffer.from(args.content, 'utf8'))
      await audit({
        userId: ctx.userId,
        action: 'claude.sftp_write',
        target: `${machineId}:${p}`,
        metadata: { size: args.content.length },
      })
      return { path: p, size: args.content.length, ok: true }
    },
  },

  sftp_delete: {
    kind: 'write',
    schema: {
      name: 'sftp_delete',
      description:
        'Delete a file or directory via SFTP. Directories are removed recursively (all contents wiped). ⚠ destructive and irreversible — confirm with the user before calling.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Remote path to delete. Cannot be "." or "/" — the root is protected.',
          },
          machine: { type: 'string', description: 'Optional machine name/id.' },
        },
        required: ['path'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({ path: z.string(), machine: z.string().optional().nullable() })
        .parse(input)
      const p = safePath(args.path)
      if (p === '.' || p === '/' || p === '')
        throw new Error('cannot_delete_root')

      const machineId = await resolveMachineId(ctx, args.machine)
      await checkMachinePerm(ctx, machineId, true)
      const sftp = await getSftp(machineId)

      const s = await stat(sftp, p)
      const wasDir = s.isDirectory()
      await removeRecursive(sftp, p)

      await audit({
        userId: ctx.userId,
        action: 'claude.sftp_delete',
        target: `${machineId}:${p}`,
        metadata: { wasDirectory: wasDir },
      })
      return { path: p, wasDirectory: wasDir, ok: true }
    },
  },

  /* ============= GITHUB ============= */

  list_repos: {
    kind: 'read',
    schema: {
      name: 'list_repos',
      description:
        'List GitHub repos in the organization accessible to the current user.',
      input_schema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Optional substring filter on repo name',
          },
        },
      },
    },
    async execute(input, ctx) {
      const args = z.object({ filter: z.string().optional() }).parse(input)
      const octo = await forUser(ctx.userId)
      const org = getOrgLogin()
      const repos = await octo.repos.listForOrg({ org, per_page: 100, sort: 'updated' })
      const filter = args.filter?.toLowerCase()
      return {
        repos: repos.data
          .filter((r) => !filter || r.name.toLowerCase().includes(filter))
          .slice(0, 50)
          .map((r) => ({
            name: r.name,
            fullName: r.full_name,
            description: r.description,
            private: r.private,
            language: r.language,
            updatedAt: r.updated_at,
          })),
      }
    },
  },

  github_read_file: {
    kind: 'read',
    schema: {
      name: 'github_read_file',
      description:
        'Read a file from a GitHub repo at a specific branch/ref. Returns text content.',
      input_schema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path inside the repo' },
          ref: { type: 'string', description: 'Branch, tag, or SHA (default: default branch)' },
        },
        required: ['path'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({
          owner: z.string().optional(),
          repo: z.string().optional(),
          path: z.string(),
          ref: z.string().optional(),
        })
        .parse(input)
      const owner = args.owner ?? ctx.repoOwner ?? getOrgLogin()
      const repo = args.repo ?? ctx.repoName
      if (!repo) throw new Error('no_repo_in_workspace')
      const octo = await forUser(ctx.userId)
      const res = await octo.repos.getContent({ owner, repo, path: args.path, ref: args.ref })
      if (Array.isArray(res.data)) throw new Error('path_is_directory')
      if (!('content' in res.data)) throw new Error('not_a_file')
      const content = Buffer.from(res.data.content, 'base64').toString('utf8')
      return { path: args.path, content, sha: res.data.sha, size: res.data.size }
    },
  },

  github_commit: {
    kind: 'write',
    schema: {
      name: 'github_commit',
      description:
        'Create or update one or more files on a branch in a single commit. ⚠ destructive: pushes to the repo. Will create the branch if it does not exist (off the default branch).',
      input_schema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: {
            type: 'string',
            description: 'Target branch (created if missing, off default branch)',
          },
          message: { type: 'string', description: 'Commit message' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
            description: 'Files to create/update (full content)',
          },
        },
        required: ['branch', 'message', 'files'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({
          owner: z.string().optional(),
          repo: z.string().optional(),
          branch: z.string().min(1),
          message: z.string().min(1),
          files: z
            .array(z.object({ path: z.string().min(1), content: z.string() }))
            .min(1),
        })
        .parse(input)
      const owner = args.owner ?? ctx.repoOwner ?? getOrgLogin()
      const repo = args.repo ?? ctx.repoName
      if (!repo) throw new Error('no_repo_in_workspace')

      const octo = await forApp()

      // Resolve parent commit: either the branch tip, or default branch tip
      let parentSha: string
      let createBranch = false
      try {
        const ref = await octo.git.getRef({ owner, repo, ref: `heads/${args.branch}` })
        parentSha = ref.data.object.sha
      } catch {
        // Branch doesn't exist — create off default
        const info = await octo.repos.get({ owner, repo })
        const def = await octo.git.getRef({
          owner,
          repo,
          ref: `heads/${info.data.default_branch}`,
        })
        parentSha = def.data.object.sha
        createBranch = true
      }

      const parentCommit = await octo.git.getCommit({ owner, repo, commit_sha: parentSha })

      // Create blobs
      const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = []
      for (const f of args.files) {
        const blob = await octo.git.createBlob({
          owner,
          repo,
          content: Buffer.from(f.content, 'utf8').toString('base64'),
          encoding: 'base64',
        })
        treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.data.sha })
      }

      const tree = await octo.git.createTree({
        owner,
        repo,
        base_tree: parentCommit.data.tree.sha,
        tree: treeItems,
      })
      const commit = await octo.git.createCommit({
        owner,
        repo,
        message: args.message,
        tree: tree.data.sha,
        parents: [parentSha],
      })
      if (createBranch) {
        await octo.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${args.branch}`,
          sha: commit.data.sha,
        })
      } else {
        await octo.git.updateRef({
          owner,
          repo,
          ref: `heads/${args.branch}`,
          sha: commit.data.sha,
        })
      }

      await audit({
        userId: ctx.userId,
        action: 'claude.github_commit',
        target: `${owner}/${repo}@${args.branch}`,
        metadata: { sha: commit.data.sha, fileCount: args.files.length },
      })

      return {
        sha: commit.data.sha,
        url: commit.data.html_url,
        branch: args.branch,
        branchCreated: createBranch,
        fileCount: args.files.length,
      }
    },
  },

  github_open_pr: {
    kind: 'write',
    schema: {
      name: 'github_open_pr',
      description: 'Open a pull request from a source branch to a base branch.',
      input_schema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          head: { type: 'string', description: 'Source branch' },
          base: { type: 'string', description: 'Target branch (e.g. main)' },
          title: { type: 'string' },
          body: { type: 'string', description: 'PR description (markdown)' },
        },
        required: ['head', 'base', 'title'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({
          owner: z.string().optional(),
          repo: z.string().optional(),
          head: z.string(),
          base: z.string(),
          title: z.string(),
          body: z.string().optional(),
        })
        .parse(input)
      const owner = args.owner ?? ctx.repoOwner ?? getOrgLogin()
      const repo = args.repo ?? ctx.repoName
      if (!repo) throw new Error('no_repo_in_workspace')
      const octo = await forApp()
      const pr = await octo.pulls.create({
        owner,
        repo,
        head: args.head,
        base: args.base,
        title: args.title,
        body: args.body,
      })
      await audit({
        userId: ctx.userId,
        action: 'claude.github_open_pr',
        target: `${owner}/${repo}#${pr.data.number}`,
      })
      return {
        number: pr.data.number,
        url: pr.data.html_url,
        title: pr.data.title,
        state: pr.data.state,
      }
    },
  },

  github_create_repo: {
    kind: 'write',
    schema: {
      name: 'github_create_repo',
      description:
        'Create a new repository in the organization, optionally seeded with the Cobblemon Fabric 1.21.1 mod template.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Repo name (kebab-case)' },
          description: { type: 'string' },
          visibility: { type: 'string', enum: ['private', 'internal', 'public'] },
          useCobblemonTemplate: {
            type: 'boolean',
            description: 'If true, scaffolds a Fabric 1.21.1 + Cobblemon mod skeleton.',
          },
          mod: {
            type: 'object',
            description: 'Required if useCobblemonTemplate is true.',
            properties: {
              modId: { type: 'string', description: 'snake_case mod id' },
              modName: { type: 'string' },
              modGroup: { type: 'string', description: 'java/kotlin package (e.g. com.example.foo)' },
              mainClass: { type: 'string', description: 'PascalCase main class' },
              authors: { type: 'string' },
            },
          },
        },
        required: ['name'],
      },
    },
    async execute(input, ctx) {
      const args = z
        .object({
          name: z.string().regex(/^[a-z0-9][a-z0-9-_.]*$/i),
          description: z.string().default(''),
          visibility: z.enum(['private', 'internal', 'public']).default('private'),
          useCobblemonTemplate: z.boolean().default(true),
          mod: z
            .object({
              modId: z.string().regex(/^[a-z][a-z0-9_]*$/),
              modName: z.string(),
              modGroup: z.string().regex(/^[a-z][a-z0-9_.]*$/),
              mainClass: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
              authors: z.string(),
            })
            .optional(),
        })
        .parse(input)

      const org = getOrgLogin()
      const octo = await forApp()
      const created = await octo.repos.createInOrg({
        org,
        name: args.name,
        description: args.description || undefined,
        private: args.visibility !== 'public',
        // GitHub accepts 'internal' for Enterprise orgs; Octokit's TS
        // types only list 'public' | 'private'.
        visibility: args.visibility as 'public' | 'private',
        auto_init: !args.useCobblemonTemplate,
        has_issues: true,
        has_wiki: false,
      })

      if (args.useCobblemonTemplate) {
        const fallbackDescription =
          args.description || `Cobblemon side-mod ${args.name}`
        const vars: TemplateVars = args.mod
          ? { ...args.mod, description: fallbackDescription }
          : {
              modId: args.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              modName: args.name,
              modGroup: `com.example.${args.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
              mainClass:
                args.name
                  .split(/[^a-zA-Z0-9]+/)
                  .filter(Boolean)
                  .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
                  .join('') || 'Mod',
              authors: 'Cobblepanel',
              description: fallbackDescription,
            }
        const files = buildCobblemonTemplate(vars)
        // Initial commit via Git Data API
        const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = []
        for (const f of files) {
          const blob = await octo.git.createBlob({
            owner: org,
            repo: args.name,
            content: Buffer.from(f.content, 'utf8').toString('base64'),
            encoding: 'base64',
          })
          treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.data.sha })
        }
        const tree = await octo.git.createTree({ owner: org, repo: args.name, tree: treeItems })
        const commit = await octo.git.createCommit({
          owner: org,
          repo: args.name,
          message: 'chore: scaffold from Cobblepanel (Cobblemon Fabric 1.21.1)',
          tree: tree.data.sha,
          parents: [],
        })
        await octo.git.createRef({
          owner: org,
          repo: args.name,
          ref: `refs/heads/${created.data.default_branch}`,
          sha: commit.data.sha,
        })
      }

      await audit({
        userId: ctx.userId,
        action: 'claude.github_create_repo',
        target: `${org}/${args.name}`,
        metadata: { template: args.useCobblemonTemplate },
      })

      return {
        name: args.name,
        fullName: `${org}/${args.name}`,
        url: created.data.html_url,
        templateApplied: args.useCobblemonTemplate,
      }
    },
  },

  /* ============= NOTES (session scratch memory) ============= */

  note_set: {
    kind: 'write',
    schema: {
      name: 'note_set',
      description:
        "Save a short note for later reference in this chat session (e.g. a TODO, a finding, a hypothesis). Notes don't persist outside the session.",
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short identifier (e.g. "build_error")' },
          value: { type: 'string' },
        },
        required: ['key', 'value'],
      },
    },
    async execute(input) {
      const args = z.object({ key: z.string(), value: z.string() }).parse(input)
      // Trivial: just echo it; the model carries notes via its own context window.
      return { saved: true, key: args.key, length: args.value.length }
    },
  },
}

/** Tools array (MCP / Anthropic-compatible schema). */
export function toolsForApi(): ToolSchema[] {
  return Object.values(tools).map((t) => t.schema)
}

/** Look up a tool by name (case-sensitive). */
export function getTool(name: string): ToolDef | null {
  return tools[name] ?? null
}
