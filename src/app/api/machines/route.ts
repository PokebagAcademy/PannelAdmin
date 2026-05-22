import { NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { createMachineSchema } from '@/lib/validators'
import { looksLikePrivateKey } from '@/lib/ssh'

/** GET /api/machines — list machines the current user has access to. */
export async function GET() {
  try {
    const session = await requireAuth()
    const role = (session.user as { role?: string }).role ?? 'viewer'

    const machines =
      role === 'admin'
        ? await prisma.machine.findMany({
            orderBy: { name: 'asc' },
            select: machinePublicSelect,
          })
        : await prisma.machine.findMany({
            where: { permissions: { some: { userId: session.user.id } } },
            orderBy: { name: 'asc' },
            select: machinePublicSelect,
          })

    return NextResponse.json({ machines })
  } catch (err) {
    return errorResponse(err)
  }
}

/** POST /api/machines — create a machine (admin only). */
export async function POST(req: Request) {
  try {
    const session = await requireRole('admin')
    const body = await req.json()
    const parsed = createMachineSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    if (data.authType === 'key' && !looksLikePrivateKey(data.secret)) {
      return NextResponse.json(
        { error: 'La clé privée ne ressemble pas à un fichier PEM valide.' },
        { status: 400 },
      )
    }

    const secret = encrypt(data.secret)

    // Encrypt optional RCON password
    let rconPasswordFields: {
      rconHost?: string | null
      rconPort?: number | null
      rconPasswordEnc?: string
      rconPasswordIv?: string
      rconPasswordTag?: string
    } = {}
    if (data.rconPort && data.rconPassword) {
      const enc = encrypt(data.rconPassword)
      rconPasswordFields = {
        rconHost: data.rconHost ?? null,
        rconPort: data.rconPort,
        rconPasswordEnc: enc.enc,
        rconPasswordIv: enc.iv,
        rconPasswordTag: enc.tag,
      }
    }

    const machine = await prisma.machine.create({
      data: {
        name: data.name,
        description: data.description,
        host: data.host,
        port: data.port,
        username: data.username,
        authType: data.authType,
        secretEnc: secret.enc,
        secretIv: secret.iv,
        secretTag: secret.tag,
        ...rconPasswordFields,
        createdById: session.user.id,
        // Creator gets admin permission on the machine
        permissions: {
          create: { userId: session.user.id!, level: 'admin' },
        },
      },
      select: machinePublicSelect,
    })

    await audit({
      userId: session.user.id,
      action: 'machine.create',
      target: machine.id,
      metadata: { name: machine.name, host: machine.host },
    })

    return NextResponse.json({ machine }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}

const machinePublicSelect = {
  id: true,
  name: true,
  description: true,
  host: true,
  port: true,
  username: true,
  authType: true,
  createdAt: true,
} as const

function errorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : 'unknown'
  if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  console.error(err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
