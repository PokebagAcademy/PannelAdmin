import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireAuth()
    const { token } = (await req.json()) as { token?: string }
    if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 })
    const row = await prisma.mcpToken.findUnique({ where: { token } })
    if (!row || row.userId !== session.user.id)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    await prisma.mcpToken.update({
      where: { token },
      data: { revokedAt: new Date() },
    })
    await audit({ userId: session.user.id, action: 'mcp.revoke', target: token })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
}
