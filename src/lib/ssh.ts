import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { decrypt, type Encrypted } from './crypto'

/**
 * Phase 1 connection test.
 *
 * Uses ssh2 directly. SFTP is the real success criterion; exec is a
 * bonus (most shared MC hosts disable it). The exec attempt has its
 * own short timeout — some hosts (Mystrator) accept the channel but
 * never reply, so we treat silence-after-3s as "exec disabled" and
 * return the SFTP result we already have.
 */

export type MachineCreds = {
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
  secret: Encrypted
}

export type ConnectionTestResult =
  | {
      ok: true
      sftpOk: true
      execOk: boolean
      remoteUser?: string
      uname?: string
      sampleEntries: string[]
      note?: string
      diagnostics: string[]
    }
  | { ok: false; error: string; diagnostics: string[] }

const HARD_TIMEOUT_MS = 20_000
const EXEC_TIMEOUT_MS = 3_000

export async function testConnection(creds: MachineCreds): Promise<ConnectionTestResult> {
  const diag: string[] = []
  const startedAt = Date.now()
  const log = (msg: string) => {
    const t = ((Date.now() - startedAt) / 1000).toFixed(2)
    diag.push(`[+${t}s] ${msg}`)
    console.log(`[ssh-test +${t}s]`, msg)
  }

  const secret = decrypt(creds.secret)
  log(`secret decrypted (${secret.length} chars, type=${creds.authType})`)
  log(`connecting to ${creds.host}:${creds.port} as ${creds.username}`)

  const config: ConnectConfig = {
    host: creds.host,
    port: creds.port,
    username: creds.username,
    readyTimeout: 10_000,
    keepaliveInterval: 0,
    ...(creds.authType === 'key' ? { privateKey: secret } : { password: secret }),
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group14-sha1',
      ],
      serverHostKey: [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ecdsa-sha2-nistp384',
        'ecdsa-sha2-nistp521',
        'rsa-sha2-512',
        'rsa-sha2-256',
        'ssh-rsa',
      ],
    },
  }

  return new Promise<ConnectionTestResult>((resolve) => {
    const conn = new Client()
    let resolved = false

    const finish = (r: ConnectionTestResult) => {
      if (resolved) return
      resolved = true
      clearTimeout(hardTimeout)
      try {
        conn.end()
      } catch {
        /* noop */
      }
      resolve(r)
    }

    const hardTimeout = setTimeout(() => {
      log(`HARD TIMEOUT after ${HARD_TIMEOUT_MS}ms`)
      finish({
        ok: false,
        error: `Timeout (${HARD_TIMEOUT_MS / 1000}s) — le serveur ne répond plus.`,
        diagnostics: diag,
      })
    }, HARD_TIMEOUT_MS)

    conn.on('error', (err) => {
      log(`event:error ${err.message}`)
      finish({ ok: false, error: friendlySshError(err.message), diagnostics: diag })
    })

    conn.on('close', () => log('event:close'))
    conn.on('end', () => log('event:end'))
    conn.on('timeout', () => log('event:timeout'))
    conn.on('banner', (msg) => log(`event:banner ${JSON.stringify(msg).slice(0, 80)}`))
    conn.on('handshake', (neg) =>
      log(`event:handshake kex=${neg.kex} hostKey=${neg.serverHostKey}`),
    )

    conn.on('ready', () => {
      log('event:ready — SSH auth OK')

      conn.sftp((sftpErr: Error | undefined, sftp: SFTPWrapper) => {
        if (sftpErr) {
          log(`sftp() failed: ${sftpErr.message}`)
          finish({
            ok: false,
            error: `SFTP indisponible : ${sftpErr.message}`,
            diagnostics: diag,
          })
          return
        }
        log('sftp subsystem opened')

        sftp.readdir('.', (rdErr, list) => {
          if (rdErr) {
            log(`readdir(.) failed: ${rdErr.message}, trying /`)
            sftp.readdir('/', (rdErr2, list2) => {
              if (rdErr2) {
                log(`readdir(/) failed: ${rdErr2.message}`)
                finish({
                  ok: false,
                  error: `SFTP ouvert mais readdir refusé : ${rdErr.message}`,
                  diagnostics: diag,
                })
                return
              }
              log(`readdir(/) OK (${list2.length} entries)`)
              tryExecWithTimeout(conn, log, diag, list2, finish)
            })
            return
          }
          log(`readdir(.) OK (${list.length} entries)`)
          tryExecWithTimeout(conn, log, diag, list, finish)
        })
      })
    })

    try {
      conn.connect(config)
      log('connect() invoked, waiting for events…')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`connect() threw: ${msg}`)
      finish({ ok: false, error: friendlySshError(msg), diagnostics: diag })
    }
  })
}

