/**
 * Self.xyz Verification Routes
 *
 * Passport-based identity verification using Self.xyz ZK proofs
 *
 * Endpoints:
 * - POST /session       - Create verification session, return deeplink
 * - POST /verify        - Receive proof from Self relayer (webhook)
 * - GET  /session/:id   - Poll for verification result
 * - GET  /identity/:address - Get stored identity for a user
 */

import { Hono } from 'hono'
import type {
  Env,
  SelfVerificationRow,
  UserIdentityRow,
  SelfSessionRequest,
  SelfSessionResponse,
  SelfVerifyRequest,
  SelfVerifyResponse,
  SelfSessionStatusResponse,
} from '../types'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// Constants
// ============================================================================

const SESSION_EXPIRY_SECONDS = 10 * 60  // 10 minutes
const SELF_UNIVERSAL_LINK_BASE = 'https://redirect.self.xyz'
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

// Mirrors @selfxyz/core discloseIndices[*].nullifierIndex for supported attestation IDs.
const NULLIFIER_INDEX_BY_ATTESTATION: Record<number, number> = {
  1: 7, // PASSPORT
  2: 8, // BIOMETRIC_ID_CARD
  3: 0, // AADHAAR
  4: 14, // SELFRICA_ID_CARD
}

// ============================================================================
// Helpers
// ============================================================================

type SelfEndpointType = 'https' | 'staging_https'

interface SelfAppPayload {
  appName: string
  logoBase64: string
  endpointType: SelfEndpointType
  endpoint: string
  deeplinkCallback: string
  header: string
  scope: string
  sessionId: string
  userId: string
  userIdType: 'hex'
  devMode: boolean
  disclosures: {
    date_of_birth: boolean
    nationality: boolean
    minimumAge: number
  }
  version: number
  chainID: 42220 | 11142220
  userDefinedData: string
}

function isSelfMockMode(env: Env): boolean {
  return env.SELF_MOCK_PASSPORT === 'true' || env.ENVIRONMENT === 'development'
}

function resolveSelfEndpoint(env: Env, requestUrl: string): string {
  const configured = env.SELF_ENDPOINT?.trim()
  if (configured) return configured
  return `${new URL(requestUrl).origin}/api/self/verify`
}

function resolveAppScope(env: Env): string {
  return (env.APP_SCOPE || env.SELF_SCOPE || 'heaven').trim()
}

function resolveAppDisplayName(env: Env): string {
  return (env.APP_DISPLAY_NAME || 'App').trim() || 'App'
}

function resolveAppDeeplinkScheme(env: Env): string {
  return (env.APP_DEEPLINK_SCHEME || 'heaven').trim()
}

function resolveNullifierNamespace(env: Env): string {
  return (env.APP_NULLIFIER_NAMESPACE || 'heaven-names:v1').trim()
}

function generateSessionId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function normalizeAddress(address: string): string | null {
  if (!address) return null
  const clean = address.toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(clean)) return null
  return clean
}

function normalizeBytes32(input: string | null | undefined): string | null {
  if (!input) return null
  const clean = input.toLowerCase().trim()
  if (!/^0x[a-f0-9]{64}$/.test(clean)) return null
  return clean
}

/**
 * Calculate age from date of birth string (YYYY-MM-DD format)
 */
function calculateAge(dob: string): number {
  const birthDate = new Date(dob)
  const today = new Date()

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  // Adjust if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  return age
}

/**
 * Hash proof data for audit trail (don't store full proof)
 */
