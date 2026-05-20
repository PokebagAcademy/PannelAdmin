'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Repo = {
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

type Sort = 'updated' | 'name' | 'stars'

export function RepoList({ canCreate }: { canCreate: boolean }) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('updated')

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('sort', sort)
    fetch(`/api/github/repos?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.hint ?? data.error)
        else {
          setRepos(data.repos)
          setTotal(data.total)
          setError(null)
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [q, sort])

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filtrer par nom…"
            className="input pl-9"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 font-mono text-sm">
            ⌕
          </span>
        </div>
        <div className="flex items-center gap-px bg-ink-700 border border-ink-700 text-[10px]">
          {(['updated', 'name', 'stars'] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`mono-caps py-1.5 px-3 transition-colors ${
                sort === s
                  ? 'bg-ink-700 text-amber'
                  : 'bg-ink-900 text-ink-400 hover:text-ink-200'
              }`}
            >
              {s === 'updated' ? 'récents' : s === 'name' ? 'a→z' : '★'}
            </button>
          ))}
        </div>
        <span className="mono-caps text-[10px] text-ink-500 ml-auto">
          {repos.length}/{total}
        </span>
      </div>

      {loading ? (
        <div className="card p-12 text-center mono-caps text-[10px] text-ink-500">
          lecture des repos<span className="blink" />
        </div>
      ) : error ? (
        <div className="card p-6 border-rust/40">
          <div className="mono-caps text-[10px] text-rust mb-2">erreur</div>
          <p className="text-sm text-ink-200">{error}</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="font-display text-2xl text-ink-200 mb-2">Aucun repo</p>
          <p className="text-sm text-ink-500 font-mono">
            {q
              ? 'Aucun résultat pour ce filtre.'
              : "L'organisation n'a aucun repo accessible."}
          </p>
          {canCreate && !q && (
            <Link href="/github/new" className="btn-primary inline-flex mt-6">
              + créer le premier
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-px bg-ink-700 border border-ink-700 animate-reveal">
          {repos.map((r) => (
            <li key={r.id} className="bg-ink-900">
              <Link
                href={`/github/${r.owner}/${r.name}`}
                className="block p-5 hover:bg-ink-800/60 transition-colors group h-full"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-ink-100 group-hover:text-amber transition-colors truncate">
                        {r.name}
                      </span>
                      {r.private && <span className="pill">private</span>}
                      {r.archived && <span className="pill-warn">archived</span>}
                    </div>
                  </div>
                  <span className="mono-caps text-[9px] text-ink-500 shrink-0">
                    {formatTimeAgo(r.updatedAt)}
                  </span>
                </div>
                {r.description && (
                  <p className="text-xs text-ink-400 mb-3 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>
                )}
                <div className="flex items-center gap-4 font-mono text-[10px] text-ink-500">
                  {r.language && (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: langColor(r.language) }}
                      />
                      {r.language}
                    </span>
                  )}
                  {r.stargazers > 0 && <span>★ {r.stargazers}</span>}
                  {r.forks > 0 && <span>⑂ {r.forks}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}j`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}a`
}

function langColor(lang: string): string {
  const colors: Record<string, string> = {
    Kotlin: '#7fd396',
    Java: '#d8a04a',
    TypeScript: '#7fd396',
    JavaScript: '#e6b667',
    Python: '#7fd396',
    Rust: '#c4523a',
    Go: '#9aa39a',
    HTML: '#c4523a',
    CSS: '#d8a04a',
    Shell: '#9aa39a',
  }
  return colors[lang] ?? '#6a736a'
}
