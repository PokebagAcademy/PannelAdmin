import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RepoList } from './repo-list'

export default async function GithubPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as { role?: string }).role ?? 'viewer'

  const install = await prisma.githubAppInstallation.findFirst()
  const appConfigured = !!process.env.GITHUB_APP_ID && !!install

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-6 animate-reveal">
        <div>
          <p className="mono-caps text-xs text-amber mb-3">// version control</p>
          <h1 className="font-display text-5xl text-ink-100">GitHub</h1>
          <p className="text-ink-400 mt-2">
            Repos de l&apos;organisation, accessibles selon tes permissions GitHub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role !== 'viewer' && appConfigured && (
            <Link href="/github/new" className="btn-primary">
              + nouveau repo
            </Link>
          )}
        </div>
      </header>

      {!appConfigured && (
        <div className="card p-6 mb-8 border-amber/40">
          <div className="flex items-start gap-4">
            <div className="mono-caps text-[10px] text-amber pt-1">⚠ setup</div>
            <div className="flex-1">
              <h2 className="font-display text-xl text-ink-100 mb-2">
                GitHub App non installée
              </h2>
              <p className="text-sm text-ink-400 leading-relaxed mb-4">
                Tu peux déjà parcourir les repos en lecture (avec ton token user), mais
                pour créer des repos ou ouvrir des PRs depuis le panel, installe la
                GitHub App de Cobblepanel sur ton organisation.
              </p>
              {role === 'admin' && (
                <Link
                  href="/settings/github"
                  className="btn-primary inline-flex text-[10px] py-1.5"
                >
                  configurer
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <RepoList canCreate={role !== 'viewer' && appConfigured} />
    </div>
  )
}
