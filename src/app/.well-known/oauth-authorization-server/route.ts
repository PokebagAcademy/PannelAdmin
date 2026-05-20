import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * Advertises our endpoints + PKCE/DCR support to Claude.
 */
export async function GET() {
  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
      token_endpoint: `${base}/api/mcp/oauth/token`,
      registration_endpoint: `${base}/api/mcp/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], // public clients (PKCE)
      scopes_supported: ['mcp'],
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  )
}