async function hashProof(proof: SelfVerifyRequest['proof']): Promise<string> {
  const data = JSON.stringify(proof)
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function parseSignalAsBytes32(signal: string | null | undefined): string | null {
  if (!signal) return null
  const raw = signal.trim()
  if (!raw) return null

  let value: bigint
  try {
    if (raw.startsWith('0x') || raw.startsWith('0X')) {
      if (!/^0x[0-9a-fA-F]+$/.test(raw)) return null
      value = BigInt(raw)
    } else {
      if (/^[0-9]+$/.test(raw)) {
        value = BigInt(raw)
      } else if (/^[0-9a-fA-F]+$/.test(raw)) {
        value = BigInt(`0x${raw}`)
      } else {
        return null
      }
    }
  } catch {
    return null
  }

  const max = (1n << 256n) - 1n
  if (value < 0n || value > max) return null
  return `0x${value.toString(16).padStart(64, '0')}`
}

async function hashToBytes32(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `0x${hex}`
}

async function deriveIdentityNullifierHash(params: {
  env: Env
  attestationId: number
  publicSignals: string[]
  userAddress: string
  userContextData: string
  isMockMode: boolean
}): Promise<string | null> {
  const { env, attestationId, publicSignals, userAddress, userContextData, isMockMode } = params
  const signals = Array.isArray(publicSignals) ? publicSignals : []

  const preferredIndex = NULLIFIER_INDEX_BY_ATTESTATION[attestationId]
  if (preferredIndex === undefined) {
    if (!isMockMode) return null
    const mockRawNullifier = await hashToBytes32(
      `self-mock-nullifier:v1:${userAddress.toLowerCase()}:${attestationId}:${userContextData}`,
    )
    const scope = resolveAppScope(env).toLowerCase()
    const namespace = resolveNullifierNamespace(env)
    return hashToBytes32(`${namespace}:${scope}:${mockRawNullifier.toLowerCase()}`)
  }

  let rawNullifier = parseSignalAsBytes32(signals[preferredIndex])

  // In mock mode, publicSignals are often synthetic/minimal or missing expected index values.
  if ((!rawNullifier || rawNullifier === ZERO_BYTES32) && isMockMode) {
    rawNullifier = await hashToBytes32(
      `self-mock-nullifier:v1:${userAddress.toLowerCase()}:${attestationId}:${userContextData}`,
    )
  }

  if (!rawNullifier || rawNullifier === ZERO_BYTES32) return null

  const scope = resolveAppScope(env).toLowerCase()
  const namespace = resolveNullifierNamespace(env)
  return hashToBytes32(`${namespace}:${scope}:${rawNullifier.toLowerCase()}`)
}

/**
 * Build the Self.xyz universal link for mobile deeplink
 */
function buildSelfDeeplink(
  env: Env,
  sessionId: string,
  endpoint: string,
  scope: string,
  callbackUrl: string,
  userAddress: string,
  mockMode: boolean
): string {
  const selfApp: SelfAppPayload = {
    appName: resolveAppDisplayName(env),
    logoBase64: '',
    endpointType: mockMode ? 'staging_https' : 'https',
    endpoint,
    deeplinkCallback: callbackUrl,
    header: 'Verify with Self',
    scope,
    sessionId,
    userId: userAddress,
    userIdType: 'hex',
    devMode: mockMode,
    disclosures: {
      date_of_birth: false,
      nationality: true,
      minimumAge: 18,
    },
    version: 2,
    chainID: mockMode ? 11142220 : 42220,
    userDefinedData: sessionId,
  }

  const params = new URLSearchParams({
    selfApp: JSON.stringify(selfApp),
  })

  return `${SELF_UNIVERSAL_LINK_BASE}?${params.toString()}`
}

function hexToUtf8(hex: string): string | null {
  if (!hex || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((pair) => parseInt(pair, 16)))
  try {
    return new TextDecoder().decode(bytes).trim()
  } catch {
    return null
  }
}

/**
 * Extract session ID from Self userContextData.
 * Accepts plain id, "sessionId:...", "session:...", and URL/query-style payloads.
 */
function extractSessionId(userContextData: string): string | null {
  if (!userContextData) return null

  let raw = userContextData.trim()
  if (!raw) return null

  // If context arrives URL-encoded, decode once.
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // Keep original raw value when decode fails.
  }

  // If context is a URL, read session/sessionId from query params.
  try {
    const parsed = new URL(raw)
    const querySession = parsed.searchParams.get('sessionId') || parsed.searchParams.get('session')
    if (querySession && /^[a-f0-9]{16,64}$/i.test(querySession.trim())) {
      return querySession.trim().toLowerCase()
    }
  } catch {
    // Not a URL payload, continue with other parsers.
  }

  // For payloads like "sessionId:abc|dob:...|nat:..." only inspect first segment.
  const firstSegment = raw.split('|')[0].trim()

  const queryMatch = firstSegment.match(/(?:^|[?&])(sessionId|session)=([a-f0-9]{16,64})/i)
  if (queryMatch) return queryMatch[2].toLowerCase()

  const colonMatch = firstSegment.match(/^(sessionId|session)\s*:\s*([a-f0-9]{16,64})$/i)
  if (colonMatch) return colonMatch[2].toLowerCase()

  if (/^[a-f0-9]{16,64}$/i.test(firstSegment)) {
    return firstSegment.toLowerCase()
  }

  // Self packs userContextData as solidityPacked(bytes32 chainId, bytes32 userId, bytes userDefinedData).
  // If we receive packed hex, decode userDefinedData and try parsing a session id from it.
  const compactHex = firstSegment.replace(/^0x/i, '')
  if (/^[a-f0-9]+$/i.test(compactHex) && compactHex.length > 128) {
    const userDefinedDataHex = compactHex.slice(128)
    const decoded = hexToUtf8(userDefinedDataHex)
    if (decoded) {
      const nested = decoded.match(/([a-f0-9]{16,64})/i)
      if (nested) return nested[1].toLowerCase()
    }
  }

  return null
}

