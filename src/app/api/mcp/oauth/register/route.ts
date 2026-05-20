import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * RFC 7591 — Dynamic Client Registration.
 * Claude Desktop / Code POST their metadata here, we create a public
 * OAuth client and return the client_id.
 *
 * Public client (no client_secret) — security is via PKCE.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 })
  }

  const meta = body as {
    client_name?: string
    redirect_uris?: string[]
    grant_types?: string[]
    token_endpoint_auth_method?: string
  }

  if (!Array.isArray(meta.redirect_uris) || meta.redirect_uris.length === 0)
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 })

  // Basic redirect_uri sanity: must be https or localhost
  for (const uri of meta.redirect_uris) {
    try {
      const u = new URL(uri)
      const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      if (u.protocol !== 'https:' && !isLocalhost) {
        return NextResponse.json(
          { error: 'invalid_redirect_uri', error_description: 'must be https or localhost' },
          { status: 400 },
        )
      }
    } catch {
      return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 })
    }
  }

  const clientId = 'mcp-' + crypto.randomBytes(12).toString('hex')
  const clientName = (meta.client_name ?? 'unknown client').slice(0, 200)

  await prisma.mcpOAuthClient.create({
    data: {
      clientId,
      clientName,
      redirectUris: meta.redirect_uris,
    },
  })

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: meta.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201 },
  )
}
