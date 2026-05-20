import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TokenList } from './token-list'

export default async function McpSettings() {
  const session = await auth()
  if (!session) redirect('/login')

  const tokens = await prisma.mcpToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { clientName: true } } },
  })

  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const mcpUrl = `${base}/api/mcp`

  return (
    <div className="p-8 lg:p-12 max-w-3xl">
      <header className="mb-10 animate-reveal">
        <p className="mono-caps text-xs text-amber mb-3">// integration</p>
        <h1 className="font-display text-5xl text-ink-100">Claude (MCP)</h1>
        <p className="text-ink-400 mt-2">
          Branche ton Claude perso (Desktop, Code, Web) sur Cobblepanel — il
          aura accès aux mêmes outils SFTP et GitHub que le panel, avec tes
          permissions.
        </p>
      </header>

      <div className="card p-6 mb-6 animate-reveal">
        <h2 className="mono-caps text-xs text-amber mb-4">// url du serveur</h2>
        <div className="bg-ink-950 border border-ink-800 p-4 font-mono text-sm text-amber break-all">
          {mcpUrl}
        </div>
        <p className="mt-3 text-[10px] font-mono text-ink-500">
          C&apos;est l&apos;URL à coller dans Claude. Tu seras redirigé vers
          Cobblepanel pour autoriser une fois — ensuite ton Claude pourra
          appeler les outils.
        </p>
      </div>

      <div className="card p-6 mb-6 animate-reveal">
        <h2 className="mono-caps text-xs text-amber mb-4">// claude.ai (web)</h2>
        <ol className="space-y-2 text-sm text-ink-300 list-decimal pl-5">
          <li>Va sur claude.ai → Settings → Connectors</li>
          <li>
            Click <strong>Add custom connector</strong>
          </li>
          <li>
            Colle l&apos;URL ci-dessus, valide. Le bouton{' '}
            <strong>Connect</strong> ouvre un onglet vers Cobblepanel
          </li>
          <li>Tu te logges (si pas déjà fait) puis tu autorises</li>
          <li>De retour sur Claude, active le connector dans tes conversations</li>
        </ol>
      </div>

      <div className="card p-6 mb-6 animate-reveal">
        <h2 className="mono-caps text-xs text-amber mb-4">// claude desktop / code</h2>
        <p className="text-sm text-ink-300 mb-3">
          Ouvre Claude Desktop → <strong>Settings → Connectors → Add custom connector</strong>{' '}
          et colle l&apos;URL. Pour Claude Code en CLI :
        </p>
        <pre className="bg-ink-950 border border-ink-800 p-3 rounded-sm font-mono text-xs text-amber overflow-x-auto">
{`claude mcp add --transport http cobblepanel ${mcpUrl}`}
        </pre>
      </div>

      <div className="card p-6 animate-reveal">
        <h2 className="mono-caps text-xs text-amber mb-4">
          // sessions actives ({tokens.length})
        </h2>
        <TokenList
          tokens={tokens.map((t) => ({
            token: t.token,
            clientName: t.client.clientName,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            expiresAt: t.expiresAt.toISOString(),
          }))}
        />
      </div>
    </div>
  )
}
