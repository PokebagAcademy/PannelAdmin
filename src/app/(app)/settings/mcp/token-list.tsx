'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Token = {
  token: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
}

export function TokenList({ tokens }: { tokens: Token[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  async function revoke(token: string) {
    if (!confirm('Révoquer ce token ? Le client devra se réauthentifier.')) return
    start(async () => {
      await fetch('/api/settings/mcp/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      router.refresh()
    })
  }

  if (tokens.length === 0)
    return (
      <p className="text-sm text-ink-500 font-mono">
        Aucun client Claude connecté pour l&apos;instant.
      </p>
    )

  return (
    <ul className="divide-y divide-ink-800">
      {tokens.map((t) => (
        <li key={t.token} className="py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-ink-100">{t.clientName}</div>
            <div className="font-mono text-[10px] text-ink-500 mt-0.5">
              créé {formatAgo(t.createdAt)} ·{' '}
              {t.lastUsedAt ? `utilisé ${formatAgo(t.lastUsedAt)}` : 'jamais utilisé'}
            </div>
          </div>
          <span className="pill text-[9px]">{t.token.slice(0, 12)}…</span>
          <button
            onClick={() => revoke(t.token)}
            disabled={pending}
            className="btn-danger text-[10px] py-1 px-2"
          >
            revoke
          </button>
        </li>
      ))}
    </ul>
  )
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}
