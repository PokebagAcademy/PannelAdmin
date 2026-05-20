import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, writeFile } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

const MAX_WRITE_SIZE = 5 * 1024 * 1024 // 5MB cap on inline edits

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))

  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const body = await req.text()
  if (body.length > MAX_WRITE_SIZE)
    return NextResponse.json({ error: 'too_large' }, { status: 413 })

  try {
    const sftp = await getSftp(id)
    await writeFile(sftp, path, Buffer.from(body, 'utf8'))
    await audit({
      userId: authz.userId,
      action: 'sftp.write',
      target: `${id}:${path}`,
      metadata: { size: body.length },
    })
    return NextResponse.json({ ok: true, size: body.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
