import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'

/**
 * OAuth Authorize endpoint.
 *
 * GET: redirects to a consent page (which checks the user is logged in
 * via the panel's GitHub OAuth) and shows what's about to be granted.
 *
 * POST: invoked from the consent page form. Creates an auth code and
 * redirects the user back to Claude's redirect_uri with code + state.
 */

function paramErr(redirect: string | null, code: string, desc: string, state?: string | null) {
  if (!redirect) {
    return NextResponse.json({ error: code, error_description: desc }, { status: 400 })
  }
  const u = new URL(redirect)
  u.searchParams.set('error', code)
  u.searchParams.set('error_description', desc)
  if (state) u.searchParams.set('state', state)
  return NextResponse.redirect(u)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const state = url.searchParams.get('state')
  const codeChallenge = url.searchParams.get('code_challenge')
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')
  const scope = url.searchParams.get('scope') ?? 'mcp'

  if (!clientId)
    return NextResponse.json({ error: 'invalid_request', error_description: 'client_id' }, { status: 400 })
  if (!redirectUri)
    return NextResponse.json({ error: 'invalid_request', error_description: 'redirect_uri' }, { status: 400 })
  if (!codeChallenge || codeChallengeMethod !== 'S256')
    return paramErr(redirectUri, 'invalid_request', 'PKCE S256 required', state)

  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } })
  if (!client) return paramErr(redirectUri, 'invalid_client', 'unknown client_id', state)

  const allowed = (client.redirectUris as string[]).includes(redirectUri)
  if (!allowed)
    return paramErr(null, 'invalid_request', 'redirect_uri not registered for this client', state)

  // If the panel user isn't logged in, kick them to /login then back here
  const session = await auth()
  if (!session?.user?.id) {
    const back = new URL('/login', url.origin)
    back.searchParams.set(
      'callbackUrl',
      url.pathname + url.search, // come back to /authorize after login
    )
    return NextResponse.redirect(back)
  }

  // Render a tiny consent page — server-rendered HTML
  const consentUrl = new URL('/api/mcp/oauth/authorize', url.origin)
  // (No content — the consent UI is served by a separate page route below)
  // Redirect to the consent UI page with the same params
  const ui = new URL('/mcp-consent', url.origin)
  ui.search = url.search
  return NextResponse.redirect(ui)
}

export async function POST(req: Request) {
  const fd = await req.formData()
  const clientId = String(fd.get('client_id') ?? '')
  const redirectUri = String(fd.get('redirect_uri') ?? '')
  const state = (fd.get('state') as string | null) ?? null
  const codeChallenge = String(fd.get('code_challenge') ?? '')
  const codeChallengeMethod = String(fd.get('code_challenge_method') ?? '')
  const scope = String(fd.get('scope') ?? 'mcp')
  const action = String(fd.get('action') ?? '')

  if (!clientId || !redirectUri)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const session = await auth()
  if (!session?.user?.id)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } })
  if (!client) return paramErr(redirectUri, 'invalid_client', 'unknown client_id', state)
  if (!(client.redirectUris as string[]).includes(redirectUri))
    return paramErr(null, 'invalid_request', 'redirect_uri mismatch', state)

  // User denied
  if (action === 'deny') return paramErr(redirectUri, 'access_denied', 'user denied', state)

  // Issue the code
  const code = 'ac_' + crypto.randomBytes(24).toString('hex')
  await prisma.mcpAuthCode.create({
    data: {
      code,
      clientId,
      userId: session.user.id,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: codeChallengeMethod || 'S256',
      scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5min
    },
  })
  await audit({
    userId: session.user.id,
    action: 'mcp.authorize',
    target: clientId,
    metadata: { clientName: client.clientName },
  })

  const back = new URL(redirectUri)
  back.searchParams.set('code', code)
  if (state) back.searchParams.set('state', state)
  return NextResponse.redirect(back)
}
