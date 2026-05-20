import { NextResponse } from 'next/server'
import { authorizeMachine, safePath } from '@/lib/sftp-auth'
import { getSftp, listDir, joinPath } from '@/lib/sftp-pool'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recursive filename search over SFTP.
 *
 * Hard caps to keep things snappy:
 *   - MAX_ENTRIES_SCANNED: 5000 (walks no further than this)
 *   - MAX_DURATION_MS: 25_000 (Mystrator is slow over WAN)
 *   - MAX_RESULTS: 200
 *
 * Excluded by default: world/region, logs/, crash-reports/, cache/,
 * node_modules, .git — toggle with ?includeAll=1.
 *
 * Match modes:
 *   - "*.json"      → glob (simple, only * supported)
 *   - "/regex/i"    → regex with optional flags
 *   - "pikachu"     → substring (case-insensitive)
 */

const MAX_ENTRIES_SCANNED = 5000
const MAX_DURATION_MS = 25_000
const MAX_RESULTS = 200

const DEFAULT_EXCLUDES = new Set([
  'node_modules',
  '.git',
  '.gradle',
  'build',
  'logs',
  'cache',
  'crash-reports',
  'region', // world/region
])

type SearchHit = {
  name: string
  path: string
  type: 'file' | 'dir' | 'link'
  size: number
  mtime: number
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const root = safePath(url.searchParams.get('path'))
  const query = (url.searchParams.get('q') ?? '').trim()
  const includeAll = url.searchParams.get('includeAll') === '1'

  if (!query) return NextResponse.json({ error: 'empty_query' }, { status: 400 })

  const authz = await authorizeMachine(id, false)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const matcher = buildMatcher(query)
  if (!matcher) return NextResponse.json({ error: 'invalid_query' }, { status: 400 })

  const startedAt = Date.now()
  const hits: SearchHit[] = []
  let scanned = 0
  let truncated = false
  let durationCap = false

  try {
    const sftp = await getSftp(id)

    // Iterative BFS — avoids stack overflow on deep trees
    const queue: string[] = [root]
    while (queue.length > 0) {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        durationCap = true
        break
      }
      if (scanned >= MAX_ENTRIES_SCANNED) {
        truncated = true
        break
      }
      if (hits.length >= MAX_RESULTS) {
        truncated = true
        break
      }

      const dir = queue.shift()!
      let entries
      try {
        entries = await listDir(sftp, dir)
      } catch {
        continue // unreadable dir — skip silently
      }

      for (const e of entries) {
        if (e.filename === '.' || e.filename === '..') continue
        scanned++
        if (scanned >= MAX_ENTRIES_SCANNED) {
          truncated = true
          break
        }

        const isDir = e.attrs.isDirectory()
        const isLink = e.attrs.isSymbolicLink()
        const full = joinPath(dir, e.filename)

        if (matcher(e.filename)) {
          hits.push({
            name: e.filename,
            path: full,
            type: isLink ? 'link' : isDir ? 'dir' : 'file',
            size: Number(e.attrs.size),
            mtime: Number(e.attrs.mtime) * 1000,
          })
          if (hits.length >= MAX_RESULTS) {
            truncated = true
            break
          }
        }

        if (isDir) {
          if (!includeAll && DEFAULT_EXCLUDES.has(e.filename)) continue
          queue.push(full)
        }
      }
    }

    return NextResponse.json({
      root,
      query,
      hits,
      scanned,
      truncated,
      durationCap,
      durationMs: Date.now() - startedAt,
      excluded: includeAll ? [] : Array.from(DEFAULT_EXCLUDES),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sftp_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Build a (name: string) => boolean matcher from the user query.
 * Returns null if regex syntax is invalid.
 */
function buildMatcher(q: string): ((name: string) => boolean) | null {
  // Regex form: /pattern/flags
  const regexMatch = q.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1], regexMatch[2] || 'i')
      return (name) => re.test(name)
    } catch {
      return null
    }
  }

  // Glob form: contains a * (and no slash, since we match against filename)
  if (q.includes('*')) {
    const re = new RegExp(
      '^' +
        q
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$',
      'i',
    )
    return (name) => re.test(name)
  }

  // Default: case-insensitive substring
  const lower = q.toLowerCase()
  return (name) => name.toLowerCase().includes(lower)
}
