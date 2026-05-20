import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { forUser, getOrgLogin, cacheGet, cacheSet } from '@/lib/github'

export const runtime = 'nodejs'

/** GET /api/github/repos?q=...&sort=updated|name|stars */
export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim()
    const sort = (url.searchParams.get('sort') ?? 'updated') as 'updated' | 'name' | 'stars'

    const org = getOrgLogin()
    const cacheKey = `repos:${session.user.id}:${org}`

    let repos = cacheGet<RepoSummary[]>(cacheKey)
    if (!repos) {
      const octo = await forUser(session.user.id)
      const all: RepoSummary[] = []
      let page = 1
      // Paginate up to 5 pages of 100 (500 repos max — plenty for now)
      while (page <= 5) {
        const res = await octo.repos.listForOrg({
          org,
          per_page: 100,
          page,
          sort: 'updated',
          type: 'all',
        })
        if (res.data.length === 0) break
        for (const r of res.data) {
          all.push({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description ?? null,
            private: r.private,
            archived: r.archived ?? false,
            language: r.language ?? null,
            stargazers: r.stargazers_count ?? 0,
            forks: r.forks_count ?? 0,
            updatedAt: r.updated_at ?? r.created_at ?? null,
            defaultBranch: r.default_branch ?? 'main',
            htmlUrl: r.html_url,
            owner: r.owner.login,
          })
        }
        if (res.data.length < 100) break
        page++
      }
      repos = all
      cacheSet(cacheKey, repos)
    }

    let filtered = repos
    if (q) filtered = repos.filter((r) => r.name.toLowerCase().includes(q))
    if (sort === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'stars') filtered = [...filtered].sort((a, b) => b.stargazers - a.stargazers)
    else
      filtered = [...filtered].sort(
        (a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0),
      )

    return NextResponse.json({ repos: filtered, total: repos.length })
  } catch (err) {
    return handleErr(err)
  }
}

type RepoSummary = {
  id: number
  name: string
  fullName: string
  description: string | null
  private: boolean
  archived: boolean
  language: string | null
  stargazers: number
  forks: number
  updatedAt: string | null
  defaultBranch: string
  htmlUrl: string
  owner: string
}

function handleErr(err: unknown) {
  const msg = err instanceof Error ? err.message : 'unknown'
  if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (msg === 'github_token_missing')
    return NextResponse.json(
      { error: 'github_token_missing', hint: 'Reconnecte-toi pour rafraîchir le token GitHub.' },
      { status: 403 },
    )
  console.error(err)
  return NextResponse.json({ error: msg }, { status: 500 })
}
