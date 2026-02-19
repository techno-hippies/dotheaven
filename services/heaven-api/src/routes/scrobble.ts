/**
 * Scrobble API
 *
 * Endpoints:
 * - POST /submit - Submit a batch of scrobbles (requires JWT auth)
 * - GET /batches - Get user's scrobble batches (requires JWT auth)
 *
 * Flow:
 * 1. Android app collects scrobbles locally (Room DB)
 * 2. WorkManager periodically syncs to this endpoint
 * 3. Worker pins batch JSON to Filebase IPFS
 * 4. Worker stores batch metadata in D1
 * 5. Returns CID to Android for local marking
 */

import { Hono } from 'hono'
import { jwt, sign } from 'hono/jwt'
import type { Env, ScrobbleSubmitRequest, ScrobbleSubmitResponse, ScrobbleTrack } from '../types'
import { createScrobbleAttestation } from '../lib/eas'
import { resolveTrack, type Normalized, type Resolved } from '../resolver/resolveTrack'
import { pLimit } from '../util/pLimit'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// AWS Signature V4 helpers for Filebase S3 API
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

/**
 * Pin JSON to Filebase IPFS via S3 PUT
 * Returns the CID from the x-amz-meta-cid header
 */
async function pinToFilebase(
  accessKey: string,
  secretKey: string,
  bucket: string,
  batchJson: string,
  fileName: string
): Promise<string> {
  const endpoint = 's3.filebase.com'
  const region = 'us-east-1'
  const service = 's3'

  const date = new Date()
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const canonicalUri = `/${bucket}/${fileName}`
  const payloadHash = await sha256Hex(batchJson)

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
    body: batchJson,
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
// JWT Middleware
// ============================================================================

// For now, we'll use a simple shared secret JWT
// In production, this would verify the JWT from VPN auth flow
const JWT_SECRET = 'heaven-scrobble-secret-change-me' // TODO: Move to env

interface JwtPayload {
  address: string // address
  iat: number
  exp: number
}

// Simple JWT verification middleware
// TODO: Integrate with proper VPN auth JWT
app.use('/submit', async (c, next) => {
  const authHeader = c.req.header('Authorization')

  // Dev mode: allow X-User-Address header for testing
  if (c.env.ENVIRONMENT === 'development') {
    const devAddress = c.req.header('X-User-Address')
    if (devAddress) {
      c.set('userAddress' as never, devAddress.toLowerCase())
      return next()
    }
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing authorization' } as ScrobbleSubmitResponse, 401)
  }

  const token = authHeader.slice(7)

  try {
    // For now, decode without verification in dev mode
    // TODO: Proper JWT verification
    if (c.env.ENVIRONMENT === 'development') {
      // Simple base64 decode of payload
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token format')
      const payload = JSON.parse(atob(parts[1])) as JwtPayload
      if (!payload.address) throw new Error('Missing address in token')
      c.set('userAddress' as never, payload.address.toLowerCase())
    } else {
      // Production: verify signature
      // TODO: Implement proper verification
      return c.json({ success: false, error: 'Production auth not implemented' } as ScrobbleSubmitResponse, 501)
    }
  } catch (err) {
    console.error('[JWT Error]', err)
    return c.json({ success: false, error: 'Invalid token' } as ScrobbleSubmitResponse, 401)
  }

  return next()
})

// ============================================================================
// POST /submit - Submit a batch of scrobbles
// ============================================================================

app.post('/submit', async (c) => {
  const userAddress = c.get('userAddress' as never) as string
  if (!userAddress) {
    return c.json({ success: false, error: 'User not authenticated' } as ScrobbleSubmitResponse, 401)
  }

  // Check Filebase credentials
  const { FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET } = c.env
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY || !FILEBASE_BUCKET) {
    console.error('[Scrobble] Missing Filebase credentials')
    return c.json({ success: false, error: 'Server misconfiguration' } as ScrobbleSubmitResponse, 500)
  }

  // Parse request
  let body: ScrobbleSubmitRequest
  try {
    body = await c.req.json<ScrobbleSubmitRequest>()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' } as ScrobbleSubmitResponse, 400)
  }

  const { tracks } = body

  // Validate tracks
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return c.json({ success: false, error: 'tracks must be a non-empty array' } as ScrobbleSubmitResponse, 400)
  }

  if (tracks.length > 500) {
    return c.json({ success: false, error: 'Maximum 500 tracks per batch' } as ScrobbleSubmitResponse, 400)
  }

  // Validate each track and compute metadata
  const validatedTracks: ScrobbleTrack[] = []
  let minTs = Infinity
  let maxTs = -Infinity

  for (const track of tracks) {
    if (!track.artist || typeof track.artist !== 'string') {
      return c.json({ success: false, error: 'Each track must have artist (string)' } as ScrobbleSubmitResponse, 400)
    }
    if (!track.title || typeof track.title !== 'string') {
      return c.json({ success: false, error: 'Each track must have title (string)' } as ScrobbleSubmitResponse, 400)
    }
    if (!track.playedAt || typeof track.playedAt !== 'number' || !Number.isFinite(track.playedAt)) {
      return c.json({ success: false, error: 'Each track must have playedAt (unix timestamp)' } as ScrobbleSubmitResponse, 400)
    }

    minTs = Math.min(minTs, track.playedAt)
    maxTs = Math.max(maxTs, track.playedAt)

    validatedTracks.push({
      artist: track.artist.slice(0, 256), // Limit length
      title: track.title.slice(0, 256),
      album: track.album?.slice(0, 256) ?? null,
      duration_ms: typeof track.duration_ms === 'number' ? track.duration_ms : null,
      playedAt: track.playedAt,
      source: track.source?.slice(0, 64) ?? undefined,
      embedded: track.embedded ?? undefined,
      fingerprint: typeof track.fingerprint === 'string' ? track.fingerprint.slice(0, 32_000) : undefined,
    })
  }

  const startTs = Math.floor(minTs)
  const endTs = Math.floor(maxTs)
  const count = validatedTracks.length
  const now = Math.floor(Date.now() / 1000)

  // Normalize + resolve each track (concurrency-limited for external API safety)
  const limit = pLimit(2)
  const enrichedTracks = await Promise.all(
    validatedTracks.map((t) =>
      limit(async () => {
        const { normalized, resolved, track_key } = await resolveTrack(c.env, {
          title: t.title,
          artist: t.artist,
          album: t.album ?? undefined,
          duration_ms: t.duration_ms ?? undefined,
          playedAt: t.playedAt,
          source: t.source,
          embedded: t.embedded ?? undefined,
          fingerprint: t.fingerprint ?? undefined,
        })
        return { raw: t, normalized, resolved, track_key }
      })
    )
  )

  // Build enriched batch JSON (v3 = normalized+resolved per track)
  // Note: no pinnedAt field — keeps CID deterministic for identical payloads
  const batchData = {
    version: 3,
    resolver_version: 'resolver-v1',
    user: userAddress,
    startTs: String(startTs),
    endTs: String(endTs),
    count,
    tracks: enrichedTracks.map((et) => ({
      raw: {
        artist: et.raw.artist,
        title: et.raw.title,
        album: et.raw.album,
        duration_ms: et.raw.duration_ms,
        playedAt: et.raw.playedAt,
        source: et.raw.source,
      },
      normalized: et.normalized,
      resolved: et.resolved,
      track_key: et.track_key,
    })),
  }

  const batchJson = JSON.stringify(batchData)

  // Deterministic filename: content-hash prefix so retries overwrite same S3 object
  const userPrefix = userAddress.slice(2, 10)
  const batchHash = (await sha256Hex(batchJson)).slice(0, 16)
  const fileName = `scrobble-${userPrefix}-${startTs}-${batchHash}.json`

  // Pin to Filebase
  let cid: string
  try {
    cid = await pinToFilebase(
      FILEBASE_ACCESS_KEY,
      FILEBASE_SECRET_KEY,
      FILEBASE_BUCKET,
      batchJson,
      fileName
    )
    console.log(`[Scrobble] Pinned batch for ${userAddress}: ${cid} (${count} tracks)`)
  } catch (err) {
    console.error('[Scrobble] Filebase error:', err)
    return c.json({ success: false, error: 'Failed to pin to IPFS' } as ScrobbleSubmitResponse, 500)
  }

  // Store batch metadata in D1
  try {
    await c.env.DB.prepare(`
      INSERT INTO scrobble_batches (user_address, cid, track_count, start_ts, end_ts, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userAddress, cid, count, startTs, endTs, now).run()
  } catch (err) {
    // Log but don't fail - the IPFS pin is the important part
    console.error('[Scrobble] D1 batch error (non-fatal):', err)
  }

  // Insert per-track events (enables charts/leaderboards without IPFS parsing)
  try {
    const stmts = await Promise.all(
      enrichedTracks.map(async (et) => {
        const playedAt = et.raw.playedAt
        // ID is independent of CID so retries with different pinnedAt don't create duplicates
        const idMaterial = `${userAddress}|${playedAt}|${et.track_key}|${et.raw.source ?? ''}`
        const id = await sha256Hex(idMaterial)

        return c.env.DB.prepare(`
          INSERT OR IGNORE INTO scrobble_track_events (
            id, user_address, played_at, source, track_key,
            mbid, isrc, acoustid, confidence,
            title_norm, artist_norm, album_norm, duration_s,
            batch_cid
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, ?8, ?9,
            ?10, ?11, ?12, ?13,
            ?14
          )
        `).bind(
          id,
          userAddress,
          playedAt,
          et.raw.source ?? null,
          et.track_key,
          et.resolved.mbid ?? null,
          et.resolved.isrcs?.[0] ?? null,
          et.resolved.acoustid ?? null,
          et.resolved.confidence,
          et.normalized.title_norm,
          et.normalized.artist_norm,
          et.normalized.album_norm,
          et.normalized.duration_s ?? null,
          cid
        )
      })
    )

    // D1 batch() supports up to 500 statements per call; chunk if needed
    for (let i = 0; i < stmts.length; i += 500) {
      await c.env.DB.batch(stmts.slice(i, i + 500))
    }
    console.log(`[Scrobble] Inserted ${stmts.length} track events for ${userAddress}`)
  } catch (err) {
    // Non-fatal: IPFS blob is the source of truth
    console.error('[Scrobble] D1 track events error (non-fatal):', err)
  }

  // Create EAS attestation on Base Sepolia
  let attestationUid: string | undefined
  let txHash: string | undefined

  const { BASE_SEPOLIA_RELAY_PK, BASE_SEPOLIA_RPC } = c.env
  if (BASE_SEPOLIA_RELAY_PK && BASE_SEPOLIA_RPC) {
    try {
      const result = await createScrobbleAttestation(
        BASE_SEPOLIA_RELAY_PK,
        BASE_SEPOLIA_RPC,
        userAddress, // recipient is the user's address
        startTs,
        endTs,
        count,
        cid
      )
      attestationUid = result.uid
      txHash = result.txHash
      console.log(`[Scrobble] EAS attestation created: ${attestationUid} (tx: ${txHash})`)

      // Update D1 with attestation UID
      try {
        await c.env.DB.prepare(`
          UPDATE scrobble_batches SET attestation_uid = ?, tx_hash = ? WHERE cid = ?
        `).bind(attestationUid, txHash, cid).run()
      } catch (dbErr) {
        console.error('[Scrobble] D1 attestation update error (non-fatal):', dbErr)
      }
    } catch (err) {
      // Log but don't fail - IPFS pin is still valid
      console.error('[Scrobble] EAS attestation error (non-fatal):', err)
    }
  } else {
    console.warn('[Scrobble] EAS disabled: missing BASE_SEPOLIA_RELAY_PK or BASE_SEPOLIA_RPC')
  }

  return c.json({
    success: true,
    cid,
    count,
    startTs,
    endTs,
    attestationUid,
    txHash,
  } as ScrobbleSubmitResponse)
})

// ============================================================================
// GET /batches - Get user's scrobble batch history
// ============================================================================

interface BatchesResponse {
  batches: Array<{
    cid: string
    count: number
    startTs: number
    endTs: number
    createdAt: number
  }>
}

app.get('/batches', async (c) => {
  const userAddress = c.get('userAddress' as never) as string
  if (!userAddress) {
    return c.json({ error: 'User not authenticated' }, 401)
  }

  const rows = await c.env.DB.prepare(`
    SELECT cid, track_count, start_ts, end_ts, created_at
    FROM scrobble_batches
    WHERE user_address = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(userAddress).all()

  const batches = (rows.results ?? []).map((row: any) => ({
    cid: row.cid,
    count: row.track_count,
    startTs: row.start_ts,
    endTs: row.end_ts,
    createdAt: row.created_at,
  }))

  return c.json({ batches } as BatchesResponse)
})

export default app
