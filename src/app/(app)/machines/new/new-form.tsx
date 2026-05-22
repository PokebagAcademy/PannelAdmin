'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function NewMachineForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [authType, setAuthType] = useState<'key' | 'password'>('key')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const rconPortRaw = fd.get('rconPort')?.toString().trim()
    const rconPasswordRaw = fd.get('rconPassword')?.toString()
    const rconHostRaw = fd.get('rconHost')?.toString().trim()
    const payload = {
      name: fd.get('name'),
      description: fd.get('description') || null,
      host: fd.get('host'),
      port: Number(fd.get('port')) || 22,
      username: fd.get('username'),
      authType,
      secret: fd.get('secret'),
      // RCON is optional — only send fields if user filled them
      ...(rconPortRaw && rconPasswordRaw
        ? {
            rconHost: rconHostRaw || null,
            rconPort: Number(rconPortRaw),
            rconPassword: rconPasswordRaw,
          }
        : {}),
    }

    start(async () => {
      const res = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Validation échouée.')
        return
      }
      router.push('/machines')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="card p-8 space-y-6 animate-reveal">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="label" htmlFor="name">Nom interne</label>
          <input
            id="name"
            name="name"
            required
            placeholder="minestrator-01"
            className="input"
            pattern="[A-Za-z0-9][A-Za-z0-9\-_]*"
          />
        </div>
        <div>
          <label className="label" htmlFor="port">Port</label>
          <input
            id="port"
            name="port"
            type="number"
            min={1}
            max={65535}
            defaultValue={22}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">Description (optionnel)</label>
        <input
          id="description"
          name="description"
          maxLength={280}
          placeholder="Serveur de dev principal, 8GB RAM, EU-WEST"
          className="input"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="label" htmlFor="host">Hôte / IP</label>
          <input
            id="host"
            name="host"
            required
            placeholder="dev.example.com"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="username">Utilisateur SSH</label>
          <input
            id="username"
            name="username"
            required
            placeholder="minecraft"
            className="input"
          />
        </div>
      </div>

      <div>
        <div className="label">Méthode d&apos;authentification</div>
        <div className="grid grid-cols-2 gap-px bg-ink-700 border border-ink-700">
          <button
            type="button"
            onClick={() => setAuthType('key')}
            className={`p-3 mono-caps text-xs transition-colors ${
              authType === 'key'
                ? 'bg-ink-700 text-amber'
                : 'bg-ink-900 text-ink-400 hover:text-ink-200'
            }`}
          >
            clé ssh (recommandé)
          </button>
          <button
            type="button"
            onClick={() => setAuthType('password')}
            className={`p-3 mono-caps text-xs transition-colors ${
              authType === 'password'
                ? 'bg-ink-700 text-amber'
                : 'bg-ink-900 text-ink-400 hover:text-ink-200'
            }`}
          >
            mot de passe
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="secret">
          {authType === 'key' ? 'Clé privée (PEM, contenu complet)' : 'Mot de passe'}
        </label>
        {authType === 'key' ? (
          <textarea
            id="secret"
            name="secret"
            required
            rows={10}
            placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
            className="input resize-y"
          />
        ) : (
          <input id="secret" name="secret" type="password" required className="input" />
        )}
        <p className="mt-2 text-[10px] text-ink-500 font-mono">
          Stocké chiffré AES-256-GCM. Jamais affiché en clair après sauvegarde.
        </p>
      </div>

      {error && (
        <div className="border border-rust/40 bg-rust/5 p-3 rounded-sm font-mono text-sm text-rust">
          {error}
        </div>
      )}

      <details className="border border-ink-800 rounded-sm">
        <summary className="px-4 py-3 cursor-pointer mono-caps text-xs text-amber hover:bg-ink-800/40 transition-colors">
          // rcon (optionnel)
        </summary>
        <div className="p-4 border-t border-ink-800 space-y-4">
          <p className="text-xs text-ink-400 font-mono leading-relaxed">
            Active Minecraft Remote Console pour piloter le serveur depuis le
            panel (console interactive + tool MCP pour Claude). Laisse vide si
            tu ne veux pas configurer RCON maintenant.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="rconHost">RCON host (optionnel)</label>
              <input
                id="rconHost"
                name="rconHost"
                placeholder="défaut = host SFTP"
                className="input"
              />
              <p className="mt-1 text-[10px] text-ink-500 font-mono">
                Souvent identique au host SFTP. Laisse vide si c&apos;est le cas.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="rconPort">RCON port</label>
              <input
                id="rconPort"
                name="rconPort"
                type="number"
                min="1"
                max="65535"
                placeholder="25575"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="rconPassword">RCON password</label>
            <input
              id="rconPassword"
              name="rconPassword"
              type="password"
              autoComplete="off"
              className="input"
            />
            <p className="mt-1 text-[10px] text-ink-500 font-mono">
              Celui que tu as mis dans <code className="text-amber">server.properties</code> →{' '}
              <code className="text-amber">rcon.password</code>. Stocké chiffré.
            </p>
          </div>
        </div>
      </details>

      <div className="flex justify-end gap-3 pt-4 border-t border-ink-800">
        <button
          type="button"
          onClick={() => router.push('/machines')}
          className="btn-ghost"
        >
          annuler
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'sauvegarde…' : 'enregistrer'}
        </button>
      </div>
    </form>
  )
}
