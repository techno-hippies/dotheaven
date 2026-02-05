/**
 * JWT Auth for Session Voice Service
 *
 * Uses SIWE-style signature verification for initial auth,
 * then issues short-lived JWTs for subsequent requests.
 */

import { verifyMessage, type Address } from 'viem'
import { config } from './config.js'

// Simple JWT implementation (no external deps)
interface JWTPayload {
  sub: Address  // wallet address
  iat: number   // issued at
  exp: number   // expires at
}

const JWT_EXPIRY_SECONDS = 3600 // 1 hour

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url')
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString()
}

export function createJWT(wallet: Address): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: JWTPayload = {
    sub: wallet.toLowerCase() as Address,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const data = `${header}.${body}`

  // Simple HMAC signature using Bun's crypto
  const hmac = new Bun.CryptoHasher('sha256', config.jwtSecret)
  hmac.update(data)
  const sig = hmac.digest('base64url')

  return `${data}.${sig}`
}

export function verifyJWT(token: string): JWTPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, sig] = parts
  const data = `${header}.${body}`

  // Verify signature
  const hmac = new Bun.CryptoHasher('sha256', config.jwtSecret)
  hmac.update(data)
  const expectedSig = hmac.digest('base64url')

  if (sig !== expectedSig) return null

  // Decode and check expiry
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as JWTPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Verify a SIWE-style auth message
 * Message format: "heaven-session:{timestamp}"
 * Signature must be from the claimed wallet
 */
export async function verifyAuthSignature(
  wallet: Address,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  // Check message format
  const match = message.match(/^heaven-session:(\d+)$/)
  if (!match) return false

  // Check timestamp (allow 5 minutes skew)
  const timestamp = parseInt(match[1], 10)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > 300) return false

  // Verify signature
  try {
    const recovered = await verifyMessage({
      address: wallet,
      message,
      signature,
    })
    return recovered
  } catch {
    return false
  }
}
