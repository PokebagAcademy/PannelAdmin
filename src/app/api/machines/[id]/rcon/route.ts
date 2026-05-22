import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeMachine } from '@/lib/sftp-auth'
import { getRconConfig, rconExec } from '@/lib/rcon'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 30

const schema = z.object({
  command: z.string().min(1).max(2000),
})

const FORBIDDEN_FOR_NON_ADMIN = new Set([
  'stop',
  'restart',
  'op',
  'deop',
  'whitelist',
  'ban',
  'ban-ip',
  'pardon',
  'pardon-ip',
  'save-all',
  'save-off',
  'save-on',
])

/** POST /api/machines/[id]/rcon — run a command */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Need write permission to execute commands
  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })

  const command = parsed.data.command.trim().replace(/^\//, '') // strip leading slash if user typed it

  // Restrict dangerous commands to admins
  const root = command.split(/\s+/)[0].toLowerCase()
  if (FORBIDDEN_FOR_NON_ADMIN.has(root) && authz.role !== 'admin') {
    return NextResponse.json(
      {
        error: 'forbidden_command',
        hint: `La commande "${root}" est réservée aux admins.`,
      },
      { status: 403 },
    )
  }

  const cfg = await getRconConfig(id)
  if (!cfg)
    return NextResponse.json(
      {
        error: 'rcon_not_configured',
        hint: 'Configure les paramètres RCON pour cette machine.',
      },
      { status: 400 },
    )

  const result = await rconExec(cfg, command)

  await audit({
    userId: authz.userId,
    action: 'rcon.exec',
    target: `${id}:${root}`,
    metadata: {
      command: command.slice(0, 500),
      ok: result.ok,
      durationMs: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    },
  })

  if (!result.ok)
    return NextResponse.json(
      { error: result.error, durationMs: result.durationMs },
      { status: 502 },
    )

  return NextResponse.json({
    ok: true,
    response: result.response ?? '',
    durationMs: result.durationMs,
  })
}
