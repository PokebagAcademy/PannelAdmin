import crypto from 'node:crypto'

/**
 * AES-256-GCM encryption for secrets at rest.
 * Stores ciphertext + IV + auth tag separately so corruption is detectable.
 *
 * ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate with:
 *   openssl rand -hex 32
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // GCM recommends 96-bit IV

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY env var must be 64 hex chars (32 bytes). Generate with: openssl rand -hex 32',
    )
  }
  return Buffer.from(hex, 'hex')
}

export type Encrypted = {
  enc: string // base64
  iv: string // base64
  tag: string // base64
}

export function encrypt(plaintext: string): Encrypted {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    enc: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decrypt({ enc, iv, tag }: Encrypted): string {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()])
  return dec.toString('utf8')
}
