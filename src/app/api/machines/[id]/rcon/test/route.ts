import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { rconTest } from '@/lib/rcon'

export const runtime = 'nodejs'
export const maxDuration = 30

const schema = z.object({
  // Optional override config — used by the form's "Tester" button before saving
  rconHost: z.string().optional(),
  rconPort: z.number().int().min(1).max(65535).optional(),
  rconPassword: z.string().optional(),
})

/**
 * POST /api/machines/[id]/rcon/test
 *
 * Admin-only. If body contains rcon* fields, uses them directly (lets the
 * user test config before saving). Otherwise uses the saved config.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin')
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    // Empty body is fine
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid' }, { status: 400 })

  let host: string | undefined = parsed.data.rconHost
  let port: number | undefined = parsed.data.rconPort
  let password: string | undefined = parsed.data.rconPassword

  // If host or password missing from override, fill from DB
  if (!host || !port || !password) {
    const m = await prisma.machine.findUnique({
      where: { id },
      select: {
        host: true,
        rconHost: true,
        rconPort: true,
        rconPasswordEnc: true,
        rconPasswordIv: true,
        rconPasswordTag: true,
      },
    })
    if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    host = host ?? m.rconHost ?? m.host
    port = port ?? m.rconPort ?? undefined
    if (!password && m.rconPasswordEnc && m.rconPasswordIv && m.rconPasswordTag) {
      password = decrypt({
        enc: m.rconPasswordEnc,
        iv: m.rconPasswordIv,
        tag: m.rconPasswordTag,
      })
    }
  }

  if (!host || !port || !password)
    return NextResponse.json(
      { error: 'incomplete_config', hint: 'host, port, et password requis' },
      { status: 400 },
    )

  const result = await rconTest({ host, port, password })
  return NextResponse.json(result)
}
