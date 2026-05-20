import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/** GET /api/admin/users */
export async function GET() {
  try {
    await requireRole('admin')
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        githubLogin: true,
        role: true,
        createdAt: true,
        _count: { select: { permissions: true, sessions: true } },
        sessions: {
          orderBy: { expires: 'desc' },
          take: 1,
          select: { expires: true },
        },
      },
    })
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        githubLogin: u.githubLogin,
        role: u.role,
        createdAt: u.createdAt,
        permissionCount: u._count.permissions,
        lastSession: u.sessions[0]?.expires ?? null,
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
