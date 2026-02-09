/**
 * JWT Auth for Session Voice Service (CF Worker)
 *
 * Nonce-based auth matching worker-auth.ts frontend contract:
 * 1. POST /auth/nonce → { nonce }
 * 2. POST /auth/verify → { token }
 *
 * Nonces stored in D1 (not in-memory — unreliable across isolates).
 */

import { verifyMessage, type Address } from 'viem'
import { JWT_EXPIRY_SECONDS, NONCE_TTL_SECONDS } from './config'

interface JWTPayload {
  sub: string
  iat: number
  exp: number
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str))
}

function base64UrlDecodeString(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncode(sig)
}

export async function createJWT(wallet: string, jwtSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: JWTPayload = {
    sub: wallet.toLowerCase(),
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  }

  const header = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncodeString(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = await hmacSign(jwtSecret, data)

  return `${data}.${sig}`
}

export async function verifyJWT(token: string, jwtSecret: string): Promise<JWTPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, sig] = parts
  const data = `${header}.${body}`
  const expectedSig = await hmacSign(jwtSecret, data)

  if (sig !== expectedSig) return null

  try {
    const payload = JSON.parse(base64UrlDecodeString(body)) as JWTPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

export function generateNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function storeNonce(db: D1Database, wallet: string, nonce: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  // Clean up expired nonces for this wallet, then insert new one
  await db.batch([
    db.prepare('DELETE FROM auth_nonces WHERE wallet = ? AND created_at < ?')
      .bind(wallet.toLowerCase(), now - NONCE_TTL_SECONDS),
    db.prepare('INSERT OR REPLACE INTO auth_nonces (wallet, nonce, created_at) VALUES (?, ?, ?)')
      .bind(wallet.toLowerCase(), nonce, now),
  ])
}

export async function consumeNonce(db: D1Database, wallet: string, nonce: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const minCreatedAt = now - NONCE_TTL_SECONDS
  const result = await db.prepare(
    'DELETE FROM auth_nonces WHERE wallet = ? AND nonce = ? AND created_at >= ?',
  ).bind(wallet.toLowerCase(), nonce, minCreatedAt).run()
  return (result.meta?.changes ?? 0) > 0
}

export async function verifySignature(
  wallet: string,
  message: string,
  signature: `0x${string}`,
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: wallet as Address,
      message,
      signature,
    })
  } catch {
    return false
  }
}
