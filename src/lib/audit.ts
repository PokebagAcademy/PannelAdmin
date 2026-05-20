import { prisma } from './prisma'

export async function audit(params: {
  userId?: string | null
  action: string
  target?: string
  metadata?: Record<string, unknown>
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        target: params.target,
        metadata: params.metadata as never,
      },
    })
  } catch (err) {
    // Never let audit failure break a real action
    console.error('audit failed:', err)
  }
}
