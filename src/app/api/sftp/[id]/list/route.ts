import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, listDir } from '@/lib/sftp-pool'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))

  const authz = await authorizeMachine(id, false)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    const sftp = await getSftp(id)
    const entries = await listDir(sftp, path)

    const mapped = entries
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => {
        const attrs = e.attrs
        const isDir = attrs.isDirectory()
        const isLink = attrs.isSymbolicLink()
        return {
          name: e.filename,
          type: isLink ? 'link' : isDir ? 'dir' : 'file',
          size: Number(attrs.size),
          mtime: Number(attrs.mtime) * 1000, // ssh2 returns seconds
          mode: attrs.mode,
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) {
          // dirs first, then files
          if (a.type === 'dir') return -1
          if (b.type === 'dir') return 1
        }
        return a.name.localeCompare(b.name)
      })

    return NextResponse.json({ path, entries: mapped, canWrite: authz.canWrite })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg, path }, { status: 500 })
  }
}