// ============================================================================
// POST /session - Create verification session
// ============================================================================

app.post('/session', async (c) => {
  const body = await c.req.json<SelfSessionRequest>()

  // Validate address
  const address = normalizeAddress(body.userAddress)
  if (!address) {
    return c.json({ error: 'Invalid address' }, 400)
  }

  // Check if user already has verified identity
  const existingIdentity = await c.env.DB.prepare(`
    SELECT * FROM user_identity WHERE user_address = ?
  `).bind(address).first<UserIdentityRow>()

  if (existingIdentity) {
    const hasShortNameCredential = normalizeBytes32(existingIdentity.identity_nullifier_hash) !== null
    if (!hasShortNameCredential) {
      // Legacy verification rows (pre-nullifier rollout) must be able to re-verify once
      // to mint the app-scoped nullifier used by short-name purchase policy.
      console.log(`[Self] Identity refresh required for ${address}: missing short-name credential`)
    } else {
      return c.json({
        error: 'Already verified',
        age: existingIdentity.age_at_verification,
        nationality: existingIdentity.nationality,
        hasShortNameCredential: true,
      }, 400)
    }
  }

  // Check for existing pending session
  const now = Math.floor(Date.now() / 1000)
  const existingSession = await c.env.DB.prepare(`
    SELECT * FROM self_verifications
    WHERE user_address = ? AND status = 'pending' AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(address, now).first<SelfVerificationRow>()

  if (existingSession) {
    // Return existing session
    const scope = resolveAppScope(c.env)
    const endpoint = resolveSelfEndpoint(c.env, c.req.url)
    const callbackScheme = resolveAppDeeplinkScheme(c.env)
    const callbackUrl = `${callbackScheme}://self/callback?sessionId=${existingSession.session_id}`
    const mockMode = isSelfMockMode(c.env)

    const response: SelfSessionResponse = {
      sessionId: existingSession.session_id,
      deeplinkUrl: buildSelfDeeplink(c.env, existingSession.session_id, endpoint, scope, callbackUrl, address, mockMode),
      expiresAt: existingSession.expires_at,
    }
    return c.json(response)
  }

  // Create new session
  const sessionId = generateSessionId()
  const expiresAt = now + SESSION_EXPIRY_SECONDS

  await c.env.DB.prepare(`
    INSERT INTO self_verifications (session_id, user_address, status, created_at, expires_at)
    VALUES (?, ?, 'pending', ?, ?)
  `).bind(sessionId, address, now, expiresAt).run()

  // Build deeplink URL
  const scope = resolveAppScope(c.env)
  const endpoint = resolveSelfEndpoint(c.env, c.req.url)
  const callbackScheme = resolveAppDeeplinkScheme(c.env)
  const callbackUrl = `${callbackScheme}://self/callback?sessionId=${sessionId}`
  const mockMode = isSelfMockMode(c.env)

  const response: SelfSessionResponse = {
    sessionId,
    deeplinkUrl: buildSelfDeeplink(c.env, sessionId, endpoint, scope, callbackUrl, address, mockMode),
    expiresAt,
  }

  console.log(`[Self] Created session ${sessionId} for ${address}`)
  return c.json(response)
})

