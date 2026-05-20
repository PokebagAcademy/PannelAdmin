import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type SftpAuthResult =
  | { ok: true; userId: string; role: string; canWrite: boolean }
  | { ok: false; status: 401 | 403 | 404; error: string }

/**
 * Authorize the current session to access `machineId` at the requested
 * permission level. Admins always pass; other users need a row in
 * MachinePermission.
 */
export async function authorizeMachine(
  machineId: string,
  needWrite: boolean,
): Promise<SftpAuthResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, status: 401, error: 'unauthorized' }
  const userId = session.user.id
  const role = (session.user as { role?: string }).role ?? 'viewer'

  const machine = await prisma.machine.findUnique({ where: { id: machineId } })
  if (!machine) return { ok: false, status: 404, error: 'machine_not_found' }

  if (role === 'admin') return { ok: true, userId, role, canWrite: true }

  const perm = await prisma.machinePermission.findUnique({
    where: { userId_machineId: { userId, machineId } },
  })
  if (!perm) return { ok: false, status: 403, error: 'forbidden' }

  const canWrite = perm.level === 'write' || perm.level === 'admin'
  if (needWrite && !canWrite) return { ok: false, status: 403, error: 'read_only' }

  return { ok: true, userId, role, canWrite }
}

/**
 * Normalize and validate a user-supplied path.
 * - Defaults to "." (the SFTP user's home dir as seen by the server)
 * - Collapses ../ to prevent traversal outside the intended scope
 * - Note: real defense relies on the SFTP server's chroot (Mystrator
 *   already restricts), but we still sanitize to fail-fast and to keep
 *   audit logs clean.
 */
export function safePath(input: string | null | undefined): string {
  if (!input || input === '' || input === '/') return '.'
  // Collapse repeated slashes
  let p = input.replace(/\/+/g, '/')
  // Strip trailing slash except for root
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  // Resolve segments
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length > 0) parts.pop()
      continue
    }
    parts.push(seg)
  }
  if (parts.length === 0) return '.'
  // We don't enforce starting with /; let SFTP server resolve relative to home
  return p.startsWith('/') ? '/' + parts.join('/') : parts.join('/')
}
