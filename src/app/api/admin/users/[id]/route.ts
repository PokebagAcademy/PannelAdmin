import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

const patchSchema = z.object({
  role: z.enum(['admin', 'dev', 'viewer']),
})

/** PATCH /api/admin/users/[id] — change role */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('admin')
    const { id } = await params
    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

    if (id === session.user.id && parsed.data.role !== 'admin') {
      return NextResponse.json(
        { error: 'cannot_demote_self', hint: 'Un autre admin doit te rétrograder.' },
        { status: 400 },
      )
    }

    // Prevent demoting the last admin
    if (parsed.data.role !== 'admin') {
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
      if (target?.role === 'admin') {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } })
        if (adminCount <= 1)
          return NextResponse.json(
            { error: 'last_admin', hint: "Il doit toujours rester au moins un admin." },
            { status: 400 },
          )
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
      select: { id: true, name: true, role: true },
    })
    await audit({
      userId: session.user.id,
      action: 'admin.user.role',
      target: id,
      metadata: { newRole: parsed.data.role },
    })
    return NextResponse.json({ user: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE /api/admin/users/[id] */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('admin')
    const { id } = await params
    if (id === session.user.id)
      return NextResponse.json({ error: 'cannot_delete_self' }, { status: 400 })

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (target?.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } })
      if (adminCount <= 1)
        return NextResponse.json({ error: 'last_admin' }, { status: 400 })
    }

    await prisma.user.delete({ where: { id } })
    await audit({ userId: session.user.id, action: 'admin.user.delete', target: id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
