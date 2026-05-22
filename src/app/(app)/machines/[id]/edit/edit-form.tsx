'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Machine = {
  id: string
  name: string
  description: string | null
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
  rconHost: string | null
  rconPort: number | null
  hasRcon: boolean
}

export function EditMachineForm({ machine }: { machine: Machine }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Basic fields
  const [name, setName] = useState(machine.name)
  const [description, setDescription] = useState(machine.description ?? '')
  const [host, setHost] = useState(machine.host)
  const [port, setPort] = useState(String(machine.port))
  const [username, setUsername] = useState(machine.username)

  // SSH secret rotation
  const [rotateSecret, setRotateSecret] = useState(false)
  const [authType, setAuthType] = useState<'key' | 'password'>(machine.authType)
  const [secret, setSecret] = useState('')

  // RCON
  const [rconHost, setRconHost] = useState(machine.rconHost ?? '')
  const [rconPort, setRconPort] = useState(machine.rconPort ? String(machine.rconPort) : '')
  const [rconPassword, setRconPassword] = useState('')
  const [rconClear, setRconClear] = useState(false)
  const [rconTesting, setRconTesting] = useState(false)
  const [rconTestResult, setRconTestResult] = useState<string | null>(null)

  async function testRcon() {
    setRconTesting(true)
    setRconTestResult(null)
    try {
      const body: Record<string, unknown> = {}
      if (rconHost.trim()) body.rconHost = rconHost.trim()
      if (rconPort) body.rconPort = Number(rconPort)
      if (rconPassword) body.rconPassword = rconPassword
      const res = await fetch(`/api/machines/${machine.id}/rcon/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok)
        setRconTestResult(`✓ ok — réponse: ${(data.response ?? '').slice(0, 100) || '(vide)'} (${data.durationMs}ms)`)
      else
        setRconTestResult(`✗ ${data.error ?? 'erreur'}${data.hint ? ' — ' + data.hint : ''}`)
    } catch (err) {
      setRconTestResult(`✗ ${err instanceof Error ? err.message : 'erreur réseau'}`)
    } finally {
      setRconTesting(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const payload: Record<string, unknown> = {
      name,
      description: description || null,
      host,
      port: Number(port),
      username,
    }

    if (rotateSecret && secret) {
      payload.authType = authType
      payload.secret = secret
    }

    if (rconClear) {
      payload.rconClear = true
    } else {
      // Only include fields that have a value or have been emptied intentionally.
      // Empty rconHost → null (= use host SFTP)
      payload.rconHost = rconHost.trim() || null
      if (rconPort) payload.rconPort = Number(rconPort)
      else if (rconPort === '' && machine.rconPort != null) payload.rconPort = null
      if (rconPassword) payload.rconPassword = rconPassword
    }

    start(async () => {
      const res = await fetch(`/api/machines/${machine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Validation échouée.')
        return
      }
      setSaved(true)
      setSecret('')
      setRconPassword('')
      setRotateSecret(false)
      router.refresh()
      setTimeout(() => setSaved(false), 3000)
    })
  }

  async function deleteMachine() {
    if (!confirm(`Supprimer définitivement la machine "${machine.name}" ? Toutes les permissions et logs associés seront effacés.`))
      return
    const res = await fetch(`/api/machines/${machine.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/machines')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Suppression échouée')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Identity */}
      <section className="card p-6 space-y-4 animate-reveal">
        <h2 className="mono-caps text-xs text-amber">// identité</h2>
        <div>
          <label className="label" htmlFor="name">Nom interne</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            pattern="^[a-z0-9][a-z0-9-_]*$"
            className="input font-mono"
          />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="ex: Serveur principal Cobblemon"
          />
        </div>
      </section>

      {/* SFTP connection */}
      <section className="card p-6 space-y-4 animate-reveal">
        <h2 className="mono-caps text-xs text-amber">// connexion sftp</h2>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <div>
            <label className="label" htmlFor="host">Host</label>
            <input
              id="host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              className="input font-mono"
            />
          </div>
          <div>
            <label className="label" htmlFor="port">Port</label>
            <input
              id="port"
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
              className="input font-mono"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="input font-mono"
          />
        </div>

        <div className="pt-4 border-t border-ink-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rotateSecret}
              onChange={(e) => setRotateSecret(e.target.checked)}
              className="accent-amber"
            />
            <span className="mono-caps text-[10px] text-ink-300">
              changer la clé / mot de passe SSH
            </span>
          </label>
          <p className="mt-1 text-[10px] text-ink-500 font-mono">
            Le secret actuel ({machine.authType}) n&apos;est jamais ré-affiché. Coche
            pour le remplacer.
          </p>

          {rotateSecret && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    value="key"
                    checked={authType === 'key'}
                    onChange={() => setAuthType('key')}
                    className="accent-amber"
                  />
                  clé privée
                </label>
                <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    value="password"
                    checked={authType === 'password'}
                    onChange={() => setAuthType('password')}
                    className="accent-amber"
                  />
                  mot de passe
                </label>
              </div>
              {authType === 'key' ? (
                <textarea
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  rows={8}
                  required
                  placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                  className="input resize-y font-mono text-xs"
                />
              ) : (
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  required
                  className="input"
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* RCON */}
      <section className="card p-6 space-y-4 animate-reveal">
        <div className="flex items-center justify-between">
          <h2 className="mono-caps text-xs text-amber">// rcon</h2>
          {machine.hasRcon ? (
            <span className="pill-ok">configuré</span>
          ) : (
            <span className="pill">non configuré</span>
          )}
        </div>

        {rconClear ? (
          <div className="border border-rust/40 bg-rust/5 p-3 rounded-sm">
            <p className="text-rust font-mono text-sm mb-2">
              ⚠ La configuration RCON sera effacée à la sauvegarde.
            </p>
            <button
              type="button"
              onClick={() => setRconClear(false)}
              className="btn-ghost text-[10px] py-1 px-3"
            >
              annuler
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px] gap-4">
              <div>
                <label className="label" htmlFor="rconHost">RCON host</label>
                <input
                  id="rconHost"
                  value={rconHost}
                  onChange={(e) => setRconHost(e.target.value)}
                  placeholder={`défaut = ${host}`}
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="label" htmlFor="rconPort">RCON port</label>
                <input
                  id="rconPort"
                  type="number"
                  min="1"
                  max="65535"
                  value={rconPort}
                  onChange={(e) => setRconPort(e.target.value)}
                  placeholder="25575"
                  className="input font-mono"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="rconPassword">
                RCON password{' '}
                {machine.hasRcon && (
                  <span className="text-ink-500 normal-case text-[9px]">
                    (laisse vide pour garder l&apos;actuel)
                  </span>
                )}
              </label>
              <input
                id="rconPassword"
                type="password"
                autoComplete="off"
                value={rconPassword}
                onChange={(e) => setRconPassword(e.target.value)}
                placeholder={machine.hasRcon ? '••••••••' : ''}
                className="input"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={testRcon}
                disabled={rconTesting || (!machine.hasRcon && (!rconPort || !rconPassword))}
                className="btn-ghost text-[10px] py-1 px-3 disabled:opacity-40"
              >
                {rconTesting ? 'test…' : '↻ tester rcon'}
              </button>
              {machine.hasRcon && (
                <button
                  type="button"
                  onClick={() => setRconClear(true)}
                  className="mono-caps text-[10px] text-rust hover:underline"
                >
                  effacer la config rcon
                </button>
              )}
            </div>

            {rconTestResult && (
              <div
                className={`p-3 rounded-sm font-mono text-xs ${
                  rconTestResult.startsWith('✓')
                    ? 'border border-phosphor/40 bg-phosphor/5 text-phosphor'
                    : 'border border-rust/40 bg-rust/5 text-rust'
                }`}
              >
                {rconTestResult}
              </div>
            )}
          </>
        )}
      </section>

      {error && (
        <div className="border border-rust/40 bg-rust/5 p-3 rounded-sm font-mono text-sm text-rust">
          {error}
        </div>
      )}
      {saved && (
        <div className="border border-phosphor/40 bg-phosphor/5 p-3 rounded-sm font-mono text-sm text-phosphor">
          ✓ sauvegardé
        </div>
      )}

      <div className="flex justify-between items-center pt-4">
        <button
          type="button"
          onClick={deleteMachine}
          className="btn-danger"
        >
          supprimer la machine
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/machines')}
            className="btn-ghost"
          >
            annuler
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? 'sauve…' : 'sauvegarder'}
          </button>
        </div>
      </div>
    </form>
  )
}
