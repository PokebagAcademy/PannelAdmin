import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getOrgLogin } from '@/lib/github'

export const runtime = 'nodejs'

/**
 * GET /api/github/app/install
 *
 * GitHub redirects here after a user installs (or reconfigures) the
 * GitHub App on the org. The query string carries `installation_id` and
 * `setup_action`. We store the installation_id so forApp() can use it.
 *
 * Setup URL to configure on the GitHub App settings:
 *   https://panel.tld/api/github/app/install
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole('admin')
    const url = new URL(req.url)
    const installationId = url.searchParams.get('installation_id')
    const setupAction = url.searchParams.get('setup_action')

    if (!installationId) {
      return NextResponse.redirect(new URL('/settings/github?error=missing_id', url))
    }

    const orgLogin = getOrgLogin()

    await prisma.githubAppInstallation.upsert({
      where: { orgLogin },
      create: {
        installationId: BigInt(installationId),
        orgLogin,
        installedById: session.user.id,
      },
      update: {
        installationId: BigInt(installationId),
        installedById: session.user.id,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'github.app.install',
      target: orgLogin,
      metadata: { installationId, setupAction },
    })

    return NextResponse.redirect(new URL('/settings/github?installed=1', url))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN')
      return NextResponse.redirect(new URL('/login', req.url))
    console.error(err)
    return NextResponse.redirect(new URL('/settings/github?error=internal', req.url))
  }
}
