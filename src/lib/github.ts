import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { prisma } from './prisma'

/**
 * Two Octokit flavors for two use cases:
 *
 * 1. forUser(userId): acts as the human. Reads (list repos, list PRs)
 *    respect that user's GitHub permissions automatically. We pull the
 *    OAuth access_token Auth.js stored in the Account table.
 *
 * 2. forApp(): acts as the GitHub App installation. Used for writes
 *    (create repo, push initial commit, open PR) so actions appear as
 *    the bot, are traceable, and don't expire with the user's session.
 *    Requires env: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
 *                  GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET.
 */

/** Get an Octokit acting as the given user (using their OAuth token). */
export async function forUser(userId: string): Promise<Octokit> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'github' },
    select: { access_token: true },
  })
  if (!account?.access_token) throw new Error('github_token_missing')
  return new Octokit({ auth: account.access_token })
}

/** Get an installation-scoped Octokit (acts as the GitHub App bot). */
export async function forApp(): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!appId || !privateKey) throw new Error('github_app_not_configured')

  const install = await prisma.githubAppInstallation.findFirst()
  if (!install) throw new Error('github_app_not_installed')

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(appId),
      privateKey,
      installationId: Number(install.installationId),
    },
  })
}

/** Resolve the GitHub org slug stored in env (single org per panel). */
export function getOrgLogin(): string {
  const org = process.env.ALLOWED_GITHUB_ORG
  if (!org) throw new Error('ALLOWED_GITHUB_ORG not set')
  return org
}

/** Light in-memory cache for repo listings (60s). */
const cache = new Map<string, { value: unknown; expires: number }>()
const TTL_MS = 60_000

export function cacheGet<T>(key: string): T | null {
  const e = cache.get(key)
  if (!e) return null
  if (e.expires < Date.now()) {
    cache.delete(key)
    return null
  }
  return e.value as T
}

export function cacheSet<T>(key: string, value: T) {
  cache.set(key, { value, expires: Date.now() + TTL_MS })
}

export function cacheInvalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}