// ============================================================================
// POST /verify - Receive proof from Self relayer (webhook)
// ============================================================================

app.post('/verify', async (c) => {
  const body = await c.req.json<SelfVerifyRequest>()

  // Extract session ID from userContextData
  const sessionId = extractSessionId(body.userContextData)

  if (!sessionId) {
    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Missing session ID in userContextData',
    }
    return c.json(response, 200)  // Self expects 200 even on errors
  }

  // Find session
  const session = await c.env.DB.prepare(`
    SELECT * FROM self_verifications WHERE session_id = ?
  `).bind(sessionId).first<SelfVerificationRow>()

  if (!session) {
    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Session not found',
    }
    return c.json(response, 200)
  }

  const now = Math.floor(Date.now() / 1000)

  // Check session status
  if (session.status !== 'pending') {
    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: `Session already ${session.status}`,
    }
    return c.json(response, 200)
  }

  if (session.expires_at < now) {
    await c.env.DB.prepare(`
      UPDATE self_verifications SET status = 'expired' WHERE session_id = ?
    `).bind(sessionId).run()

    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Session expired',
    }
    return c.json(response, 200)
  }

  // TODO: Verify the ZK proof using SelfBackendVerifier
  // For now, we'll simulate verification in dev mode
  // In production, this would use @selfxyz/core SelfBackendVerifier

  // Parse disclosed data from publicSignals
  // The exact indices depend on Self's circuit - this is a simplified extraction
  // In production, use SelfBackendVerifier which handles this properly

  // For development/testing, check if mock mode is enabled
  const isMockMode = isSelfMockMode(c.env)

  let dateOfBirth: string | null = null
  let nationality: string | null = null
  let verificationValid = false

  if (isMockMode) {
    // In mock mode, extract from a test format or use defaults
    // Real implementation would parse publicSignals properly
    console.log('[Self] Mock mode - simulating verification')

    // For testing, we'll look for test data in the proof
    // Real Self proofs have DOB and nationality encoded in publicSignals
    // Example test format in userContextData: "sessionId:abc123|dob:1995-03-15|nat:USA"
    const parts = body.userContextData.split('|')
    for (const part of parts) {
      if (part.startsWith('dob:')) {
        dateOfBirth = part.substring(4)
      } else if (part.startsWith('nat:')) {
        nationality = part.substring(4)
      }
    }

    // Use defaults for testing if not provided
    if (!dateOfBirth) dateOfBirth = '1995-01-15'  // Makes them ~31
    if (!nationality) nationality = 'USA'

    verificationValid = true
  } else {
    // Production: Use SelfBackendVerifier
    // This requires the @selfxyz/core package which may not work in Workers
    // Alternative: Call Self's verification API or run verification in a separate service

    // For now, return error in production until proper integration
    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Production verification not yet implemented',
    }
    return c.json(response, 200)
  }

  if (!verificationValid || !dateOfBirth || !nationality) {
    // Mark session as failed
    await c.env.DB.prepare(`
      UPDATE self_verifications
      SET status = 'failed', failure_reason = 'Verification failed'
      WHERE session_id = ?
    `).bind(sessionId).run()

    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Verification failed',
    }
    return c.json(response, 200)
  }

  // Calculate age from DOB
  const age = calculateAge(dateOfBirth)

  // Check minimum age (must be 18+)
  if (age < 18) {
    await c.env.DB.prepare(`
      UPDATE self_verifications
      SET status = 'failed', failure_reason = 'Must be 18 or older'
      WHERE session_id = ?
    `).bind(sessionId).run()

    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Must be 18 or older',
    }
    return c.json(response, 200)
  }

  // Hash proof for audit trail
  const proofHash = await hashProof(body.proof)

  const identityNullifierHash = await deriveIdentityNullifierHash({
    env: c.env,
    attestationId: body.attestationId,
    publicSignals: body.publicSignals || [],
    userAddress: session.user_address,
    userContextData: body.userContextData || '',
    isMockMode,
  })

  if (!identityNullifierHash) {
    await c.env.DB.prepare(`
      UPDATE self_verifications
      SET status = 'failed', failure_reason = 'Missing nullifier in publicSignals'
      WHERE session_id = ?
    `).bind(sessionId).run()

    const response: SelfVerifyResponse = {
      status: 'error',
      result: false,
      reason: 'Missing nullifier in publicSignals',
    }
    return c.json(response, 200)
  }

  // Update session with verified data
  await c.env.DB.prepare(`
    UPDATE self_verifications
    SET status = 'verified',
        date_of_birth = ?,
        age = ?,
        nationality = ?,
        attestation_id = ?,
        proof_hash = ?,
        verified_at = ?
    WHERE session_id = ?
  `).bind(
    dateOfBirth,
    age,
    nationality,
    body.attestationId,
    proofHash,
    now,
    sessionId
  ).run()

  // Store in user_identity table
  await c.env.DB.prepare(`
    INSERT INTO user_identity (user_address, date_of_birth, age_at_verification, nationality, identity_nullifier_hash, verification_session_id, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_address) DO UPDATE SET
      date_of_birth = excluded.date_of_birth,
      age_at_verification = excluded.age_at_verification,
      nationality = excluded.nationality,
      identity_nullifier_hash = excluded.identity_nullifier_hash,
      verification_session_id = excluded.verification_session_id,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  `).bind(
    session.user_address,
    dateOfBirth,
    age,
    nationality,
    identityNullifierHash,
    sessionId,
    now,
    now,
    now
  ).run()

  // Update user's directory tier to 'verified'
  await c.env.DB.prepare(`
    UPDATE users SET directory_tier = 'verified' WHERE address = ?
  `).bind(session.user_address).run()

  console.log(`[Self] Verified ${session.user_address}: age=${age}, nationality=${nationality}`)

  const response: SelfVerifyResponse = {
    status: 'success',
    result: true,
  }
  return c.json(response, 200)
})

