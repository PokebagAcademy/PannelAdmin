import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { looksLikePrivateKey } from '@/lib/ssh'

export const runtime = 'nodejs'

const editSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i)
    .optional(),
  description: z.string().max(280).optional().nullable(),
  host: z.string().min(1).max(253).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(64).optional(),

  // SSH secret rotation — only if filled
  authType: z.enum(['key', 'password']).optional(),
  secret: z.string().min(1).optional(),

  // RCON
  rconClear: z.boolean().optional(),
  rconHost: z.string().max(253).optional().nullable(),
  rconPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  rconPassword: z.string().min(1).optional().nullable(),
})

/** GET /api/machines/[id] — return public details (admin only for now) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin')
    const { id } = await params
    const m = await prisma.machine.findUnique({
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
    if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({
      machine: {
        id: m.id,
        name: m.name,
        description: m.description,
        host: m.host,
        port: m.port,
        username: m.username,
        authType: m.authType,
        rconHost: m.rconHost,
        rconPort: m.rconPort,
        hasRcon: !!m.rconPasswordEnc,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** PATCH /api/machines/[id] — update fields */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('admin')
    const { id } = await params
    const body = await req.json()
    const parsed = editSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'invalid', details: parsed.error.flatten() },
        { status: 400 },
      )
    const data = parsed.data

    if (data.secret && data.authType === 'key' && !looksLikePrivateKey(data.secret)) {
      return NextResponse.json(
        { error: 'La clé privée ne ressemble pas à un fichier PEM valide.' },
        { status: 400 },
      )
    }

    const update: Record<string, unknown> = {}
    if (data.name !== undefined) update.name = data.name
    if (data.description !== undefined) update.description = data.description
    if (data.host !== undefined) update.host = data.host
    if (data.port !== undefined) update.port = data.port
    if (data.username !== undefined) update.username = data.username
    if (data.authType !== undefined) update.authType = data.authType

    if (data.secret) {
      const enc = encrypt(data.secret)
      update.secretEnc = enc.enc
      update.secretIv = enc.iv
      update.secretTag = enc.tag
    }

    if (data.rconClear) {
      update.rconHost = null
      update.rconPort = null
      update.rconPasswordEnc = null
      update.rconPasswordIv = null
      update.rconPasswordTag = null
    } else {
      if (data.rconHost !== undefined) update.rconHost = data.rconHost || null
      if (data.rconPort !== undefined) update.rconPort = data.rconPort ?? null
      if (data.rconPassword) {
        const enc = encrypt(data.rconPassword)
        update.rconPasswordEnc = enc.enc
        update.rconPasswordIv = enc.iv
        update.rconPasswordTag = enc.tag
      }
    }

    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })

    const updated = await prisma.machine.update({
      where: { id },
      data: update,
      select: { id: true, name: true },
    })

    await audit({
      userId: session.user.id,
      action: 'machine.update',
      target: id,
      metadata: { fields: Object.keys(update) },
    })

    return NextResponse.json({ machine: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE /api/machines/[id] — admin only */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('admin')
    const { id } = await params
    const machine = await prisma.machine.delete({ where: { id } })
    await audit({
      userId: session.user.id,
      action: 'machine.delete',
      target: id,
      metadata: { name: machine.name },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    console.error(err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
