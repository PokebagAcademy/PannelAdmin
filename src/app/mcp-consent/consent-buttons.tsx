'use client'

import { useState } from 'react'

export function ConsentButtons({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  codeChallengeMethod,
  scope,
}: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  codeChallengeMethod: string
  scope: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: 'allow' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp/oauth/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          scope,
          action,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(`${data.error ?? 'Erreur'}: ${data.hint ?? res.statusText}`)
        setBusy(false)
        return
      }

      if (data.redirect_to) {
        window.location.href = data.redirect_to
      } else {
        setError('Pas d\'URL de redirection retournée par le serveur.')
        setBusy(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 border border-rust/40 bg-rust/5 p-3 rounded-sm font-mono text-xs text-rust">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => submit('deny')}
          disabled={busy}
          className="btn-danger disabled:opacity-50"
        >
          refuser
        </button>
        <button
          type="button"
          onClick={() => submit('allow')}
          disabled={busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? '…' : 'autoriser'}
        </button>
      </div>
    </>
  )
}
