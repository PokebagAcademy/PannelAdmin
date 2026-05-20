import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { NewMachineForm } from './new-form'

export default async function NewMachinePage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role !== 'admin') redirect('/machines')

  return (
    <div className="p-8 lg:p-12 max-w-3xl">
      <header className="mb-10 animate-reveal">
        <Link
          href="/machines"
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← retour
        </Link>
        <p className="mono-caps text-xs text-amber mt-6 mb-3">// new machine</p>
        <h1 className="font-display text-5xl text-ink-100">Ajouter un minestrator</h1>
        <p className="text-ink-400 mt-2">
          La clé/mot de passe sera chiffrée AES-256-GCM avant stockage.
        </p>
      </header>

      <NewMachineForm />
    </div>
  )
}