/**
 * Try exec with a short timeout. SFTP already succeeded — exec is bonus.
 * Mystrator-like hosts open the channel but never reply: we treat that
 * as "exec disabled" and return SFTP success.
 */
function tryExecWithTimeout(
  conn: Client,
  log: (m: string) => void,
  diag: string[],
  list: Array<{ filename: string }>,
  finish: (r: ConnectionTestResult) => void,
) {
  const sampleEntries = list
    .map((e) => e.filename)
    .filter((n) => n !== '.' && n !== '..')
    .slice(0, 8)

  let execDone = false
  const sftpOnlyResult = (): ConnectionTestResult => ({
    ok: true,
    sftpOk: true,
    execOk: false,
    sampleEntries,
    note: 'Hôte SFTP-only (pas de shell exec). Normal pour Mystrator/Aternos/etc.',
    diagnostics: diag,
  })

  const execTimeout = setTimeout(() => {
    if (execDone) return
    execDone = true
    log(`exec timeout after ${EXEC_TIMEOUT_MS}ms — treating as SFTP-only`)
    finish(sftpOnlyResult())
  }, EXEC_TIMEOUT_MS)

  conn.exec('whoami && uname -a', (execErr, stream) => {
    if (execDone) return // timeout already fired
    if (execErr) {
      execDone = true
      clearTimeout(execTimeout)
      log(`exec refused: ${execErr.message}`)
      finish(sftpOnlyResult())
      return
    }
    let out = ''
    stream
      .on('data', (d: Buffer) => (out += d.toString()))
      .on('close', () => {
        if (execDone) return
        execDone = true
        clearTimeout(execTimeout)
        log('exec OK')
        const [remoteUser, ...rest] = out.trim().split('\n')
        finish({
          ok: true,
          sftpOk: true,
          execOk: true,
          remoteUser: remoteUser?.trim(),
          uname: rest.join(' ').trim(),
          sampleEntries,
          diagnostics: diag,
        })
      })
      .stderr.on('data', (d: Buffer) => log(`exec stderr: ${d.toString().trim()}`))
  })
}

function friendlySshError(msg: string): string {
  if (/ETIMEDOUT|ECONNREFUSED/i.test(msg)) return 'Connexion refusée ou timeout — vérifie host/port.'
  if (/All configured authentication methods failed/i.test(msg))
    return 'Authentification refusée — clé ou mot de passe incorrect.'
  if (/getaddrinfo|ENOTFOUND/i.test(msg)) return 'Hôte introuvable (DNS).'
  if (/Cannot parse privateKey/i.test(msg))
    return 'Clé privée invalide — colle bien le contenu PEM complet (avec BEGIN/END).'
  if (/Handshake failed|no matching/i.test(msg))
    return 'Handshake SSH échoué — algorithmes incompatibles avec le serveur.'
  if (/Unable to exec/i.test(msg)) return 'Le serveur refuse cette opération (canal exec bloqué).'
  return msg
}

export function looksLikePrivateKey(raw: string): boolean {
  const t = raw.trim()
  return (
    t.startsWith('-----BEGIN') &&
    t.includes('PRIVATE KEY') &&
    t.endsWith('PRIVATE KEY-----')
  )
}
