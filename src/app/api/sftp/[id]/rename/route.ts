import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, rename } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

/** POST /api/sftp/[id]/rename { from, to } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const body = (await req.json().catch(() => null)) as { from?: string; to?: string } | null
  if (!body?.from || !body?.to)
    return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const from = safePath(body.from)
  const to = safePath(body.to)

  try {
    const sftp = await getSftp(id)
    await rename(sftp, from, to)
    await audit({
      userId: authz.userId,
      action: 'sftp.rename',
      target: `${id}:${from}`,
      metadata: { to },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
