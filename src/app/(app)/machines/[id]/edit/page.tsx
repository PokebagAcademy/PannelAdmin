import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EditMachineForm } from './edit-form'

export default async function EditMachinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (role !== 'admin') redirect('/machines')

  const { id } = await params
  const machine = await prisma.machine.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      host: true,
      port: true,
      username: true,
      authType: true,
      rconHost: true,
      rconPort: true,
      rconPasswordEnc: true,
    },
  })
  if (!machine) redirect('/machines')

  return (
    <div className="p-8 lg:p-12 max-w-3xl">
      <header className="mb-8 animate-reveal">
        <Link
          href="/machines"
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← machines
        </Link>
        <p className="mono-caps text-xs text-amber mt-6 mb-3">// éditer</p>
        <h1 className="font-display text-5xl text-ink-100">{machine.name}</h1>
        <p className="text-ink-400 mt-2 font-mono text-sm">
          {machine.username}@{machine.host}:{machine.port}
        </p>
      </header>

      <EditMachineForm
        machine={{
          id: machine.id,
          name: machine.name,
          description: machine.description,
          host: machine.host,
          port: machine.port,
          username: machine.username,
          authType: machine.authType,
          rconHost: machine.rconHost,
          rconPort: machine.rconPort,
          hasRcon: !!machine.rconPasswordEnc,
        }}
      />
    </div>
  )
}
