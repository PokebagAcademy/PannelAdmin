import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { forUser } from '@/lib/github'

export const runtime = 'nodejs'

/** GET /api/github/repos/[owner]/[repo] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params
    const session = await requireAuth()
    const octo = await forUser(session.user.id)

    const [info, branches, commits, prs, runs] = await Promise.all([
      octo.repos.get({ owner, repo }),
      octo.repos.listBranches({ owner, repo, per_page: 20 }),
      octo.repos.listCommits({ owner, repo, per_page: 10 }),
      octo.pulls.list({ owner, repo, state: 'open', per_page: 20, sort: 'updated' }),
      octo.actions.listWorkflowRunsForRepo({ owner, repo, per_page: 8 }).catch(() => ({
        data: { workflow_runs: [] as Array<Record<string, unknown>> },
      })),
    ])

    return NextResponse.json({
      repo: {
        name: info.data.name,
        fullName: info.data.full_name,
        description: info.data.description,
        defaultBranch: info.data.default_branch,
        htmlUrl: info.data.html_url,
        private: info.data.private,
        language: info.data.language,
        stargazers: info.data.stargazers_count,
        forks: info.data.forks_count,
        openIssues: info.data.open_issues_count,
        pushedAt: info.data.pushed_at,
      },
      branches: branches.data.map((b) => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected,
      })),
      commits: commits.data.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        authorName: c.commit.author?.name ?? c.author?.login ?? 'unknown',
        authorLogin: c.author?.login ?? null,
        authorAvatar: c.author?.avatar_url ?? null,
        date: c.commit.author?.date ?? c.commit.committer?.date ?? null,
        htmlUrl: c.html_url,
      })),
      pulls: prs.data.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        draft: p.draft ?? false,
        authorLogin: p.user?.login,
        authorAvatar: p.user?.avatar_url,
        head: p.head.ref,
        base: p.base.ref,
        updatedAt: p.updated_at,
        htmlUrl: p.html_url,
      })),
      runs: (runs.data.workflow_runs as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        name: r.name ?? r.display_title ?? 'workflow',
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        sha: (r.head_sha as string | undefined)?.slice(0, 7),
        createdAt: r.created_at,
        htmlUrl: r.html_url,
        event: r.event,
      })),
    })
  } catch (err) {
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return handleErr(err)
  }
}

function handleErr(err: unknown) {
  const msg = err instanceof Error ? err.message : 'unknown'
  if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (msg === 'github_token_missing')
    return NextResponse.json({ error: 'github_token_missing' }, { status: 403 })
  console.error(err)
  return NextResponse.json({ error: msg }, { status: 500 })
}
