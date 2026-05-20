import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function GithubSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ installed?: string; error?: string }>
}) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session || role !== 'admin') redirect('/github')

  const { installed, error } = await searchParams
  const install = await prisma.githubAppInstallation.findFirst()
  const org = process.env.ALLOWED_GITHUB_ORG ?? 'votre-orga'
  const appSlug = process.env.GITHUB_APP_SLUG // optional, only used for the install URL
  const installUrl = appSlug
    ? `https://github.com/apps/${appSlug}/installations/new`
    : 'https://github.com/settings/apps'

  return (
    <div className="p-8 lg:p-12 max-w-3xl">
      <header className="mb-10 animate-reveal">
        <Link
          href="/github"
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← github
        </Link>
        <p className="mono-caps text-xs text-amber mt-6 mb-3">// settings</p>
        <h1 className="font-display text-5xl text-ink-100">GitHub App</h1>
        <p className="text-ink-400 mt-2">
          Pour créer des repos et automatiser des actions, le panel utilise une
          GitHub App installée sur ton organisation.
        </p>
      </header>

      {installed && (
        <div className="card p-4 mb-6 border-phosphor/40">
          <p className="font-mono text-sm text-phosphor">
            ✓ GitHub App installée avec succès.
          </p>
        </div>
      )}
      {error && (
        <div className="card p-4 mb-6 border-rust/40">
          <p className="font-mono text-sm text-rust">Erreur : {error}</p>
        </div>
      )}

      <div className="card p-6 space-y-6 animate-reveal">
        <section>
          <h2 className="mono-caps text-xs text-amber mb-3">// statut</h2>
          {install ? (
            <div className="bg-ink-950 border border-ink-800 p-4 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-500">org</span>
                <span className="text-amber">{install.orgLogin}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">installation_id</span>
                <span className="text-ink-200">{String(install.installationId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">installée le</span>
                <span className="text-ink-200">
                  {new Date(install.installedAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-400">Pas d&apos;installation détectée.</p>
          )}
        </section>

        <section>
          <h2 className="mono-caps text-xs text-amber mb-3">// procédure d&apos;installation</h2>
          <ol className="space-y-3 text-sm text-ink-300 list-decimal pl-5">
            <li>
              Crée une GitHub App dans les settings de ton organisation{' '}
              <code className="text-amber font-mono text-xs">
                github.com/organizations/{org}/settings/apps/new
              </code>
            </li>
            <li>
              <strong className="text-ink-100">Callback URL</strong> :{' '}
              <code className="text-amber font-mono text-xs">
                {process.env.NEXTAUTH_URL}/api/github/app/install
              </code>
            </li>
            <li>
              <strong className="text-ink-100">Setup URL</strong> : pareil que callback,
              coche <em>Redirect on update</em>.
            </li>
            <li>
              <strong className="text-ink-100">Webhook</strong> : désactivé pour
              l&apos;instant (on l&apos;activera en Phase 5 si besoin).
            </li>
            <li>
              <strong className="text-ink-100">Permissions :</strong>
              <ul className="mt-1 space-y-0.5 list-disc pl-5 text-[13px] text-ink-400">
                <li>Repository: Administration (read/write) — pour créer des repos</li>
                <li>Repository: Contents (read/write) — pour push initial + futurs commits</li>
                <li>Repository: Pull requests (read/write)</li>
                <li>Repository: Actions (read) — voir les builds</li>
                <li>Repository: Metadata (read)</li>
              </ul>
            </li>
            <li>
              Une fois créée, récupère <strong>App ID</strong>, <strong>Client ID</strong>,
              <strong>Client Secret</strong>, et génère une <strong>private key</strong>{' '}
              (PEM). Mets-les en variables d&apos;env (voir{' '}
              <code className="text-amber font-mono text-xs">.env.example</code>).
            </li>
            <li>
              Installe la GitHub App sur l&apos;organisation, choisis les repos (ou tous).
              Tu seras redirigé ici automatiquement.
            </li>
          </ol>
        </section>

        <section className="pt-4 border-t border-ink-800">
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex"
          >
            {install ? 'reconfigurer sur GitHub →' : 'installer la GitHub App →'}
          </a>
        </section>
      </div>
    </div>
  )
}
