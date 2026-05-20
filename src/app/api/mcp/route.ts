import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tools, toolsForApi, getTool, type ToolContext } from '@/lib/tools'
import { audit } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * MCP Streamable HTTP endpoint.
 * Speaks JSON-RPC 2.0. Each request is independently authenticated via
 * a Bearer token issued by /api/mcp/oauth/token.
 *
 * Supported methods:
 *   - initialize             → handshake, returns server info & capabilities
 *   - tools/list             → returns the tool schemas
 *   - tools/call             → invokes a tool by name with arguments
 *   - notifications/initialized → no-op ack (no response body)
 *   - ping                   → empty result
 */

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const PROTOCOL_VERSION = '2025-06-18'

function unauthorized() {
  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      // RFC 9728 — point Claude at our resource metadata
      'www-authenticate': `Bearer realm="cobblepanel", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  })
}

async function authenticate(req: Request): Promise<{
  userId: string
  ctx: ToolContext
} | null> {
  const authz = req.headers.get('authorization')
  if (!authz?.startsWith('Bearer ')) return null
  const token = authz.slice(7).trim()
  const row = await prisma.mcpToken.findUnique({ where: { token } })
  if (!row || row.revokedAt) return null
  if (row.expiresAt < new Date()) return null
  // Touch lastUsedAt
  prisma.mcpToken
    .update({ where: { token }, data: { lastUsedAt: new Date() } })
    .catch(() => {})
  // ToolContext has no workspace bindings in MCP — Claude passes them
  // explicitly as tool args (which works because our tool schemas
  // accept `machine` and `owner/repo` overrides).
  return { userId: row.userId, ctx: { userId: row.userId } }
}

async function handleRpc(
  req: JsonRpcRequest,
  ctx: ToolContext,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null

  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'cobblepanel', version: '0.4.0' },
        },
      }

    case 'notifications/initialized':
      // Notifications have no id and expect no response
      return null

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }

    case 'tools/list': {
      const list = toolsForApi().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
        // MCP-specific hint for clients (Claude shows ⚠ on write tools)
        annotations: {
          destructiveHint: tools[t.name]?.kind === 'write',
          readOnlyHint: tools[t.name]?.kind === 'read',
        },
      }))
      return { jsonrpc: '2.0', id, result: { tools: list } }
    }

    case 'tools/call': {
      const params = req.params as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined
      const name = params?.name
      const args = params?.arguments ?? {}
      if (!name)
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'missing tool name' },
        }
      const tool = getTool(name)
      if (!tool)
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `unknown tool: ${name}` },
        }

      try {
        const out = await tool.execute(args, ctx)
        await audit({
          userId: ctx.userId,
          action: `mcp.${name}`,
          metadata: { kind: tool.kind },
        })
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text:
                  typeof out === 'string' ? out : JSON.stringify(out, null, 2),
              },
            ],
            isError: false,
          },
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Error: ${msg}` }],
            isError: true,
          },
        }
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `method not found: ${req.method}` },
      }
  }
}

export async function POST(req: Request) {
  const a = await authenticate(req)
  if (!a) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } },
      { status: 400 },
    )
  }

  // Batch or single
  const isBatch = Array.isArray(body)
  const requests = (isBatch ? body : [body]) as JsonRpcRequest[]

  const responses: JsonRpcResponse[] = []
  for (const r of requests) {
    if (typeof r?.method !== 'string') {
      responses.push({
        jsonrpc: '2.0',
        id: r?.id ?? null,
        error: { code: -32600, message: 'invalid request' },
      })
      continue
    }
    const resp = await handleRpc(r, a.ctx)
    if (resp) responses.push(resp)
  }

  // No responses (only notifications) → 202 Accepted with no body
  if (responses.length === 0) return new Response(null, { status: 202 })

  return NextResponse.json(isBatch ? responses : responses[0], {
    headers: { 'mcp-session-id': a.userId },
  })
}

/** GET on the MCP endpoint returns Server-Sent Events for server→client notifications.
 * We don't push anything yet, so this just accepts connections and idles.
 * Some clients (Claude Desktop fallback) probe this; returning 405 would
 * cause connection failures, so we accept it cleanly.
 */
export async function GET(req: Request) {
  const a = await authenticate(req)
  if (!a) return unauthorized()

  // Long-lived SSE stream that never sends events (we have nothing
  // server-initiated to push for now). Client closes when it wants.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(': cobblepanel mcp ready\n\n'))
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

/** Some clients send DELETE to terminate a session. No-op for us. */
export async function DELETE() {
  return new Response(null, { status: 204 })
}
