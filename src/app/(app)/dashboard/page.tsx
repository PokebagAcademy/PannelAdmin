import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user!.id!
  const role = (session!.user as { role?: string }).role ?? 'viewer'

  const [machineCount, accessibleMachines, recentAudit] = await Promise.all([
    role === 'admin'
      ? prisma.machine.count()
      : prisma.machine.count({ where: { permissions: { some: { userId } } } }),
    role === 'admin'
      ? prisma.machine.findMany({ orderBy: { createdAt: 'desc' }, take: 4 })
      : prisma.machine.findMany({
          where: { permissions: { some: { userId } } },
          orderBy: { createdAt: 'desc' },
          take: 4,
        }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { name: true, image: true } } },
    }),
  ])

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <header className="mb-12 animate-reveal">
        <p className="mono-caps text-xs text-amber mb-3">// dashboard</p>
        <h1 className="font-display text-5xl text-ink-100 mb-2">
          Bonjour {session!.user?.name?.split(' ')[0]}<span className="text-amber">.</span>
        </h1>
        <p className="text-ink-400">Vue d&apos;ensemble de votre infrastructure Cobblemon.</p>
      </header>

      <section className="grid md:grid-cols-3 gap-px bg-ink-700 border border-ink-700 mb-12 animate-reveal">
        <Tile n={machineCount} label="machines accessibles" accent="amber" />
        <Tile n={0} label="builds en cours" accent="phosphor" hint="phase 5" />
        <Tile n={recentAudit.length} label="actions récentes" accent="ink" />
      </section>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
        <section className="card p-6 animate-reveal" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="mono-caps text-sm text-ink-300">Machines récentes</h2>
            <Link href="/machines" className="mono-caps text-[10px] text-amber hover:underline">
              tout voir →
            </Link>
          </div>
          {accessibleMachines.length === 0 ? (
            <EmptyState role={role} />
          ) : (
            <ul className="divide-y divide-ink-800">
              {accessibleMachines.map((m) => (
                <li key={m.id} className="py-3 flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-phosphor" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-ink-100">{m.name}</div>
                    <div className="text-xs text-ink-500 font-mono truncate">
                      {m.username}@{m.host}:{m.port}
                    </div>
                  </div>
                  <span className="pill">{m.authType}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 animate-reveal" style={{ animationDelay: '0.2s' }}>
          <h2 className="mono-caps text-sm text-ink-300 mb-4">Journal</h2>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-ink-500 font-mono">Aucune activité.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentAudit.map((a) => (
                <li key={a.id} className="font-mono text-xs flex gap-3">
                  <span className="text-ink-500 shrink-0">
                    {new Date(a.createdAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-amber shrink-0">{a.action}</span>
                  <span className="text-ink-400 truncate">
                    {a.user?.name ?? 'system'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Tile({
  n,
  label,
  accent,
  hint,
}: {
  n: number
  label: string
  accent: 'amber' | 'phosphor' | 'ink'
  hint?: string
}) {
  const color = accent === 'amber' ? 'text-amber' : accent === 'phosphor' ? 'text-phosphor' : 'text-ink-200'
  return (
    <div className="bg-ink-900 p-6 relative">
      <div className={`font-display text-5xl ${color}`}>{String(n).padStart(2, '0')}</div>
      <div className="mono-caps text-[10px] text-ink-400 mt-2">{label}</div>
      {hint && <span className="pill absolute top-3 right-3">{hint}</span>}
    </div>
  )
}

function EmptyState({ role }: { role: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-ink-300 mb-2">Aucune machine pour le moment.</p>
      <p className="text-xs text-ink-500 font-mono mb-6">
        {role === 'admin'
          ? 'Ajoutez votre premier minestrator.'
          : "Demandez à un admin de vous donner accès."}
      </p>
      {role === 'admin' && (
        <Link href="/machines/new" className="btn-primary inline-flex">
          + ajouter une machine
        </Link>
      )}
    </div>
  )
}
