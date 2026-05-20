import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    client_id?: string
    redirect_uri?: string
    state?: string
    code_challenge?: string
    code_challenge_method?: string
    scope?: string
  }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user?.id) {
    const back = new URL('/login', 'http://localhost') // base ignored, we use callbackUrl
    back.searchParams.set('callbackUrl', '/mcp-consent?' + new URLSearchParams(params as Record<string, string>).toString())
    redirect(back.pathname + back.search)
  }

  if (!params.client_id || !params.redirect_uri) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <p className="text-rust font-mono text-sm">Paramètres OAuth manquants.</p>
        </div>
      </div>
    )
  }

  const client = await prisma.mcpOAuthClient.findUnique({
    where: { clientId: params.client_id },
  })
  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <p className="text-rust font-mono text-sm">Client OAuth inconnu.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-lg w-full animate-reveal">
        <div className="mono-caps text-[10px] text-amber mb-3">// autorisation mcp</div>
        <h1 className="font-display text-3xl text-ink-100 mb-2">
          Connecter <span className="text-amber">{client.clientName}</span> ?
        </h1>
        <p className="text-sm text-ink-400 mb-6">
          Cette application demande à se connecter à Cobblepanel en ton nom
          (<span className="text-amber font-mono">{session.user.name}</span>). Elle
          aura accès aux outils suivants :
        </p>

        <ul className="space-y-2 mb-6 bg-ink-950 border border-ink-800 p-4 rounded-sm">
          <ToolRow name="list_machines" desc="liste tes machines SFTP" />
          <ToolRow name="sftp_list / sftp_read" desc="explore et lit des fichiers" />
          <ToolRow name="sftp_write" desc="écrit des fichiers (⚠ destructif)" kind="write" />
          <ToolRow name="sftp_delete" desc="supprime fichiers/dossiers (⚠ destructif)" kind="write" />
          <ToolRow name="list_repos / github_read_file" desc="lit le code GitHub" />
          <ToolRow name="github_commit / github_open_pr" desc="commit & PR (⚠ destructif)" kind="write" />
          <ToolRow name="github_create_repo" desc="crée des repos (⚠ destructif)" kind="write" />
        </ul>

        <div className="bg-amber/5 border border-amber/20 p-3 rounded-sm mb-6 text-xs text-ink-300 font-mono leading-relaxed">
          ⚠ Cette autorisation s&apos;applique à <strong>toutes</strong> tes
          permissions sur le panel. Les actions destructives ne seront pas
          confirmées une seconde fois côté Cobblepanel — Claude te demandera
          confirmation côté client.
        </div>

        <form
          action="/api/mcp/oauth/authorize"
          method="POST"
          className="flex justify-end gap-2"
        >
          <input type="hidden" name="client_id" value={params.client_id} />
          <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
          <input type="hidden" name="state" value={params.state ?? ''} />
          <input type="hidden" name="code_challenge" value={params.code_challenge ?? ''} />
          <input
            type="hidden"
            name="code_challenge_method"
            value={params.code_challenge_method ?? 'S256'}
          />
          <input type="hidden" name="scope" value={params.scope ?? 'mcp'} />
          <button type="submit" name="action" value="deny" className="btn-danger">
            refuser
          </button>
          <button type="submit" name="action" value="allow" className="btn-primary">
            autoriser
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-ink-800 text-[10px] font-mono text-ink-500">
          redirect_uri : <span className="text-ink-300">{params.redirect_uri}</span>
        </div>
      </div>
    </div>
  )
}

function ToolRow({
  name,
  desc,
  kind,
}: {
  name: string
  desc: string
  kind?: 'write'
}) {
  return (
    <li className="flex items-start gap-3 text-xs font-mono">
      <span className={kind === 'write' ? 'text-rust shrink-0' : 'text-phosphor shrink-0'}>
        {kind === 'write' ? '✎' : '◉'}
      </span>
      <div className="min-w-0">
        <div className="text-ink-100">{name}</div>
        <div className="text-ink-500 text-[11px]">{desc}</div>
      </div>
    </li>
  )
}
