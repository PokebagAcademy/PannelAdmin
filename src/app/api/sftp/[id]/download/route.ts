import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, stat } from '@/lib/sftp-pool'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const path = safePath(url.searchParams.get('path'))

  const authz = await authorizeMachine(id, false)
  if (!authz.ok)
    return new Response(JSON.stringify({ error: authz.error }), {
      status: authz.status,
      headers: { 'content-type': 'application/json' },
    })

  try {
    const sftp = await getSftp(id)
    const s = await stat(sftp, path)
    if (s.isDirectory())
      return new Response('Cannot download a directory', { status: 400 })

    const name = path.split('/').pop() ?? 'download'

    await audit({
      userId: authz.userId,
      action: 'sftp.download',
      target: `${id}:${path}`,
      metadata: { size: Number(s.size) },
    })

    // Stream the SFTP read directly to the HTTP response
    const stream = sftp.createReadStream(path)
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      },
      cancel() {
        stream.destroy()
      },
    })

    return new Response(webStream, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(s.size),
        'content-disposition': `attachment; filename="${encodeURIComponent(name)}"`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
