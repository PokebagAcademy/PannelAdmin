'use client'

import { useEffect, useState } from 'react'

type AuditItem = {
  id: string
  action: string
  target: string | null
  metadata: unknown
  createdAt: string
  user: { name: string | null; image: string | null; githubLogin: string | null } | null
}

type Filters = {
  users: { id: string; label: string }[]
  topActions: { action: string; count: number }[]
}

export function AuditView() {
  const [items, setItems] = useState<AuditItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Filter state
  const [fUser, setFUser] = useState('')
  const [fAction, setFAction] = useState('')
  const [fQuery, setFQuery] = useState('')
  const [qInput, setQInput] = useState('')

  async function load(reset = true) {
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (fUser) params.set('user', fUser)
      if (fAction) params.set('action', fAction)
      if (fQuery) params.set('q', fQuery)
      if (!reset && nextCursor) params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/audit?${params}`)
      const data = await res.json()
      if (reset) setItems(data.items)
      else setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
      setFilters(data.filters)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fUser, fAction, fQuery])

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setFQuery(qInput.trim())
          }}
          className="flex items-center gap-3"
        >
          <div className="relative flex-1 max-w-md">
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="filtrer (action ou target)…"
              className="input pl-9"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 font-mono text-sm">
              ⌕
            </span>
          </div>
          {(fUser || fAction || fQuery) && (
            <button
              type="button"
              onClick={() => {
                setFUser('')
                setFAction('')
                setFQuery('')
                setQInput('')
              }}
              className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
            >
              ✕ réinitialiser
            </button>
          )}
        </form>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center mono-caps text-[10px] text-ink-500">
              chargement<span className="blink" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-ink-500 font-mono">
              Aucune entrée.
            </div>
          ) : (
            <ul className="divide-y divide-ink-800">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      const next = new Set(expanded)
                      if (next.has(item.id)) next.delete(item.id)
                      else next.add(item.id)
                      setExpanded(next)
                    }}
                    className="w-full text-left px-5 py-3 hover:bg-ink-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="mono-caps text-[10px] text-ink-500 w-32 shrink-0">
                        {formatDateTime(item.createdAt)}
                      </span>
                      <ActionPill action={item.action} />
                      <span className="font-mono text-xs text-ink-300 truncate flex-1">
                        {item.target ?? '—'}
                      </span>
                      <span className="font-mono text-[10px] text-ink-500 shrink-0 w-32 text-right truncate">
                        {item.user?.name ?? item.user?.githubLogin ?? 'system'}
                      </span>
                    </div>
                    {expanded.has(item.id) && item.metadata != null && (
                      <pre className="mt-3 ml-32 p-3 bg-ink-950 border border-ink-800 rounded-sm text-[10px] text-ink-300 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {nextCursor && (
          <div className="text-center">
            <button
              onClick={() => load(false)}
              disabled={loadingMore}
              className="btn-ghost"
            >
              {loadingMore ? 'chargement…' : 'charger plus'}
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        {filters && (
          <>
            <div className="card p-5">
              <h3 className="mono-caps text-xs text-amber mb-3">// filtrer par user</h3>
              <ul className="space-y-1.5 font-mono text-xs">
                <li>
                  <button
                    onClick={() => setFUser('')}
                    className={`hover:text-amber transition-colors ${
                      fUser === '' ? 'text-amber' : 'text-ink-300'
                    }`}
                  >
                    tous
                  </button>
                </li>
                {filters.users.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => setFUser(u.id)}
                      className={`hover:text-amber transition-colors truncate ${
                        fUser === u.id ? 'text-amber' : 'text-ink-300'
                      }`}
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-5">
              <h3 className="mono-caps text-xs text-amber mb-3">// actions fréquentes</h3>
              <ul className="space-y-1.5 font-mono text-xs">
                <li>
                  <button
                    onClick={() => setFAction('')}
                    className={`hover:text-amber transition-colors ${
                      fAction === '' ? 'text-amber' : 'text-ink-300'
                    }`}
                  >
                    toutes
                  </button>
                </li>
                {filters.topActions.map((a) => (
                  <li key={a.action} className="flex justify-between gap-2">
                    <button
                      onClick={() => setFAction(a.action)}
                      className={`hover:text-amber transition-colors truncate ${
                        fAction === a.action ? 'text-amber' : 'text-ink-300'
                      }`}
                    >
                      {a.action}
                    </button>
                    <span className="text-ink-500">{a.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 mono-caps text-[9px] text-ink-500">
                préfixes utiles : sftp.*, github.*, mcp.*, admin.*
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function ActionPill({ action }: { action: string }) {
  const cat = action.split('.')[0]
  const className =
    cat === 'admin'
      ? 'pill-warn'
      : cat === 'mcp'
      ? 'pill-ok'
      : cat === 'sftp'
      ? 'pill'
      : cat === 'github'
      ? 'pill border-phosphor/40 text-phosphor'
      : cat === 'machine' || cat === 'anthropic'
      ? 'pill'
      : 'pill'
  return <span className={`${className} shrink-0`}>{action}</span>
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  if (sameDay)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
