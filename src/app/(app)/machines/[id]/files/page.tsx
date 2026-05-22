import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FileExplorer } from './file-explorer'

export default async function MachineFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ path?: string }>
}) {
  const { id } = await params
  const { path } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const role = (session.user as { role?: string }).role ?? 'viewer'

  const machine = await prisma.machine.findUnique({ where: { id } })
  if (!machine) notFound()

  // Permission check
  let canWrite = role === 'admin'
  if (role !== 'admin') {
    const perm = await prisma.machinePermission.findUnique({
      where: { userId_machineId: { userId, machineId: id } },
    })
    if (!perm) redirect('/machines')
    canWrite = perm.level === 'write' || perm.level === 'admin'
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b border-ink-800 flex items-center justify-between gap-6 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/machines"
            className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors shrink-0"
          >
            ← machines
          </Link>
          <div className="w-px h-6 bg-ink-700 shrink-0" />
          <div className="min-w-0">
            <p className="mono-caps text-[10px] text-amber">// sftp browser</p>
            <h1 className="font-display text-2xl text-ink-100 truncate">{machine.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="pill">
            {machine.username}@{machine.host}:{machine.port}
          </span>
          {!canWrite && <span className="pill-warn">read-only</span>}
          <Link
            href={`/machines/${id}/console`}
            className="mono-caps text-[10px] text-phosphor border border-phosphor/40 hover:bg-phosphor hover:text-ink-950 px-2 py-1 rounded-sm transition-colors"
          >
            console rcon →
          </Link>
        </div>
      </header>

      <FileExplorer machineId={id} canWrite={canWrite} initialPath={path ?? '.'} />
    </div>
  )
}
