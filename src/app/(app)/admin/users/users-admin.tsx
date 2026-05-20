'use client'

import { useEffect, useState, useTransition } from 'react'

type User = {
  id: string
  name: string | null
  email: string
  image: string | null
  githubLogin: string | null
  role: 'admin' | 'dev' | 'viewer'
  createdAt: string
  permissionCount: number
  lastSession: string | null
}

type Machine = { id: string; name: string }

type Level = 'none' | 'read' | 'write' | 'admin'

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [permsFor, setPermsFor] = useState<User | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'erreur')
      else setUsers(data.users)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function setRole(userId: string, role: 'admin' | 'dev' | 'viewer') {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.hint ?? data.error ?? 'erreur')
      return
    }
    void refresh()
  }

  async function removeUser(u: User) {
    if (!confirm(`Supprimer ${u.name ?? u.email} ? Toutes ses données seront effacées.`))
      return
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.hint ?? data.error ?? 'erreur')
      return
    }
    void refresh()
  }

  if (loading)
    return (
      <div className="card p-12 text-center mono-caps text-[10px] text-ink-500">
        chargement<span className="blink" />
      </div>
    )
  if (error)
    return (
      <div className="card p-6 border-rust/40">
        <p className="text-rust font-mono text-sm">{error}</p>
      </div>
    )

  return (
    <>
      <div className="card overflow-hidden animate-reveal">
        <div className="grid grid-cols-[1fr_120px_100px_100px_180px] gap-4 px-6 py-3 border-b border-ink-800 mono-caps text-[10px] text-ink-400">
          <span>utilisateur</span>
          <span>rôle</span>
          <span>perms</span>
          <span>créé</span>
          <span className="text-right">actions</span>
        </div>
        <ul className="divide-y divide-ink-800">
          {users.map((u) => (
            <li
              key={u.id}
              className="grid grid-cols-[1fr_120px_100px_100px_180px] gap-4 px-6 py-3 items-center hover:bg-ink-800/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {u.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.image}
                    alt=""
                    className="w-8 h-8 rounded-full border border-ink-700"
                  />
                )}
                <div className="min-w-0">
                  <div className="font-mono text-sm text-ink-100 truncate">
                    {u.name ?? u.githubLogin ?? u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 mono-caps text-[9px] text-amber">(toi)</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-ink-500 truncate">
                    {u.githubLogin ? `@${u.githubLogin}` : u.email}
                  </div>
                </div>
              </div>
              <div>
                <RoleSelect
                  value={u.role}
                  disabled={u.id === currentUserId}
                  onChange={(r) => setRole(u.id, r)}
                />
              </div>
              <div>
                <button
                  onClick={() => setPermsFor(u)}
                  className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
                  title="Gérer les permissions par machine"
                >
                  {u.permissionCount} →
                </button>
              </div>
              <div className="font-mono text-[10px] text-ink-500">
                {formatDate(u.createdAt)}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => removeUser(u)}
                  disabled={u.id === currentUserId}
                  className="btn-danger text-[10px] py-1 px-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  del
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {permsFor && (
        <PermissionsModal
          user={permsFor}
          onClose={() => {
            setPermsFor(null)
            void refresh()
          }}
        />
      )}
    </>
  )
}

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: 'admin' | 'dev' | 'viewer'
  disabled: boolean
  onChange: (r: 'admin' | 'dev' | 'viewer') => void
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as 'admin' | 'dev' | 'viewer')}
      className={`input py-1 text-[11px] ${
        value === 'admin'
          ? 'text-amber border-amber/40'
          : value === 'dev'
          ? 'text-phosphor border-phosphor/40'
          : ''
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <option value="admin">admin</option>
      <option value="dev">dev</option>
      <option value="viewer">viewer</option>
    </select>
  )
}

function PermissionsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [machines, setMachines] = useState<Machine[]>([])
  const [perms, setPerms] = useState<Record<string, Level>>({})
  const [loading, setLoading] = useState(true)
  const [pending, start] = useTransition()

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/permissions`)
      .then((r) => r.json())
      .then((d) => {
        setMachines(d.machines)
        setPerms(d.permissions)
      })
      .finally(() => setLoading(false))
  }, [user.id])

  function update(machineId: string, level: Level) {
    setPerms((p) => ({ ...p, [machineId]: level }))
    start(async () => {
      await fetch(`/api/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machineId, level }),
      })
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card p-6 max-w-2xl w-full animate-reveal"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="mono-caps text-[10px] text-amber mb-1">// permissions</p>
            <h3 className="font-display text-2xl text-ink-100">
              {user.name ?? user.githubLogin}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="mono-caps text-[10px] text-ink-500 hover:text-amber"
          >
            ✕
          </button>
        </div>

        {user.role === 'admin' && (
          <div className="bg-amber/5 border border-amber/20 p-3 mb-4 rounded-sm text-xs text-ink-300 font-mono">
            ⚠ Cet utilisateur est <strong>admin</strong> : il a accès à toutes les
            machines indépendamment des permissions ci-dessous.
          </div>
        )}

        {loading ? (
          <div className="mono-caps text-[10px] text-ink-500">
            chargement<span className="blink" />
          </div>
        ) : machines.length === 0 ? (
          <p className="text-sm text-ink-500 font-mono">Aucune machine déclarée.</p>
        ) : (
          <div className="space-y-2">
            {machines.map((m) => {
              const level = perms[m.id] ?? 'none'
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 py-2 border-b border-ink-800 last:border-0"
                >
                  <span className="font-mono text-sm text-ink-100 flex-1">{m.name}</span>
                  <div className="flex gap-px bg-ink-700 border border-ink-700">
                    {(['none', 'read', 'write', 'admin'] as Level[]).map((l) => (
                      <button
                        key={l}
                        onClick={() => update(m.id, l)}
                        disabled={pending}
                        className={`px-2.5 py-1 mono-caps text-[10px] transition-colors ${
                          level === l
                            ? 'bg-ink-700 text-amber'
                            : 'bg-ink-900 text-ink-400 hover:text-ink-200'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-ink-800 mono-caps text-[9px] text-ink-500">
          changements sauvegardés automatiquement
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}
