import net from 'node:net'
import { decrypt } from './crypto'
import { prisma } from './prisma'

/**
 * Source RCON protocol client for Minecraft.
 *
 * Wire format (little-endian):
 *   int32 length    — size of fields below
 *   int32 id        — request id, echoed in response
 *   int32 type      — 3=auth, 2=exec, 0=response, 2=auth-response (success/fail)
 *   ascii payload   — null-terminated
 *   ascii (empty)   — null-terminated trailing pad
 *
 * Auth flow:
 *   1. Connect TCP
 *   2. Send packet { id: 1, type: 3, payload: password }
 *   3. Receive packet — if id matches and type=2, auth OK; id=-1 means fail
 *   4. Send commands as type=2, read responses
 *
 * Notes:
 *   - Single-use connection (auth + N commands + close) is simplest and reliable
 *   - Minecraft can split large responses across multiple packets; we wait
 *     until idle for a short period to accumulate
 */

const RCON_TYPE_AUTH = 3
const RCON_TYPE_EXEC = 2
const RCON_TYPE_RESPONSE = 0
const RCON_TYPE_AUTH_RESPONSE = 2

export type RconResult = {
  ok: boolean
  response?: string
  error?: string
  durationMs: number
}

export type RconConfig = {
  host: string
  port: number
  password: string
}

/**
 * Decrypts the RCON config stored on a Machine row. Returns null if RCON
 * isn't configured for this machine.
 */
export async function getRconConfig(machineId: string): Promise<RconConfig | null> {
  const m = await prisma.machine.findUnique({
    where: { id: machineId },
    select: {
      host: true,
      rconHost: true,
      rconPort: true,
      rconPasswordEnc: true,
      rconPasswordIv: true,
      rconPasswordTag: true,
    },
  })
  if (!m) return null
  if (!m.rconPort || !m.rconPasswordEnc || !m.rconPasswordIv || !m.rconPasswordTag)
    return null
  const password = decrypt({
    enc: m.rconPasswordEnc,
    iv: m.rconPasswordIv,
    tag: m.rconPasswordTag,
  })
  return {
    host: m.rconHost ?? m.host,
    port: m.rconPort,
    password,
  }
}

function buildPacket(id: number, type: number, payload: string): Buffer {
  const payloadBuf = Buffer.from(payload, 'utf8')
  const length = payloadBuf.length + 10 // 4 (id) + 4 (type) + payload + 2 (two null terminators)
  const buf = Buffer.alloc(length + 4)
  buf.writeInt32LE(length, 0)
  buf.writeInt32LE(id, 4)
  buf.writeInt32LE(type, 8)
  payloadBuf.copy(buf, 12)
  // The two trailing nulls are already 0 from Buffer.alloc
  return buf
}

type ParsedPacket = { id: number; type: number; payload: string }

/**
 * Parses zero or more complete RCON packets from a buffer.
 * Returns the parsed packets and any remaining incomplete data.
 */
function parsePackets(buf: Buffer): { packets: ParsedPacket[]; rest: Buffer } {
  const packets: ParsedPacket[] = []
  let off = 0
  while (off + 4 <= buf.length) {
    const length = buf.readInt32LE(off)
    if (length < 10 || length > 4096 + 10) {
      // Bad length — bail
      return { packets, rest: Buffer.alloc(0) }
    }
    if (off + 4 + length > buf.length) break // not enough data yet
    const id = buf.readInt32LE(off + 4)
    const type = buf.readInt32LE(off + 8)
    const payload = buf.toString('utf8', off + 12, off + 4 + length - 2)
    packets.push({ id, type, payload })
    off += 4 + length
  }
  return { packets, rest: buf.slice(off) }
}

/**
 * Connects to RCON, authenticates, executes a command, returns the response.
 * Single-shot — opens, runs, closes.
 *
 * Timeouts are sliced into:
 *   - 5s for the TCP connection
 *   - 5s for auth
 *   - 10s for the exec response (Minecraft can be slow on heavy commands)
 */
export async function rconExec(
  cfg: RconConfig,
  command: string,
): Promise<RconResult> {
  const start = Date.now()

  return new Promise<RconResult>((resolve) => {
    const socket = new net.Socket()
    let buf = Buffer.alloc(0)
    let phase: 'connecting' | 'auth' | 'exec' | 'done' = 'connecting'
    let authId = 1
    let execId = 2
    let responseChunks: string[] = []
    let idleTimer: NodeJS.Timeout | null = null
    let phaseTimer: NodeJS.Timeout | null = null

    const finish = (result: RconResult) => {
      if (phase === 'done') return
      phase = 'done'
      if (idleTimer) clearTimeout(idleTimer)
      if (phaseTimer) clearTimeout(phaseTimer)
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      resolve({ ...result, durationMs: Date.now() - start })
    }

    const setPhaseTimeout = (ms: number, reason: string) => {
      if (phaseTimer) clearTimeout(phaseTimer)
      phaseTimer = setTimeout(() => finish({ ok: false, error: reason, durationMs: 0 }), ms)
    }

    setPhaseTimeout(5000, 'connect_timeout')

    socket.on('error', (err) => {
      finish({ ok: false, error: `socket_error: ${err.message}`, durationMs: 0 })
    })

    socket.on('connect', () => {
      phase = 'auth'
      setPhaseTimeout(5000, 'auth_timeout')
      socket.write(buildPacket(authId, RCON_TYPE_AUTH, cfg.password))
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const { packets, rest } = parsePackets(buf)
      buf = rest

      for (const pkt of packets) {
        if (phase === 'auth') {
          if (pkt.type === RCON_TYPE_AUTH_RESPONSE) {
            if (pkt.id === -1) {
              finish({ ok: false, error: 'auth_failed_bad_password', durationMs: 0 })
              return
            }
            if (pkt.id === authId) {
              // Auth OK — send the command
              phase = 'exec'
              setPhaseTimeout(10000, 'exec_timeout')
              socket.write(buildPacket(execId, RCON_TYPE_EXEC, command))
            }
          }
        } else if (phase === 'exec') {
          if (pkt.type === RCON_TYPE_RESPONSE && pkt.id === execId) {
            responseChunks.push(pkt.payload)
            // Minecraft may split responses. Reset idle timer; finish when
            // no more chunks arrive within 200ms.
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              finish({
                ok: true,
                response: responseChunks.join(''),
                durationMs: 0,
              })
            }, 200)
          }
        }
      }
    })

    socket.on('close', () => {
      if (phase !== 'done') {
        finish({ ok: false, error: 'connection_closed_unexpectedly', durationMs: 0 })
      }
    })

    socket.connect(cfg.port, cfg.host)
  })
}

/** Quick connection test — auths and runs `seed` or a harmless command. */
export async function rconTest(cfg: RconConfig): Promise<RconResult> {
  return rconExec(cfg, 'list')
}
