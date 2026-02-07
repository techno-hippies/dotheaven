/**
 * Sleep API
 *
 * Endpoints:
 * - POST /submit - Submit a sleep session (requires JWT auth)
 * - GET /sessions - Get user's sleep session history (requires JWT auth)
 *
 * Flow:
 * 1. Android app tracks sleep locally
 * 2. On sync, posts to this endpoint
 * 3. Worker pins session JSON to Filebase IPFS
 * 4. Worker creates EAS attestation on Base Sepolia
 * 5. Returns CID and attestation UID
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { createSleepAttestation } from '../lib/eas'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// AWS Signature V4 helpers for Filebase S3 API (same as scrobble)
// ============================================================================

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

async function hmacHex(key: ArrayBuffer | string, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

async function pinToFilebase(
  accessKey: string,
  secretKey: string,
  bucket: string,
  json: string,
  fileName: string
): Promise<string> {
  const endpoint = 's3.filebase.com'
  const region = 'us-east-1'
  const service = 's3'

  const date = new Date()
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const canonicalUri = `/${bucket}/${fileName}`
  const payloadHash = await sha256Hex(json)

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join('\n') + '\n'
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': 'application/json',
    },
    body: json,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Filebase upload failed: ${response.status} ${text}`)
  }

  const cid = response.headers.get('x-amz-meta-cid')
  if (!cid) {
    throw new Error('No CID returned from Filebase')
  }

  return cid
}

// ============================================================================
// JWT/Auth Middleware (same pattern as scrobble)
// ============================================================================

interface JwtPayload {
  pkp: string
  iat: number
  exp: number
}

app.use('/submit', async (c, next) => {
  const authHeader = c.req.header('Authorization')

  // Dev mode: allow X-User-Pkp header for testing
  if (c.env.ENVIRONMENT === 'development') {
    const devPkp = c.req.header('X-User-Pkp')
    if (devPkp) {
      c.set('userPkp' as never, devPkp.toLowerCase())
      return next()
    }
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing authorization' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    if (c.env.ENVIRONMENT === 'development') {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token format')
      const payload = JSON.parse(atob(parts[1])) as JwtPayload
      if (!payload.pkp) throw new Error('Missing pkp in token')
      c.set('userPkp' as never, payload.pkp.toLowerCase())
    } else {
      return c.json({ success: false, error: 'Production auth not implemented' }, 501)
    }
  } catch (err) {
    console.error('[JWT Error]', err)
    return c.json({ success: false, error: 'Invalid token' }, 401)
  }

  return next()
})

// ============================================================================
// Types
// ============================================================================

interface SleepSubmitRequest {
  bedTs: number      // Unix timestamp when sleep started
  wakeTs: number     // Unix timestamp when woke up
  durationSec: number // Actual sleep duration (excluding pauses)
  source?: number    // 0 = phone, 1 = wearable (default: 0)
}

interface SleepSubmitResponse {
  success: boolean
  cid?: string
  durationSec?: number
  attestationUid?: string
  txHash?: string
  error?: string
}

// ============================================================================
// POST /submit - Submit a sleep session
// ============================================================================

app.post('/submit', async (c) => {
  const userPkp = c.get('userPkp' as never) as string
  if (!userPkp) {
    return c.json({ success: false, error: 'User not authenticated' } as SleepSubmitResponse, 401)
  }

  // Check Filebase credentials
  const { FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET } = c.env
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY || !FILEBASE_BUCKET) {
    console.error('[Sleep] Missing Filebase credentials')
    return c.json({ success: false, error: 'Server misconfiguration' } as SleepSubmitResponse, 500)
  }

  // Parse request
  let body: SleepSubmitRequest
  try {
    body = await c.req.json<SleepSubmitRequest>()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' } as SleepSubmitResponse, 400)
  }

  const { bedTs, wakeTs, durationSec, source = 0 } = body

  // Validate
  if (!bedTs || typeof bedTs !== 'number' || !Number.isFinite(bedTs)) {
    return c.json({ success: false, error: 'bedTs must be a valid unix timestamp' } as SleepSubmitResponse, 400)
  }
  if (!wakeTs || typeof wakeTs !== 'number' || !Number.isFinite(wakeTs)) {
    return c.json({ success: false, error: 'wakeTs must be a valid unix timestamp' } as SleepSubmitResponse, 400)
  }
  if (wakeTs <= bedTs) {
    return c.json({ success: false, error: 'wakeTs must be after bedTs' } as SleepSubmitResponse, 400)
  }
  if (!durationSec || typeof durationSec !== 'number' || durationSec <= 0) {
    return c.json({ success: false, error: 'durationSec must be positive' } as SleepSubmitResponse, 400)
  }
  if (source !== 0 && source !== 1) {
    return c.json({ success: false, error: 'source must be 0 (phone) or 1 (wearable)' } as SleepSubmitResponse, 400)
  }

  // Sanity check: duration should be <= elapsed time
  const elapsed = wakeTs - bedTs
  if (durationSec > elapsed) {
    return c.json({ success: false, error: 'durationSec cannot exceed elapsed time' } as SleepSubmitResponse, 400)
  }

  const now = Math.floor(Date.now() / 1000)

  // Build session JSON
  const sessionData = {
    version: 1,
    user: userPkp,
    bedTs: String(bedTs),
    wakeTs: String(wakeTs),
    durationSec,
    pausedSec: elapsed - durationSec,
    source: source === 0 ? 'phone' : 'wearable',
    pinnedAt: now,
  }

  const sessionJson = JSON.stringify(sessionData)

  // Generate filename
  const userPrefix = userPkp.slice(2, 10)
  const fileName = `sleep-${userPrefix}-${bedTs}-${now}.json`

  // Pin to Filebase
  let cid: string
  try {
    cid = await pinToFilebase(
      FILEBASE_ACCESS_KEY,
      FILEBASE_SECRET_KEY,
      FILEBASE_BUCKET,
      sessionJson,
      fileName
    )
    console.log(`[Sleep] Pinned session for ${userPkp}: ${cid} (${durationSec}s)`)
  } catch (err) {
    console.error('[Sleep] Filebase error:', err)
    return c.json({ success: false, error: 'Failed to pin to IPFS' } as SleepSubmitResponse, 500)
  }

  // Create EAS attestation
  let attestationUid: string | undefined
  let txHash: string | undefined

  const { BASE_SEPOLIA_RELAY_PK, BASE_SEPOLIA_RPC } = c.env
  if (BASE_SEPOLIA_RELAY_PK && BASE_SEPOLIA_RPC) {
    try {
      const result = await createSleepAttestation(
        BASE_SEPOLIA_RELAY_PK,
        BASE_SEPOLIA_RPC,
        userPkp,
        bedTs,
        wakeTs,
        source,
        cid
      )
      attestationUid = result.uid
      txHash = result.txHash
      console.log(`[Sleep] EAS attestation created: ${attestationUid} (tx: ${txHash})`)
    } catch (err) {
      console.error('[Sleep] EAS attestation error (non-fatal):', err)
    }
  } else {
    console.warn('[Sleep] EAS disabled: missing BASE_SEPOLIA_RELAY_PK or BASE_SEPOLIA_RPC')
  }

  return c.json({
    success: true,
    cid,
    durationSec,
    attestationUid,
    txHash,
  } as SleepSubmitResponse)
})

// History is available via the subgraph (FeedItem where kind = "SLEEP")
// No need for a D1-based /sessions endpoint

export default app
