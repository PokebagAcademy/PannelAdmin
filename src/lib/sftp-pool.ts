import { Client, type SFTPWrapper, type ConnectConfig } from 'ssh2'
import { prisma } from './prisma'
import { decrypt } from './crypto'

/**
 * SFTP connection pool.
 *
 * Why: each fresh SSH handshake costs ~500ms. The file browser issues
 * many small operations (listdir, stat, read) per second. We keep one
 * live SSH connection per machine, multiplex SFTP operations through it,
 * and tear it down after IDLE_MS of inactivity.
 *
 * In-memory only — fine for a single Node process. If we scale out later
 * we'll need Redis-backed coordination, but Phase 2 is single-node.
 */

const IDLE_MS = 5 * 60 * 1000 // 5 minutes
const CONNECT_TIMEOUT_MS = 12_000

type Entry = {
  conn: Client
  sftp: SFTPWrapper
  lastUsed: number
  idleTimer: NodeJS.Timeout
}

const pool = new Map<string, Promise<Entry>>()

function buildConfig(machine: {
  host: string
  port: number
  username: string
  authType: string
  secretEnc: string
  secretIv: string
  secretTag: string
}): ConnectConfig {
  const secret = decrypt({
    enc: machine.secretEnc,
    iv: machine.secretIv,
    tag: machine.secretTag,
  })
  return {
    host: machine.host,
    port: machine.port,
    username: machine.username,
    readyTimeout: CONNECT_TIMEOUT_MS,
    keepaliveInterval: 30_000,
    keepaliveCountMax: 3,
    ...(machine.authType === 'key' ? { privateKey: secret } : { password: secret }),
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group14-sha1',
      ],
      serverHostKey: [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'rsa-sha2-512',
        'rsa-sha2-256',
        'ssh-rsa',
      ],
    },
  }
}

function openConnection(machineId: string): Promise<Entry> {
  return new Promise<Entry>(async (resolve, reject) => {
    const machine = await prisma.machine.findUnique({ where: { id: machineId } })
    if (!machine) {
      reject(new Error('machine_not_found'))
      return
    }

    const conn = new Client()
    const config = buildConfig(machine)

    const fail = (err: Error) => {
      try {
        conn.end()
      } catch {
        /* noop */
      }
      pool.delete(machineId)
      reject(err)
    }

    conn.once('error', fail)
    conn.once('close', () => {
      pool.delete(machineId)
    })
    conn.once('ready', () => {
      conn.sftp((sftpErr, sftp) => {
        if (sftpErr) return fail(sftpErr)
        const idleTimer = setTimeout(() => closeEntry(machineId), IDLE_MS)
        resolve({ conn, sftp, lastUsed: Date.now(), idleTimer })
      })
    })

    try {
      conn.connect(config)
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function closeEntry(machineId: string) {
  const p = pool.get(machineId)
  if (!p) return
  pool.delete(machineId)
  p.then(
    (entry) => {
      clearTimeout(entry.idleTimer)
      try {
        entry.conn.end()
      } catch {
        /* noop */
      }
    },
    () => {
      /* connection never opened, nothing to clean */
    },
  )
}

/**
 * Get the cached SFTP session for a machine, opening a new connection
 * if needed. Refreshes the idle timer each call.
 */
export async function getSftp(machineId: string): Promise<SFTPWrapper> {
  let entryPromise = pool.get(machineId)
  if (!entryPromise) {
    entryPromise = openConnection(machineId)
    pool.set(machineId, entryPromise)
  }
  const entry = await entryPromise
  entry.lastUsed = Date.now()
  clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => closeEntry(machineId), IDLE_MS)
  return entry.sftp
}

/** Force-close a machine's connection (e.g. after credentials change). */
export function dropConnection(machineId: string) {
  closeEntry(machineId)
}

/* ---------- Convenience SFTP helpers (Promise-based) ---------- */

import type { Stats, FileEntry } from 'ssh2'

export function listDir(sftp: SFTPWrapper, path: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) =>
    sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list))),
  )
}

export function stat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) =>
    sftp.stat(path, (err, s) => (err ? reject(err) : resolve(s))),
  )
}

export function readFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(path)
    stream.on('data', (c) => chunks.push(c as Buffer))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

export function writeFile(sftp: SFTPWrapper, path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(path)
    stream.on('error', reject)
    stream.on('close', () => resolve())
    stream.end(data)
  })
}

export function mkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) =>
    sftp.mkdir(path, (err) => (err ? reject(err) : resolve())),
  )
}

export function rename(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) =>
    sftp.rename(from, to, (err) => (err ? reject(err) : resolve())),
  )
}

export function unlink(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) =>
    sftp.unlink(path, (err) => (err ? reject(err) : resolve())),
  )
}

export function rmdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) =>
    sftp.rmdir(path, (err) => (err ? reject(err) : resolve())),
  )
}

/**
 * Recursive delete — checks if path is dir or file, then removes accordingly.
 * For dirs, walks the tree depth-first.
 */
export async function removeRecursive(sftp: SFTPWrapper, path: string): Promise<void> {
  const s = await stat(sftp, path)
  if (s.isDirectory()) {
    const entries = await listDir(sftp, path)
    for (const e of entries) {
      if (e.filename === '.' || e.filename === '..') continue
      await removeRecursive(sftp, joinPath(path, e.filename))
    }
    await rmdir(sftp, path)
  } else {
    await unlink(sftp, path)
  }
}

export function joinPath(base: string, name: string): string {
  if (base.endsWith('/')) return base + name
  return base + '/' + name
}
