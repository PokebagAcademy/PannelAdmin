import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, stat } from '@/lib/sftp-pool'

export const runtime = 'nodejs'

const MAX_DELTA = 256 * 1024 // 256KB max per poll

/**
 * GET /api/sftp/[id]/tail?path=...&offset=...
 *
 * Returns:
 *   - size: current file size
 *   - offset: where we read from (= max(0, current - MAX_DELTA) if offset omitted or > size)
 *   - chunk: text content from offset to size, decoded utf-8
 *   - rotated: true if size < offset (file was rotated/truncated)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))
  const offsetParam = url.searchParams.get('offset')
  let offset = offsetParam ? Number(offsetParam) : -1

  const authz = await authorizeMachine(id, false)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    const sftp = await getSftp(id)
    const s = await stat(sftp, path)
    if (s.isDirectory())
      return NextResponse.json({ error: 'is_directory' }, { status: 400 })

    const size = Number(s.size)
    let rotated = false

    if (offset < 0) {
      // First call — start from "size minus last 16KB" so the user gets a head start
      offset = Math.max(0, size - 16 * 1024)
    } else if (offset > size) {
      // File was truncated/rotated (Minecraft does this when latest.log → previous.log)
      rotated = true
      offset = 0
    }

    if (size === offset) {
      return NextResponse.json({ size, offset, chunk: '', rotated })
    }

    const readLen = Math.min(size - offset, MAX_DELTA)
    const buf = Buffer.alloc(readLen)

    await new Promise<void>((resolve, reject) => {
      sftp.open(path, 'r', (err, handle) => {
        if (err) return reject(err)
        sftp.read(handle, buf, 0, readLen, offset, (err2) => {
          sftp.close(handle, () => {
            if (err2) reject(err2)
            else resolve()
          })
        })
      })
    })

    // Strip incomplete trailing UTF-8 multibyte sequence (if any) so we never
    // return a half-character that would corrupt rendering. Easiest: find the
    // last newline and stop there if we're not at EOF.
    let chunk = buf.toString('utf8')
    const isComplete = offset + readLen === size
    if (!isComplete) {
      const lastNl = chunk.lastIndexOf('\n')
      if (lastNl !== -1 && lastNl < chunk.length - 1) {
        chunk = chunk.slice(0, lastNl + 1)
      }
    }
    const newOffset = offset + Buffer.byteLength(chunk, 'utf8')

    return NextResponse.json({
      size,
      offset: newOffset,
      chunk,
      rotated,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
