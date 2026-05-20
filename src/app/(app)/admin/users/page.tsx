import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { UsersAdmin } from './users-admin'

export default async function AdminUsersPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session || role !== 'admin') redirect('/dashboard')

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <header className="mb-10 animate-reveal">
        <p className="mono-caps text-xs text-amber mb-3">// administration</p>
        <h1 className="font-display text-5xl text-ink-100">Utilisateurs</h1>
        <p className="text-ink-400 mt-2">
          Gestion des rôles et des permissions par machine.
        </p>
      </header>
      <UsersAdmin currentUserId={session.user.id!} />
    </div>
  )
}