// ============================================================================
// GET /session/:id - Poll for verification result
// ============================================================================

app.get('/session/:id', async (c) => {
  const sessionId = c.req.param('id')

  const session = await c.env.DB.prepare(`
    SELECT * FROM self_verifications WHERE session_id = ?
  `).bind(sessionId).first<SelfVerificationRow>()

  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Check if expired
  const now = Math.floor(Date.now() / 1000)
  if (session.status === 'pending' && session.expires_at < now) {
    await c.env.DB.prepare(`
      UPDATE self_verifications SET status = 'expired' WHERE session_id = ?
    `).bind(sessionId).run()
    session.status = 'expired'
  }

  const response: SelfSessionStatusResponse = {
    status: session.status,
  }

  if (session.status === 'verified') {
    response.age = session.age ?? undefined
    response.nationality = session.nationality ?? undefined
    response.verifiedAt = session.verified_at ?? undefined
  } else if (session.status === 'failed') {
    response.reason = session.failure_reason ?? 'Unknown error'
  }

  return c.json(response)
})

// ============================================================================
// GET /identity/:address - Get stored identity for a user
// ============================================================================

app.get('/identity/:address', async (c) => {
  const addressParam = c.req.param('address')
  const address = normalizeAddress(addressParam)

  if (!address) {
    return c.json({ error: 'Invalid address' }, 400)
  }

  const identity = await c.env.DB.prepare(`
    SELECT * FROM user_identity WHERE user_address = ?
  `).bind(address).first<UserIdentityRow>()

  if (!identity) {
    return c.json({ error: 'No verified identity found' }, 404)
  }

  // Calculate current age (may differ from age_at_verification if time has passed)
  const currentAge = calculateAge(identity.date_of_birth)

  return c.json({
    address: identity.user_address,
    dateOfBirth: identity.date_of_birth,
    ageAtVerification: identity.age_at_verification,
    currentAge,
    nationality: identity.nationality,
    verifiedAt: identity.verified_at,
    hasShortNameCredential: normalizeBytes32(identity.identity_nullifier_hash) !== null,
  })
})

export default app
