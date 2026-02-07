/**
 * Claim Routes
 *
 * Handles shadow profile claim flow:
 * 1. GET /:token - Lookup profile by claim token
 * 2. POST /start - Generate verification code
 * 3. POST /verify-bio - Check bio for verification code
 * 4. POST /verify-dm - Verify DM token
 * 5. POST /complete - Mark profile as claimed
 */

import { recoverMessageAddress } from 'viem'
import { Hono } from 'hono'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()
const CLAIM_SIGNATURE_WINDOW_SECONDS = 120

// Crypto helpers
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateHumanCode(): string {
  // Format: HVN-XXXXXX (6 alphanumeric chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No I, O, 0, 1 for readability
  let code = 'HVN-'

  // Use CSPRNG for claim codes.
  const maxByte = Math.floor(256 / chars.length) * chars.length
  const randomByte = new Uint8Array(1)

  for (let i = 0; i < 6; i++) {
    do {
      crypto.getRandomValues(randomByte)
    } while (randomByte[0] >= maxByte)
    code += chars[randomByte[0] % chars.length]
  }
  return code
}

function generateId(): string {
  return crypto.randomUUID()
}

function buildClaimCompleteMessage(params: {
  claimId: string
  shadowProfileId: string
  address: string
  nonce: string
  issuedAt: number
  expiresAt: number
}): string {
  return [
    'heaven-claim:v1',
    `claim_id=${params.claimId}`,
    `shadow_profile_id=${params.shadowProfileId}`,
    `address=${params.address.toLowerCase()}`,
    `nonce=${params.nonce}`,
    `issued_at=${params.issuedAt}`,
    `expires_at=${params.expiresAt}`,
  ].join('\n')
}

async function verifyClaimSignature(
  message: string,
  signature: string,
  expectedAddress: string,
): Promise<boolean> {
  try {
    const sig = signature.startsWith('0x') ? signature : `0x${signature}`
    const recovered = await recoverMessageAddress({
      message,
      signature: sig as `0x${string}`,
    })
    return recovered.toLowerCase() === expectedAddress.toLowerCase()
  } catch (err) {
    console.error('[Claim] Signature verification failed:', err)
    return false
  }
}

/**
 * GET /:token - Lookup shadow profile by claim token
 *
 * Returns profile info if token is valid and unused
 */
app.get('/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB

  // Hash the token to look up
  const tokenHash = await sha256(token)

  // Find claim token
  const claimToken = await db
    .prepare(`
      SELECT ct.*, sp.display_name, sp.source, sp.source_url, sp.age_bucket,
             sp.gender_identity, sp.location, sp.anime_cid, sp.bio
      FROM claim_tokens ct
      JOIN shadow_profiles sp ON ct.shadow_profile_id = sp.id
      WHERE ct.token_hash = ? AND ct.used = 0 AND ct.expires_at > ?
    `)
    .bind(tokenHash, Date.now())
    .first<{
      id: string
      shadow_profile_id: string
      human_code_hash: string
      method: string
      expires_at: number
      display_name: string | null
      source: string
      source_url: string | null
      age_bucket: number | null
      gender_identity: number | null
      location: string | null
      anime_cid: string | null
      bio: string | null
    }>()

  if (!claimToken) {
    return c.json({ error: 'Invalid or expired link' }, 404)
  }

  // Count likes received by this shadow profile
  const likesResult = await db
    .prepare(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'shadow' AND target_id = ?`)
    .bind(claimToken.shadow_profile_id)
    .first<{ count: number }>()

  const avatarUrl = claimToken.anime_cid
    ? `https://ipfs.io/ipfs/${claimToken.anime_cid}`
    : `https://api.dicebear.com/9.x/adventurer/svg?seed=${claimToken.shadow_profile_id}`

  return c.json({
    id: claimToken.shadow_profile_id,
    displayName: claimToken.display_name || 'Anonymous',
    avatarUrl,
    source: claimToken.source,
    sourceUrl: claimToken.source_url,
    age: claimToken.age_bucket?.toString(),
    gender: claimToken.gender_identity?.toString(),
    location: claimToken.location,
    bio: claimToken.bio,
    likesReceived: likesResult?.count || 0,
    // Don't expose actual code - frontend will call /start to get it
    hasVerificationCode: !!claimToken.human_code_hash,
  })
})

