import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { forApp, getOrgLogin, cacheInvalidate } from '@/lib/github'
import { audit } from '@/lib/audit'
import {
  buildCobblemonTemplate,
  type TemplateVars,
} from '@/lib/cobblemon-template'

export const runtime = 'nodejs'
export const maxDuration = 60

const createRepoSchema = z.object({
  // Repo identity (becomes the GitHub repo name)
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-_.]*$/i, 'Lettres, chiffres, -_. uniquement'),
  description: z.string().max(280).default(''),
  visibility: z.enum(['private', 'internal', 'public']).default('private'),

  // Template seed (optional — if omitted, repo is created empty)
  template: z.enum(['none', 'cobblemon-fabric-1.21.1']).default('cobblemon-fabric-1.21.1'),
  mod: z
    .object({
      modId: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/, 'snake_case minuscule (ex: cobblemod_foo)'),
      modName: z.string().min(1).max(80),
      modGroup: z.string().regex(/^[a-z][a-z0-9_.]*$/, 'ex: com.example.foo'),
      mainClass: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'PascalCase ex: FooMod'),
      authors: z.string().min(1).max(160),
    })
    .optional(),
})

export async function POST(req: Request) {
  let body: z.infer<typeof createRepoSchema>
  try {
    const json = await req.json()
    const parsed = createRepoSchema.safeParse(json)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'validation', details: parsed.error.flatten() },
        { status: 400 },
      )
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    // Admin or dev can create repos
    const session = await requireRole('admin', 'dev')
    const org = getOrgLogin()
    const octo = await forApp()

    // 1. Create the repo on GitHub
    let htmlUrl: string
    let defaultBranch: string
    try {
      const created = await octo.repos.createInOrg({
        org,
        name: body.name,
        description: body.description || undefined,
        private: body.visibility !== 'public',
        visibility: body.visibility,
        auto_init: body.template === 'none', // empty repos need an initial commit
        has_issues: true,
        has_projects: false,
        has_wiki: false,
      })
      htmlUrl = created.data.html_url
      defaultBranch = created.data.default_branch
    } catch (err) {
      if (err instanceof Error && /name already exists/i.test(err.message))
        return NextResponse.json({ error: 'name_taken' }, { status: 409 })
      throw err
    }

    // 2. Seed with template (if requested)
    if (body.template === 'cobblemon-fabric-1.21.1') {
      const vars: TemplateVars = body.mod ?? {
        modId: body.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        modName: body.name,
        modGroup: `com.example.${body.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        mainClass: pascalCase(body.name),
        authors: session.user.name ?? session.user.id,
        description: body.description || `A Cobblemon side-mod called ${body.name}.`,
      }
      const files = buildCobblemonTemplate(vars)

      // Push all files in a single tree commit (much faster + atomic vs per-file)
      await pushInitialCommit(octo, org, body.name, defaultBranch, files)
    }

    cacheInvalidate(`repos:`) // invalidate everyone's repo cache
    await audit({
      userId: session.user.id,
      action: 'github.repo.create',
      target: `${org}/${body.name}`,
      metadata: {
        template: body.template,
        visibility: body.visibility,
      },
    })

    return NextResponse.json({
      ok: true,
      htmlUrl,
      fullName: `${org}/${body.name}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (msg === 'github_app_not_configured')
      return NextResponse.json(
        {
          error: 'github_app_not_configured',
          hint: 'Configure GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY dans .env, et installe la GitHub App sur ton orga.',
        },
        { status: 500 },
      )
    if (msg === 'github_app_not_installed')
      return NextResponse.json(
        {
          error: 'github_app_not_installed',
          hint: 'Installe la GitHub App sur ton organisation depuis Settings → GitHub App.',
        },
        { status: 500 },
      )
    console.error(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import type { Octokit } from '@octokit/rest'
import type { TemplateFile } from '@/lib/cobblemon-template'

/**
 * Atomically push all template files as a single initial commit on the
 * default branch. Uses the Git Data API (blob → tree → commit → ref) which
 * is the only way to create the very first commit on an empty repo.
 */
async function pushInitialCommit(
  octo: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: TemplateFile[],
) {
  // 1. Create blobs for each file
  const treeItems: Array<{
    path: string
    mode: '100644'
    type: 'blob'
    sha: string
  }> = []
  for (const f of files) {
    const blob = await octo.git.createBlob({
      owner,
      repo,
      content: Buffer.from(f.content, 'utf8').toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.data.sha })
  }

  // 2. Create the tree
  const tree = await octo.git.createTree({ owner, repo, tree: treeItems })

  // 3. Create the commit (no parents = initial commit)
  const commit = await octo.git.createCommit({
    owner,
    repo,
    message: 'chore: scaffold from Cobblepanel template (Fabric 1.21.1 + Cobblemon)',
    tree: tree.data.sha,
    parents: [],
  })

  // 4. Point the default branch ref at the new commit
  await octo.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: commit.data.sha,
  })
}

function pascalCase(s: string): string {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('') || 'Mod'
}
