'use client'

import { useEffect, useState } from 'react'

type Detail = {
  repo: {
    name: string
    fullName: string
    description: string | null
    defaultBranch: string
    htmlUrl: string
    private: boolean
    language: string | null
    stargazers: number
    forks: number
    openIssues: number
    pushedAt: string | null
  }
  branches: Array<{ name: string; sha: string; protected: boolean }>
  commits: Array<{
    sha: string
    message: string
    authorName: string
    authorLogin: string | null
    authorAvatar: string | null
    date: string | null
    htmlUrl: string
  }>
  pulls: Array<{
    number: number
    title: string
    state: string
    draft: boolean
    authorLogin?: string
    authorAvatar?: string
    head: string
    base: string
    updatedAt: string
    htmlUrl: string
  }>
  runs: Array<{
    id: number
    name: string
    status: string | null
    conclusion: string | null
    branch: string | null
    sha: string | null
    createdAt: string | null
    htmlUrl: string
    event: string | null
  }>
}

export function RepoDetail({ owner, repo }: { owner: string; repo: string }) {
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/github/repos/${owner}/${repo}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch((e) => setError(e.message))
  }, [owner, repo])

  if (error)
    return (
      <div className="card p-6 border-rust/40">
        <div className="mono-caps text-[10px] text-rust mb-2">erreur</div>
        <p className="text-sm text-ink-200">
          {error === 'not_found' ? 'Repo introuvable ou accès refusé.' : error}
        </p>
      </div>
    )

  if (!data)
    return (
      <div className="card p-12 text-center mono-caps text-[10px] text-ink-500">
        chargement<span className="blink" />
      </div>
    )

  return (
    <div className="space-y-8 animate-reveal">
      {/* Overview */}
      <div className="card p-6">
        {data.repo.description && (
          <p className="text-ink-300 mb-4">{data.repo.description}</p>
        )}
        <div className="flex items-center gap-4 mono-caps text-[10px] text-ink-400 flex-wrap">
          {data.repo.private && <span className="pill">private</span>}
          {data.repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-phosphor" />
              {data.repo.language}
            </span>
          )}
          <span>★ {data.repo.stargazers}</span>
          <span>⑂ {data.repo.forks}</span>
          {data.repo.openIssues > 0 && <span>{data.repo.openIssues} issues</span>}
          <span className="ml-auto text-ink-500">
            default: <span className="text-amber">{data.repo.defaultBranch}</span>
          </span>
          <a
            href={data.repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-amber hover:underline"
          >
            ouvrir sur github →
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Commits */}
        <section className="card p-6">
          <h2 className="mono-caps text-xs text-amber mb-4">
            // derniers commits ({data.commits.length})
          </h2>
          {data.commits.length === 0 ? (
            <p className="text-sm text-ink-500 font-mono">Aucun commit.</p>
          ) : (
            <ul className="space-y-3">
              {data.commits.map((c) => (
                <li key={c.sha} className="border-l-2 border-ink-700 pl-4 py-1">
                  <a
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block group"
                  >
                    <div className="font-mono text-sm text-ink-100 group-hover:text-amber transition-colors line-clamp-2">
                      {c.message.split('\n')[0]}
                    </div>
                    <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-ink-500">
                      <span className="text-amber">{c.sha.slice(0, 7)}</span>
                      <span>·</span>
                      <span>{c.authorLogin ?? c.authorName}</span>
                      {c.date && (
                        <>
                          <span>·</span>
                          <span>{formatTimeAgo(c.date)}</span>
                        </>
                      )}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sidebar — PRs + branches + workflows */}
        <aside className="space-y-6">
          <section className="card p-6">
            <h2 className="mono-caps text-xs text-amber mb-4">
              // pull requests ouvertes ({data.pulls.length})
            </h2>
            {data.pulls.length === 0 ? (
              <p className="text-sm text-ink-500 font-mono">Rien d&apos;ouvert.</p>
            ) : (
              <ul className="space-y-2">
                {data.pulls.map((p) => (
                  <li key={p.number}>
                    <a
                      href={p.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block py-1 group"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={p.draft ? 'pill' : 'pill-ok'}
                        >
                          #{p.number}
                        </span>
                        <span className="font-mono text-xs text-ink-100 group-hover:text-amber transition-colors truncate">
                          {p.title}
                        </span>
                      </div>
                      <div className="font-mono text-[9px] text-ink-500 mt-1 pl-1">
                        {p.head} → {p.base} · {p.authorLogin}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mono-caps text-xs text-amber mb-4">
              // branches ({data.branches.length})
            </h2>
            <ul className="space-y-1.5 font-mono text-xs">
              {data.branches.slice(0, 8).map((b) => (
                <li key={b.name} className="flex items-center gap-2">
                  <span className="text-ink-500">⌥</span>
                  <span className={b.name === data.repo.defaultBranch ? 'text-amber' : 'text-ink-200'}>
                    {b.name}
                  </span>
                  {b.protected && <span className="pill ml-auto">protected</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="mono-caps text-xs text-amber mb-4">
              // workflows ({data.runs.length})
            </h2>
            {data.runs.length === 0 ? (
              <p className="text-sm text-ink-500 font-mono">Aucun run.</p>
            ) : (
              <ul className="space-y-2">
                {data.runs.map((r) => (
                  <li key={r.id}>
                    <a
                      href={r.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block group"
                    >
                      <div className="flex items-center gap-2">
                        <RunStatus
                          status={r.status}
                          conclusion={r.conclusion}
                        />
                        <span className="font-mono text-xs text-ink-200 group-hover:text-amber transition-colors truncate">
                          {r.name}
                        </span>
                      </div>
                      <div className="font-mono text-[9px] text-ink-500 mt-0.5 pl-5">
                        {r.branch} · {r.sha} · {r.event}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function RunStatus({
  status,
  conclusion,
}: {
  status: string | null
  conclusion: string | null
}) {
  if (status === 'in_progress' || status === 'queued')
    return <span className="w-3 h-3 rounded-full bg-amber animate-pulse shrink-0" />
  if (conclusion === 'success')
    return <span className="w-3 h-3 rounded-full bg-phosphor shrink-0" />
  if (conclusion === 'failure' || conclusion === 'cancelled')
    return <span className="w-3 h-3 rounded-full bg-rust shrink-0" />
  return <span className="w-3 h-3 rounded-full bg-ink-600 shrink-0" />
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `il y a ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR')
}
