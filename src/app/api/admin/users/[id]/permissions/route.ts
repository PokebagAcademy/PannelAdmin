import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

/** GET /api/admin/users/[id]/permissions — full permission map */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin')
    const { id } = await params
    const [machines, perms] = await Promise.all([
      prisma.machine.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.machinePermission.findMany({ where: { userId: id } }),
    ])
    return NextResponse.json({
      machines,
      permissions: Object.fromEntries(perms.map((p) => [p.machineId, p.level])),
    })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}

const setSchema = z.object({
  machineId: z.string(),
  level: z.enum(['none', 'read', 'write', 'admin']),
})

/** PUT /api/admin/users/[id]/permissions */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('admin')
    const { id } = await params
    const body = await req.json()
    const parsed = setSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

    if (parsed.data.level === 'none') {
      await prisma.machinePermission
        .delete({
          where: { userId_machineId: { userId: id, machineId: parsed.data.machineId } },
        })
        .catch(() => {})
    } else {
      await prisma.machinePermission.upsert({
        where: { userId_machineId: { userId: id, machineId: parsed.data.machineId } },
        create: { userId: id, machineId: parsed.data.machineId, level: parsed.data.level },
        update: { level: parsed.data.level },
      })
    }

    await audit({
      userId: session.user.id,
      action: 'admin.user.permission',
      target: `${id}:${parsed.data.machineId}`,
      metadata: { level: parsed.data.level },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
