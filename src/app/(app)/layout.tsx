import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as { role?: string }).role ?? 'viewer'

  return (
    <div className="min-h-screen grid lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-0 lg:h-screen border-r border-ink-800 bg-ink-900/40 backdrop-blur-sm flex flex-col">
        <div className="p-6 border-b border-ink-800 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 border border-amber flex items-center justify-center">
            <div className="w-3 h-3 bg-amber" />
          </div>
          <div>
            <div className="mono-caps text-xs text-ink-300">cobblepanel</div>
            <div className="text-[10px] text-ink-400 font-mono">v0.1.0 · phase 1</div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem href="/dashboard" label="Dashboard" hint="vue d'ensemble" />
          <NavItem href="/machines" label="Machines" hint="SSH/SFTP" />
          <NavItem href="/machines" label="Fichiers" hint="browser" />
          <NavItem href="/github" label="GitHub" hint="repos & PRs" />
          <NavItem href="/settings/mcp" label="Claude" hint="mcp connector" />
          <NavItem href="/builds" label="Builds" hint="phase 5" disabled />

          {role === 'admin' && (
            <>
              <div className="pt-6 pb-2 px-3 mono-caps text-[10px] text-ink-500">
                administration
              </div>
              <NavItem href="/admin/users" label="Utilisateurs" hint="rôles & perms" />
              <NavItem href="/admin/audit" label="Audit" hint="journal" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-ink-800 space-y-3 shrink-0">
          <div className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-ink-700 overflow-hidden shrink-0">
              {session.user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-100 truncate">{session.user?.name}</div>
              <div className="flex items-center gap-1.5">
                <span className={role === 'admin' ? 'pill-warn' : role === 'dev' ? 'pill-ok' : 'pill'}>
                  {role}
                </span>
              </div>
            </div>
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="btn-ghost w-full justify-center text-[11px] py-1.5">
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <main className="overflow-x-hidden">{children}</main>
    </div>
  )
}

function NavItem({
  href,
  label,
  hint,
  disabled,
}: {
  href: string
  label: string
  hint: string
  disabled?: boolean
}) {
  const className = disabled
    ? 'flex items-center justify-between px-3 py-2 rounded-sm cursor-not-allowed opacity-40'
    : 'flex items-center justify-between px-3 py-2 rounded-sm hover:bg-ink-800 transition-colors group'
  const Inner = (
    <>
      <span className="text-sm text-ink-100 group-hover:text-amber transition-colors">{label}</span>
      <span className="mono-caps text-[9px] text-ink-500">{hint}</span>
    </>
  )
  if (disabled) return <div className={className}>{Inner}</div>
  return (
    <Link href={href} className={className}>
      {Inner}
    </Link>
  )
}
