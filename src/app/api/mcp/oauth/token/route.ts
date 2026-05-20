import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * OAuth Token endpoint.
 * Supports authorization_code grant with PKCE verification.
 */
export async function POST(req: Request) {
  let params: URLSearchParams
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/x-www-form-urlencoded')) {
    const body = await req.text()
    params = new URLSearchParams(body)
  } else if (ct.includes('application/json')) {
    const body = await req.json()
    params = new URLSearchParams(body as Record<string, string>)
  } else {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const grantType = params.get('grant_type')
  if (grantType !== 'authorization_code')
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })

  const code = params.get('code')
  const clientId = params.get('client_id')
  const codeVerifier = params.get('code_verifier')
  const redirectUri = params.get('redirect_uri')

  if (!code || !clientId || !codeVerifier || !redirectUri)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const authCode = await prisma.mcpAuthCode.findUnique({ where: { code } })
  if (!authCode)
    return NextResponse.json({ error: 'invalid_grant', error_description: 'unknown code' }, { status: 400 })
  if (authCode.consumedAt)
    return NextResponse.json({ error: 'invalid_grant', error_description: 'code reuse' }, { status: 400 })
  if (authCode.expiresAt < new Date())
    return NextResponse.json({ error: 'invalid_grant', error_description: 'expired' }, { status: 400 })
  if (authCode.clientId !== clientId)
    return NextResponse.json({ error: 'invalid_grant', error_description: 'client mismatch' }, { status: 400 })
  if (authCode.redirectUri !== redirectUri)
    return NextResponse.json({ error: 'invalid_grant', error_description: 'redirect mismatch' }, { status: 400 })

  // PKCE verification — SHA256 of code_verifier (base64url) must equal stored challenge
  const computed = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  if (computed !== authCode.codeChallenge)
    return NextResponse.json({ error: 'invalid_grant', error_description: 'PKCE failed' }, { status: 400 })

  // Consume the code (single use)
  await prisma.mcpAuthCode.update({
    where: { code },
    data: { consumedAt: new Date() },
  })

  // Issue an access token
  const token = 'mcp_' + crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  await prisma.mcpToken.create({
    data: {
      token,
      clientId: authCode.clientId,
      userId: authCode.userId,
      scope: authCode.scope,
      expiresAt,
    },
  })

  return NextResponse.json(
    {
      access_token: token,
      token_type: 'Bearer',
      expires_in: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      scope: authCode.scope,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