/**
 * POST /start - Start claim process, generate verification code
 *
 * Body: { shadowProfileId: string, method: 'bio_edit' | 'dm' }
 */
app.post('/start', async (c) => {
  const configuredSecret = c.env.CLAIM_START_SECRET
  const providedSecret = c.req.header('X-Claim-Start-Secret')

  if (!configuredSecret) {
    if (c.env.ENVIRONMENT !== 'development') {
      return c.json({ error: 'Claim start is disabled (server misconfiguration)' }, 503)
    }
  } else if (providedSecret !== configuredSecret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json<{ shadowProfileId: string; method: 'bio_edit' | 'dm' }>()
  const { shadowProfileId, method } = body

  if (!shadowProfileId || !method) {
    return c.json({ error: 'Missing shadowProfileId or method' }, 400)
  }
  if (method !== 'bio_edit' && method !== 'dm') {
    return c.json({ error: 'Invalid claim method' }, 400)
  }

  const db = c.env.DB

  // Check shadow profile exists and is not claimed
  const profile = await db
    .prepare(`SELECT id, source, source_url FROM shadow_profiles WHERE id = ? AND claimed_address IS NULL`)
    .bind(shadowProfileId)
    .first<{ id: string; source: string; source_url: string | null }>()

  if (!profile) {
    return c.json({ error: 'Profile not found or already claimed' }, 404)
  }

  // Generate tokens
  const token = generateToken()
  const tokenHash = await sha256(token)
  const humanCode = generateHumanCode()
  const humanCodeHash = await sha256(humanCode)
  const id = generateId()
  const now = Date.now()
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000 // 7 days

  // Insert claim token
  await db
    .prepare(`
      INSERT INTO claim_tokens (id, shadow_profile_id, token_hash, human_code_hash, method, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, shadowProfileId, tokenHash, humanCodeHash, method, now, expiresAt)
    .run()

  return c.json({
    claimId: id,
    token, // For building claim URL
    verificationCode: humanCode, // For bio edit
    expiresAt,
    source: profile.source,
    sourceUrl: profile.source_url,
  })
})

/**
 * POST /verify-bio - Verify bio contains the code
 *
 * Body: { claimId: string }
 *
 * In V0, this is a stub that always succeeds after a delay.
 * Real implementation would re-scrape the source profile.
 */
app.post('/verify-bio', async (c) => {
  const body = await c.req.json<{ claimId: string }>()
  const { claimId } = body

  if (!claimId) {
    return c.json({ error: 'Missing claimId' }, 400)
  }

  const db = c.env.DB

  // Find the claim token
  const claimToken = await db
    .prepare(`SELECT * FROM claim_tokens WHERE id = ? AND used = 0 AND expires_at > ?`)
    .bind(claimId, Date.now())
    .first<{ id: string; shadow_profile_id: string; method: string }>()

  if (!claimToken) {
    return c.json({ error: 'Invalid or expired claim' }, 404)
  }

  if (claimToken.method !== 'bio_edit') {
    return c.json({ error: 'Wrong verification method' }, 400)
  }

  // TODO: Real implementation would:
  // 1. Fetch the source profile URL
  // 2. Scrape the HTML
  // 3. Search for the human code in the bio
  // 4. Return success/failure

  // V0 stub: Always succeed (for testing)
  return c.json({
    verified: true,
    message: 'Bio verification successful',
  })
})

/**
 * POST /verify-dm - Verify DM token
 *
 * Body: { shadowProfileId: string, code: string }
 */
app.post('/verify-dm', async (c) => {
  const body = await c.req.json<{ shadowProfileId: string; code: string }>()
  const { shadowProfileId, code } = body

  if (!shadowProfileId || !code) {
    return c.json({ error: 'Missing shadowProfileId or code' }, 400)
  }

  const db = c.env.DB
  const codeHash = await sha256(code.toUpperCase().trim())

  // Find matching claim token
  const claimToken = await db
    .prepare(`
      SELECT * FROM claim_tokens
      WHERE shadow_profile_id = ? AND human_code_hash = ? AND method = 'dm' AND used = 0 AND expires_at > ?
    `)
    .bind(shadowProfileId, codeHash, Date.now())
    .first<{ id: string }>()

  if (!claimToken) {
    return c.json({ error: 'Invalid code' }, 400)
  }

  return c.json({
    verified: true,
    claimId: claimToken.id,
  })
})

/**
 * POST /complete - Complete the claim (after passkey creation)
 *
 * Body: { claimId: string, address: string, signature: string, timestamp: number, nonce: string }
 *
 * Requires claimant signature from the claimed PKP address.
 */
app.post('/complete', async (c) => {
  const body = await c.req.json<{
    claimId: string
    address: string
    signature: string
    timestamp: number
    nonce: string
  }>()
  const { claimId, address, signature, timestamp, nonce } = body

  if (!claimId || !address || !signature || !nonce || !timestamp) {
    return c.json({ error: 'Missing claimId, address, signature, timestamp, or nonce' }, 400)
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ error: 'Invalid address format' }, 400)
  }
  const normalizedAddress = address.toLowerCase()

  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    return c.json({ error: 'Invalid signature format' }, 400)
  }

  if (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128) {
    return c.json({ error: 'Invalid nonce' }, 400)
  }

  if (!Number.isInteger(timestamp)) {
    return c.json({ error: 'Invalid timestamp' }, 400)
  }

  const db = c.env.DB
  const nowMs = Date.now()
  const nowSeconds = Math.floor(nowMs / 1000)
  if (Math.abs(nowSeconds - timestamp) > CLAIM_SIGNATURE_WINDOW_SECONDS) {
    return c.json({ error: 'Signature timestamp expired or too far in future' }, 400)
  }
  const signatureExpiresAt = timestamp + CLAIM_SIGNATURE_WINDOW_SECONDS

  // Find the claim token
  const claimToken = await db
    .prepare(`SELECT * FROM claim_tokens WHERE id = ? AND used = 0 AND expires_at > ?`)
    .bind(claimId, nowMs)
    .first<{ id: string; shadow_profile_id: string }>()

  if (!claimToken) {
    return c.json({ error: 'Invalid or expired claim' }, 404)
  }

  const message = buildClaimCompleteMessage({
    claimId,
    shadowProfileId: claimToken.shadow_profile_id,
    address: normalizedAddress,
    nonce,
    issuedAt: timestamp,
    expiresAt: signatureExpiresAt,
  })
  const validSig = await verifyClaimSignature(message, signature, normalizedAddress)
  if (!validSig) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Start transaction-like operations.
  // D1 batch is atomic and protects against partial update on conflicts.
  try {
    const results = await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO users (address, created_at, directory_tier)
        VALUES (?, ?, 'claimed')
      `)
        .bind(normalizedAddress, nowMs),

      db.prepare(`
        UPDATE shadow_profiles
        SET claimed_address = ?, claimed_at = ?, updated_at = ?
        WHERE id = ? AND claimed_address IS NULL
      `)
        .bind(normalizedAddress, nowMs, nowMs, claimToken.shadow_profile_id),

      db.prepare(`
        UPDATE claim_tokens
        SET used = 1, used_at = ?, used_by_address = ?
        WHERE id = ? AND used = 0 AND expires_at > ?
      `)
        .bind(nowMs, normalizedAddress, claimId, nowMs),
    ])

    const shadowUpdated = results[1]?.meta?.changes ?? 0
    const tokenUpdated = results[2]?.meta?.changes ?? 0
    if (shadowUpdated !== 1 || tokenUpdated !== 1) {
      return c.json({ error: 'Claim already completed or no longer available' }, 409)
    }

    // 4. Transfer any likes from shadow to user
    // (Likes to the shadow profile should now be associated with the user)
    // This is handled by the shadow_profiles.claimed_address link

    return c.json({
      success: true,
      message: 'Profile claimed successfully',
      address: normalizedAddress,
    })
  } catch (err) {
    console.error('[Claim] Complete failed:', err)
    return c.json({ error: 'Failed to complete claim' }, 500)
  }
})

export default app
