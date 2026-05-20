import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { testConnection } from '@/lib/ssh'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await requireAuth()
    const role = (session.user as { role?: string }).role ?? 'viewer'

    const machine = await prisma.machine.findUnique({ where: { id } })
    if (!machine) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (role !== 'admin') {
      const perm = await prisma.machinePermission.findUnique({
        where: { userId_machineId: { userId: session.user.id!, machineId: id } },
      })
      if (!perm) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const result = await testConnection({
      host: machine.host,
      port: machine.port,
      username: machine.username,
      authType: machine.authType,
      secret: { enc: machine.secretEnc, iv: machine.secretIv, tag: machine.secretTag },
    })

    // Log diagnostics server-side to help debug too
    console.log(`[machine.test ${machine.name}]`, result.diagnostics)

    await audit({
      userId: session.user.id,
      action: 'machine.test',
      target: machine.id,
      metadata: { ok: result.ok },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
