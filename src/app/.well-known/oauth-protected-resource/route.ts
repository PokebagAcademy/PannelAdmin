import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 * Tells Claude where to find the authorization server that protects this MCP.
 */
export async function GET() {
  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return NextResponse.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
      resource_documentation: `${base}/settings/mcp`,
    },
    {
      headers: { 'cache-control': 'public, max-age=300' },
    },
  )
}
