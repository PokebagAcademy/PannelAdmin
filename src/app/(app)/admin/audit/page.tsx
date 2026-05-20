import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuditView } from './audit-view'

export default async function AuditPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session || role !== 'admin') redirect('/dashboard')

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <header className="mb-8 animate-reveal">
        <p className="mono-caps text-xs text-amber mb-3">// audit</p>
        <h1 className="font-display text-5xl text-ink-100">Journal</h1>
        <p className="text-ink-400 mt-2">
          Chaque action sensible est enregistrée ici : SFTP, GitHub, MCP, admin.
        </p>
      </header>
      <AuditView />
    </div>
  )
}
