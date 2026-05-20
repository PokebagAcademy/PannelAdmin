import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MachineRow } from './machine-row'

export default async function MachinesPage() {
  const session = await auth()
  const userId = session!.user!.id!
  const role = (session!.user as { role?: string }).role ?? 'viewer'

  const machines =
    role === 'admin'
      ? await prisma.machine.findMany({ orderBy: { name: 'asc' } })
      : await prisma.machine.findMany({
          where: { permissions: { some: { userId } } },
          orderBy: { name: 'asc' },
        })

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <header className="mb-10 flex items-end justify-between gap-6 animate-reveal">
        <div>
          <p className="mono-caps text-xs text-amber mb-3">// fleet</p>
          <h1 className="font-display text-5xl text-ink-100">Machines</h1>
          <p className="text-ink-400 mt-2">
            {machines.length} machine{machines.length > 1 ? 's' : ''} sous gestion.
          </p>
        </div>
        {role === 'admin' && (
          <Link href="/machines/new" className="btn-primary">
            + ajouter
          </Link>
        )}
      </header>

      {machines.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="font-display text-2xl text-ink-200 mb-3">Aucune machine.</p>
          <p className="text-sm text-ink-500 font-mono mb-6">
            {role === 'admin'
              ? 'Commencez par déclarer un minestrator.'
              : "Aucun accès accordé pour le moment."}
          </p>
          {role === 'admin' && (
            <Link href="/machines/new" className="btn-primary inline-flex">
              + ajouter une machine
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden animate-reveal">
          <div className="grid grid-cols-[1fr_2fr_120px_140px_180px] gap-4 px-6 py-3 border-b border-ink-800 mono-caps text-[10px] text-ink-400">
            <span>nom</span>
            <span>endpoint</span>
            <span>auth</span>
            <span>statut</span>
            <span className="text-right">actions</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {machines.map((m) => (
              <MachineRow
                key={m.id}
                machine={{
                  id: m.id,
                  name: m.name,
                  description: m.description,
                  host: m.host,
                  port: m.port,
                  username: m.username,
                  authType: m.authType,
                }}
                canDelete={role === 'admin'}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
