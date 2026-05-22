import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RconConsole } from './rcon-console'

export default async function MachineConsolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')
  const { id } = await params

  const role = (session.user as { role?: string }).role ?? 'viewer'
  const machine = await prisma.machine.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      host: true,
      rconHost: true,
      rconPort: true,
      rconPasswordEnc: true,
    },
  })
  if (!machine) redirect('/machines')

  // Check perms
  let canWrite = role === 'admin'
  if (!canWrite) {
    const perm = await prisma.machinePermission.findUnique({
      where: { userId_machineId: { userId: session.user.id!, machineId: id } },
    })
    if (!perm) redirect('/machines')
    canWrite = perm.level === 'write' || perm.level === 'admin'
  }

  const rconConfigured = !!(machine.rconPort && machine.rconPasswordEnc)

  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-6 animate-reveal">
        <Link
          href={`/machines/${id}`}
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← {machine.name}
        </Link>
        <p className="mono-caps text-xs text-amber mt-4 mb-2">// console rcon</p>
        <h1 className="font-display text-4xl text-ink-100">{machine.name}</h1>
        <p className="text-ink-400 mt-1 font-mono text-sm">
          {machine.rconHost ?? machine.host}
          {machine.rconPort ? `:${machine.rconPort}` : ''}
        </p>
      </header>

      {!rconConfigured ? (
        <div className="card p-8 max-w-xl animate-reveal">
          <div className="mono-caps text-[10px] text-amber mb-3">// rcon non configuré</div>
          <p className="text-ink-300 text-sm mb-4 leading-relaxed">
            Pour utiliser la console RCON sur cette machine, il faut renseigner
            l&apos;host (optionnel, défaut = host SFTP), le port et le mot de
            passe RCON depuis le serveur Minecraft.
          </p>
          <p className="text-ink-400 font-mono text-xs mb-5 leading-relaxed">
            Dans <code className="text-amber">server.properties</code> :
            <br />
            • <code className="text-amber">enable-rcon=true</code>
            <br />
            • <code className="text-amber">rcon.port=25575</code>
            <br />
            • <code className="text-amber">rcon.password=...</code>
            <br />
            Puis redémarre le serveur Minecraft.
          </p>
          {role === 'admin' ? (
            <Link href={`/machines/${id}/edit`} className="btn-primary inline-flex">
              configurer rcon
            </Link>
          ) : (
            <p className="text-ink-500 font-mono text-xs">
              Demande à un admin de configurer RCON pour cette machine.
            </p>
          )}
        </div>
      ) : !canWrite ? (
        <div className="card p-6 border-amber/40 max-w-xl">
          <div className="mono-caps text-[10px] text-amber mb-2">// lecture seule</div>
          <p className="text-ink-300 text-sm">
            Tu n&apos;as pas les permissions d&apos;écriture sur cette machine,
            la console RCON est inaccessible.
          </p>
        </div>
      ) : (
        <RconConsole machineId={id} machineName={machine.name} />
      )}
    </div>
  )
}
