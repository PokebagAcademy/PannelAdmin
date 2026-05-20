import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, readFile, stat } from '@/lib/sftp-pool'

export const runtime = 'nodejs'

const MAX_TEXT_SIZE = 2 * 1024 * 1024 // 2MB — beyond this, refuse to open as text

/**
 * Heuristic: a buffer is "binary" if it contains a null byte in the
 * first 8KB, or more than 30% non-printable bytes.
 */
function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192))
  if (sample.indexOf(0) !== -1) return true
  let nonPrintable = 0
  for (const b of sample) {
    // Allow tab, LF, CR + standard printable
    if (b === 9 || b === 10 || b === 13) continue
    if (b < 32 || b === 127) nonPrintable++
  }
  return nonPrintable / sample.length > 0.3
}

function detectLanguage(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const map: Record<string, string> = {
    json: 'json',
    json5: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    properties: 'ini',
    conf: 'ini',
    md: 'markdown',
    txt: 'plaintext',
    log: 'plaintext',
    sh: 'shell',
    bash: 'shell',
    js: 'javascript',
    mjs: 'javascript',
    ts: 'typescript',
    java: 'java',
    kt: 'kotlin',
    py: 'python',
    xml: 'xml',
    html: 'html',
    css: 'css',
    sql: 'sql',
  }
  if (map[ext]) return map[ext]
  if (name === 'Dockerfile') return 'dockerfile'
  return 'plaintext'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))

  const authz = await authorizeMachine(id, false)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    const sftp = await getSftp(id)
    const s = await stat(sftp, path)
    if (s.isDirectory())
      return NextResponse.json({ error: 'is_directory' }, { status: 400 })

    const size = Number(s.size)
    if (size > MAX_TEXT_SIZE) {
      return NextResponse.json({
        path,
        size,
        binary: true,
        tooLarge: true,
        message: `Fichier trop volumineux pour l'éditeur (${(size / 1024 / 1024).toFixed(1)}MB). Téléchargez-le.`,
      })
    }

    const buf = await readFile(sftp, path)
    const binary = looksBinary(buf)
    const name = path.split('/').pop() ?? path

    if (binary) {
      // Check if it's an image — preview in UI
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)
      if (isImage) {
        return NextResponse.json({
          path,
          size,
          binary: true,
          isImage: true,
          dataUrl: `data:image/${getImageMime(name)};base64,${buf.toString('base64')}`,
        })
      }
      return NextResponse.json({
        path,
        size,
        binary: true,
        message: 'Fichier binaire. Téléchargement disponible.',
      })
    }

    return NextResponse.json({
      path,
      size,
      binary: false,
      content: buf.toString('utf8'),
      language: detectLanguage(name),
      mtime: Number(s.mtime) * 1000,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg, path }, { status: 500 })
  }
}

function getImageMime(name: string): string {
  const ext = name.split('.').pop()!.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'svg') return 'svg+xml'
  return ext
}
