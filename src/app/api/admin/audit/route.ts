import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const PAGE_SIZE = 50

/** GET /api/admin/audit?cursor=...&user=...&action=... */
export async function GET(req: Request) {
  try {
    await requireRole('admin')
    const url = new URL(req.url)
    const cursor = url.searchParams.get('cursor')
    const userId = url.searchParams.get('user')
    const actionPrefix = url.searchParams.get('action')
    const q = url.searchParams.get('q')?.trim().toLowerCase()

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (actionPrefix) where.action = { startsWith: actionPrefix }
    if (q) {
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { target: { contains: q, mode: 'insensitive' } },
      ]
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { name: true, image: true, githubLogin: true } } },
    })

    const hasMore = rows.length > PAGE_SIZE
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const nextCursor = hasMore ? items[items.length - 1].id : null

    // Stats sidebar
    const [users, topActions] = await Promise.all([
      prisma.user.findMany({
        where: { auditLogs: { some: {} } },
        select: { id: true, name: true, githubLogin: true },
        orderBy: { name: 'asc' },
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ])

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        metadata: r.metadata,
        createdAt: r.createdAt,
        user: r.user,
      })),
      nextCursor,
      filters: {
        users: users.map((u) => ({ id: u.id, label: u.name ?? u.githubLogin ?? '?' })),
        topActions: topActions.map((a) => ({ action: a.action, count: a._count.action })),
      },
    })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
