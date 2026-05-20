import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, writeFile, joinPath } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5min for large uploads

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024 // 200MB

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const dir = safePath(url.searchParams.get('path'))

  const authz = await authorizeMachine(id, true)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_multipart' }, { status: 400 })
  }

  const files = formData.getAll('file').filter((v): v is File => v instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'no_files' }, { status: 400 })

  const results: Array<{ name: string; ok: boolean; size?: number; error?: string }> = []

  try {
    const sftp = await getSftp(id)
    for (const file of files) {
      if (file.size > MAX_UPLOAD_SIZE) {
        results.push({ name: file.name, ok: false, error: 'too_large' })
        continue
      }
      try {
        // Sanitize the filename — no slashes allowed (one upload = one file
        // in the chosen directory)
        const safeName = file.name.replace(/[\/\\]/g, '_')
        const remotePath = joinPath(dir === '.' ? '.' : dir, safeName)
        const buf = Buffer.from(await file.arrayBuffer())
        await writeFile(sftp, remotePath, buf)
        await audit({
          userId: authz.userId,
          action: 'sftp.upload',
          target: `${id}:${remotePath}`,
          metadata: { size: buf.length },
        })
        results.push({ name: safeName, ok: true, size: buf.length })
      } catch (err) {
        results.push({
          name: file.name,
          ok: false,
          error: err instanceof Error ? err.message : 'upload_failed',
        })
      }
    }
    return NextResponse.json({ results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
