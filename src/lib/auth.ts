import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'
 
/**
 * Auth.js v5 — GitHub OAuth, restricted to ALLOWED_GITHUB_ORG.
 *
 * Flow:
 *  1. User clicks "Sign in with GitHub"
 *  2. We get back access_token with `read:org` scope
 *  3. We hit GET /user/memberships/orgs/{org} to verify membership
 *  4. If member → allow + upsert User. Else → reject.
 *  5. First user is `viewer`. Admin promotes via DB or future UI.
 */
 
async function isOrgMember(accessToken: string): Promise<boolean> {
  const org = process.env.ALLOWED_GITHUB_ORG
  if (!org) {
    console.error('ALLOWED_GITHUB_ORG not set — refusing all logins for safety')
    return false
  }
  try {
    const res = await fetch(`https://api.github.com/user/memberships/orgs/${org}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { state?: string }
    return data.state === 'active'
  } catch (err) {
    console.error('Org membership check failed:', err)
    return false
  }
}
 
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: 'read:user user:email read:org repo' } },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubLogin: profile.login,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== 'github') return false
      const token = account.access_token
      if (!token) return false
      return await isOrgMember(token)
    },
    async session({ session, user }) {
      // Expose role + id on session for use in server components
      if (session.user) {
        session.user.id = user.id
        ;(session.user as { role?: string }).role = (user as { role?: string }).role
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
 
// Helper for server components / route handlers
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error('UNAUTHORIZED')
  return session
}
 
export async function requireRole(...roles: Array<'admin' | 'dev' | 'viewer'>) {
  const session = await requireAuth()
  const userRole = (session.user as { role?: string }).role ?? 'viewer'
  if (!roles.includes(userRole as 'admin' | 'dev' | 'viewer')) {
    throw new Error('FORBIDDEN')
  }
  return session
}
