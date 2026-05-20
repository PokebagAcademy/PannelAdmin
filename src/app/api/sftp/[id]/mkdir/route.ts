import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, mkdir, rename, removeRecursive, joinPath } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

/** POST /api/sftp/[id]/mkdir { parent: string, name: string } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const body = (await req.json().catch(() => null)) as { parent?: string; name?: string } | null
  if (!body?.name || !/^[^/\\\0]+$/.test(body.name))
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 })

  const parent = safePath(body.parent ?? '.')
  const path = joinPath(parent === '.' ? '.' : parent, body.name)

  try {
    const sftp = await getSftp(id)
    await mkdir(sftp, path)
    await audit({
      userId: authz.userId,
      action: 'sftp.mkdir',
      target: `${id}:${path}`,
    })
    return NextResponse.json({ ok: true, path })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
