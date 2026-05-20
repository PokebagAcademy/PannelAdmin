import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, removeRecursive } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

/** DELETE /api/sftp/[id]/delete?path=... */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))

  if (path === '.' || path === '/' || path === '')
    return NextResponse.json({ error: 'cannot_delete_root' }, { status: 400 })

  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    const sftp = await getSftp(id)
    await removeRecursive(sftp, path)
    await audit({
      userId: authz.userId,
      action: 'sftp.delete',
      target: `${id}:${path}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
