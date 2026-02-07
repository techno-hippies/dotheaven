/**
 * Heaven Names Registry
 *
 * Off-chain SLD registry for .heaven TLD
 *
 * Endpoints:
 * - GET  /dns/resolve?label=...&tld=heaven  (internal, for dns-server)
 * - GET  /available/:label
 * - GET  /reverse/:pkp
 * - GET  /:label
 * - POST /register
 * - POST /renew
 * - POST /update
 */

import { Hono } from 'hono'
import { recoverMessageAddress } from 'viem'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// Constants
// ============================================================================

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60
const GRACE_PERIOD_SECONDS = 30 * 24 * 60 * 60 // 30 days

// Gateway IP for DNS A records
const GATEWAY_IP = '144.126.205.242'

// TTLs for DNS responses
const TTL_POSITIVE = 300  // 5 minutes for active names
const TTL_NEGATIVE = 60   // 1 minute for NXDOMAIN (new registrations appear quickly)

// System reserved names (hardcoded, cannot be registered)
const SYSTEM_RESERVED = new Set([
  // Infrastructure
  'www', 'api', 'ns1', 'ns2', 'ns3', 'mail', 'smtp', 'pop', 'imap', 'ftp',
  'cdn', 'static', 'assets', 'img', 'images', 'media',
  // Auth/Admin
  'admin', 'root', 'auth', 'oauth', 'login', 'logout', 'signin', 'signout',
  'signup', 'register', 'account', 'accounts', 'user', 'users', 'profile',
  'settings', 'config', 'configuration',
  // Support
  'support', 'help', 'contact', 'feedback', 'report', 'abuse',
  'billing', 'payments', 'subscription',
  // Status
  'status', 'health', 'ping', 'dashboard', 'metrics', 'analytics',
  // Brand protection
  'heaven', 'heavens', 'official', 'team', 'staff', 'moderator', 'mod',
  'founder', 'founders', 'employee', 'employees',
  // Security
  'security', 'secure', 'ssl', 'tls', 'cert', 'certs', 'certificate',
  'postmaster', 'webmaster', 'hostmaster',
  // Common
  'test', 'testing', 'demo', 'example', 'sample', 'null', 'undefined',
  'true', 'false', 'localhost', 'local',
])

// ============================================================================
// Label Validation
// ============================================================================

// Valid label: lowercase a-z, 0-9, hyphen (not at start/end), 4-63 chars
const VALID_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export type LabelValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: 'empty' | 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' }

export function validateLabel(input: string): LabelValidationResult {
  if (!input) {
    return { valid: false, reason: 'empty' }
  }

  // Normalize: lowercase, trim
  const label = input.toLowerCase().trim()

  if (label.length < 4) {
    return { valid: false, reason: 'too_short' }
  }

  if (label.length > 63) {
    return { valid: false, reason: 'too_long' }
  }

  if (!VALID_LABEL_REGEX.test(label)) {
    return { valid: false, reason: 'invalid_chars' }
  }

  if (SYSTEM_RESERVED.has(label)) {
    return { valid: false, reason: 'reserved' }
  }

  return { valid: true, normalized: label }
}

// Normalize PKP address to lowercase with 0x prefix
function normalizePkpAddress(address: string): string | null {
  if (!address) return null
  const addr = address.toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return null
  return addr
}

// ============================================================================
// Database Types
// ============================================================================

interface HeavenNameRow {
  label: string
  label_display: string | null
  pkp_address: string
  status: 'active' | 'expired'
  registered_at: number
  expires_at: number
  grace_ends_at: number
  profile_cid: string | null
  created_at: number
  updated_at: number
}

interface HeavenReservedRow {
  label: string
  reason: string | null
  created_at: number
}

// ============================================================================
// GET /dns/resolve - Internal endpoint for dns-server
// ============================================================================

interface DnsResolveResponse {
  tld: string
  label: string
  status: 'active' | 'expired' | 'unregistered' | 'reserved'
  records?: {
    A: string[]
    AAAA: string[]
    TXT: string[]
  }
  ttl_positive: number
  ttl_negative: number
  expires_at?: number
}

app.get('/dns/resolve', async (c) => {
  // Require DNS_SHARED_SECRET for internal dns-server access
  const authHeader = c.req.header('Authorization') ?? ''
  const secret = c.env.DNS_SHARED_SECRET

  // Only allow unauthenticated access in development environment
  if (!secret) {
    if (c.env.ENVIRONMENT !== 'development') {
      console.error('[DNS Resolve] DNS_SHARED_SECRET not set in non-dev environment!')
      return c.json({ error: 'Server misconfiguration' }, 500)
    }
    console.warn('[DNS Resolve] DNS_SHARED_SECRET not set - allowing unauthenticated access in dev')
  } else if (authHeader !== `Bearer ${secret}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const label = c.req.query('label')
  const tld = c.req.query('tld') || 'heaven'

  if (tld !== 'heaven') {
    return c.json({ error: 'Unsupported TLD' }, 400)
  }

  if (!label) {
    return c.json({ error: 'Missing label parameter' }, 400)
  }

  // Validate label format (fast reject before DB)
  const validation = validateLabel(label)
  if (!validation.valid) {
    const response: DnsResolveResponse = {
      tld,
      label,
      status: validation.reason === 'reserved' ? 'reserved' : 'unregistered',
      ttl_positive: TTL_POSITIVE,
      ttl_negative: TTL_NEGATIVE,
    }
    return c.json(response)
  }

  const normalizedLabel = validation.normalized

  // Check policy-reserved table
  const reserved = await c.env.DB.prepare(
    'SELECT label FROM heaven_reserved WHERE label = ?'
  ).bind(normalizedLabel).first<HeavenReservedRow>()

  if (reserved) {
    const response: DnsResolveResponse = {
      tld,
      label: normalizedLabel,
      status: 'reserved',
      ttl_positive: TTL_POSITIVE,
      ttl_negative: TTL_NEGATIVE,
    }
    return c.json(response)
  }

  // Look up the name
  const row = await c.env.DB.prepare(
    'SELECT * FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<HeavenNameRow>()

  const now = Math.floor(Date.now() / 1000)

  if (!row) {
    const response: DnsResolveResponse = {
      tld,
      label: normalizedLabel,
      status: 'unregistered',
      ttl_positive: TTL_POSITIVE,
      ttl_negative: TTL_NEGATIVE,
    }
    return c.json(response)
  }

  // Check if expired (past grace period)
  if (now > row.grace_ends_at) {
    // Fully expired - treat as unregistered
    const response: DnsResolveResponse = {
      tld,
      label: normalizedLabel,
      status: 'unregistered',
      ttl_positive: TTL_POSITIVE,
      ttl_negative: TTL_NEGATIVE,
    }
    return c.json(response)
  }

  // Check if in grace period
  if (now > row.expires_at) {
    const response: DnsResolveResponse = {
      tld,
      label: normalizedLabel,
      status: 'expired',
      expires_at: row.expires_at,
      ttl_positive: TTL_POSITIVE,
      ttl_negative: TTL_NEGATIVE,
    }
    return c.json(response)
  }

  // Active name - return full records
  const txtRecord = `pkp=${row.pkp_address}${row.profile_cid ? `;cid=${row.profile_cid}` : ''};v=1`

  const response: DnsResolveResponse = {
    tld,
    label: normalizedLabel,
    status: 'active',
    records: {
      A: [GATEWAY_IP],
      AAAA: [], // No IPv6 for now
      TXT: [txtRecord],
    },
    ttl_positive: TTL_POSITIVE,
    ttl_negative: TTL_NEGATIVE,
    expires_at: row.expires_at,
  }

  return c.json(response)
})

// ============================================================================
// GET /available/:label - Check if a name is available
// ============================================================================

interface AvailableResponse {
  available: boolean
  reason?: 'taken' | 'reserved' | 'invalid' | 'too_short' | 'too_long' | 'empty' | 'invalid_chars' | 'expired_grace'
}

app.get('/available/:label', async (c) => {
  const label = c.req.param('label')

  const validation = validateLabel(label)
  if (!validation.valid) {
    const response: AvailableResponse = {
      available: false,
      reason: validation.reason,
    }
    return c.json(response)
  }

  const normalizedLabel = validation.normalized

  // Check policy-reserved
  const reserved = await c.env.DB.prepare(
    'SELECT label FROM heaven_reserved WHERE label = ?'
  ).bind(normalizedLabel).first()

  if (reserved) {
    return c.json({ available: false, reason: 'reserved' } as AvailableResponse)
  }

  // Check if name exists
  const row = await c.env.DB.prepare(
    'SELECT expires_at, grace_ends_at FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<{ expires_at: number; grace_ends_at: number }>()

  if (!row) {
    return c.json({ available: true } as AvailableResponse)
  }

  const now = Math.floor(Date.now() / 1000)

  // If past grace period, name is available for re-registration
  if (now > row.grace_ends_at) {
    return c.json({ available: true } as AvailableResponse)
  }

  // If in grace period, taken but the owner could still renew
  if (now > row.expires_at) {
    return c.json({ available: false, reason: 'expired_grace' } as AvailableResponse)
  }

  return c.json({ available: false, reason: 'taken' } as AvailableResponse)
})

// ============================================================================
// GET /reverse/:pkp - Reverse lookup PKP -> name (for onboarding!)
// ============================================================================

interface ReverseResponse {
  label: string
  label_display: string | null
  expires_at: number
  status: 'active' | 'expired'
}

app.get('/reverse/:pkp', async (c) => {
  const pkpParam = c.req.param('pkp')
  const pkp = normalizePkpAddress(pkpParam)

  if (!pkp) {
    return c.json({ error: 'Invalid PKP address' }, 400)
  }

  const row = await c.env.DB.prepare(
    'SELECT label, label_display, expires_at, grace_ends_at FROM heaven_names WHERE pkp_address = ? ORDER BY registered_at DESC LIMIT 1'
  ).bind(pkp).first<HeavenNameRow>()

  if (!row) {
    return c.json({ error: 'No name found for this PKP' }, 404)
  }

  const now = Math.floor(Date.now() / 1000)

  // If fully expired (past grace), don't return it
  if (now > row.grace_ends_at) {
    return c.json({ error: 'No active name found for this PKP' }, 404)
  }

  const response: ReverseResponse = {
    label: row.label,
    label_display: row.label_display,
    expires_at: row.expires_at,
    status: now > row.expires_at ? 'expired' : 'active',
  }

  return c.json(response)
})

// ============================================================================
// GET /:label - Get name details
// ============================================================================

interface NameDetailsResponse {
  label: string
  label_display: string | null
  pkp_address: string
  status: 'active' | 'expired'
  registered_at: number
  expires_at: number
  profile_cid: string | null
}

app.get('/:label', async (c) => {
  const label = c.req.param('label')

  const validation = validateLabel(label)
  if (!validation.valid) {
    return c.json({ error: `Invalid label: ${validation.reason}` }, 400)
  }

  const normalizedLabel = validation.normalized

  const row = await c.env.DB.prepare(
    'SELECT * FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<HeavenNameRow>()

  if (!row) {
    return c.json({ error: 'Name not found' }, 404)
  }

  const now = Math.floor(Date.now() / 1000)

  // If fully expired, don't expose details
  if (now > row.grace_ends_at) {
    return c.json({ error: 'Name not found' }, 404)
  }

  const response: NameDetailsResponse = {
    label: row.label,
    label_display: row.label_display,
    pkp_address: row.pkp_address,
    status: now > row.expires_at ? 'expired' : 'active',
    registered_at: row.registered_at,
    expires_at: row.expires_at,
    profile_cid: row.profile_cid,
  }

  return c.json(response)
})

// ============================================================================
// POST /register - Register a new name
// ============================================================================

interface RegisterRequest {
  label: string
  pkpAddress: string
  profileCid?: string
  signature: string
  nonce: string
  timestamp: number
}

interface RegisterResponse {
  success: boolean
  label?: string
  expires_at?: number
  error?: string
}

// ============================================================================
// EIP-191 Signature Verification
// ============================================================================

type HeavenAction = 'register' | 'renew' | 'update'

/**
 * Build canonical message for EIP-191 signature.
 * Must match exactly on client side for signature to verify.
 *
 * All fields are included for register/update actions to ensure integrity.
 * For renew, profile_cid is not included (it doesn't change).
 */
function buildHeavenMessage(params: {
  action: HeavenAction
  label: string
  pkp: string
  nonce: string
  issuedAt: number
  expiresAt: number
  profileCid?: string
}): string {
  const lines = [
    'heaven-registry:v1',
    `action=${params.action}`,
    'tld=heaven',
    `label=${params.label}`,
    `pkp=${params.pkp}`,
    `nonce=${params.nonce}`,
    `issued_at=${params.issuedAt}`,
    `expires_at=${params.expiresAt}`,
  ]
  // Include profile_cid for register and update (ensures integrity)
  if (params.action === 'register' || params.action === 'update') {
    lines.push(`profile_cid=${params.profileCid ?? ''}`)
  }
  return lines.join('\n')
}

/**
 * Verify EIP-191 personal_sign signature using viem.
 * Recovers the signer address and compares to expected.
 */
async function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    // Ensure signature has 0x prefix
    const sig = signature.startsWith('0x') ? signature : `0x${signature}`

    const recovered = await recoverMessageAddress({
      message,
      signature: sig as `0x${string}`,
    })

    return recovered.toLowerCase() === expectedAddress.toLowerCase()
  } catch (err) {
    console.error('[Signature Verification Error]', err)
    return false
  }
}

/**
 * Validate timestamp is within acceptable window (2 minutes).
 * Returns error message or null if valid.
 */
function validateTimestamp(timestamp: number, now: number): string | null {
  // Check expires_at - issued_at <= 120 (implicit from our 2 min window)
  // Check abs(now - issued_at) <= 120
  if (Math.abs(now - timestamp) > 120) {
    return 'Signature timestamp expired or too far in future'
  }
  return null
}

app.post('/register', async (c) => {
  const body = await c.req.json<RegisterRequest>()
  const { label, pkpAddress, profileCid, signature, nonce, timestamp } = body

  // Input hardening: validate nonce format
  if (!nonce || typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128) {
    return c.json({
      success: false,
      error: 'Invalid nonce',
    } as RegisterResponse, 400)
  }

  // Input hardening: validate profileCid length
  if (profileCid && (typeof profileCid !== 'string' || profileCid.length > 256)) {
    return c.json({
      success: false,
      error: 'profileCid too long',
    } as RegisterResponse, 400)
  }

  // Validate inputs
  const validation = validateLabel(label)
  if (!validation.valid) {
    return c.json({
      success: false,
      error: `Invalid label: ${validation.reason}`,
    } as RegisterResponse, 400)
  }
  const normalizedLabel = validation.normalized

  const pkp = normalizePkpAddress(pkpAddress)
  if (!pkp) {
    return c.json({
      success: false,
      error: 'Invalid PKP address',
    } as RegisterResponse, 400)
  }

  // Validate timestamp (must be within 2 minutes of now)
  const now = Math.floor(Date.now() / 1000)
  const sigExpiresAt = timestamp + 120 // 2 minute window

  const timestampError = validateTimestamp(timestamp, now)
  if (timestampError) {
    return c.json({
      success: false,
      error: timestampError,
    } as RegisterResponse, 400)
  }

  // Build and verify signature
  const message = buildHeavenMessage({
    action: 'register',
    label: normalizedLabel,
    pkp,
    nonce,
    issuedAt: timestamp,
    expiresAt: sigExpiresAt,
    profileCid: profileCid ?? '',
  })

  const validSig = await verifySignature(message, signature, pkp)
  if (!validSig) {
    return c.json({
      success: false,
      error: 'Invalid signature',
    } as RegisterResponse, 401)
  }

  // Check policy-reserved
  const reserved = await c.env.DB.prepare(
    'SELECT label FROM heaven_reserved WHERE label = ?'
  ).bind(normalizedLabel).first()

  if (reserved) {
    return c.json({
      success: false,
      error: 'Name is reserved',
    } as RegisterResponse, 400)
  }

  // Check if name is available
  const existing = await c.env.DB.prepare(
    'SELECT expires_at, grace_ends_at FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<{ expires_at: number; grace_ends_at: number }>()

  if (existing && now <= existing.grace_ends_at) {
    return c.json({
      success: false,
      error: now <= existing.expires_at ? 'Name is already taken' : 'Name is in grace period',
    } as RegisterResponse, 400)
  }

  // Calculate registration times
  const registeredAt = now
  const expiresAt = now + ONE_YEAR_SECONDS
  const graceEndsAt = expiresAt + GRACE_PERIOD_SECONDS

  // Atomic batch: INSERT nonce + conditional DELETE expired + INSERT name
  // D1 batch is atomic - if any statement fails, the whole batch rolls back
  try {
    const results = await c.env.DB.batch([
      // 1. Insert nonce - will fail with UNIQUE constraint if already exists
      c.env.DB.prepare(
        'INSERT INTO heaven_nonces (nonce, pkp_address, used_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(nonce, pkp, now, now + 300, now),

      // 2. Conditional delete: only if expired past grace (avoids stale read race)
      c.env.DB.prepare(
        'DELETE FROM heaven_names WHERE label = ? AND grace_ends_at < ?'
      ).bind(normalizedLabel, now),

      // 3. Insert new registration
      c.env.DB.prepare(`
        INSERT INTO heaven_names (label, label_display, pkp_address, status, registered_at, expires_at, grace_ends_at, profile_cid, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
      `).bind(
        normalizedLabel,
        label, // Keep original case for display
        pkp,
        registeredAt,
        expiresAt,
        graceEndsAt,
        profileCid || null,
        now,
        now
      ),
    ])

    // Verify the insert succeeded (should have 1 change)
    if ((results[2]?.meta?.changes ?? 0) !== 1) {
      return c.json({
        success: false,
        error: 'Registration failed unexpectedly',
      } as RegisterResponse, 500)
    }

    return c.json({
      success: true,
      label: normalizedLabel,
      expires_at: expiresAt,
    } as RegisterResponse)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    // Check if this is a nonce replay (UNIQUE constraint on heaven_nonces)
    if (errorMsg.includes('UNIQUE') && errorMsg.includes('heaven_nonces')) {
      return c.json({
        success: false,
        error: 'Nonce already used (replay detected)',
      } as RegisterResponse, 409)
    }

    // Check if name was taken between check and insert (UNIQUE on heaven_names.label)
    if (errorMsg.includes('UNIQUE') && errorMsg.includes('heaven_names')) {
      return c.json({
        success: false,
        error: 'Name was just taken',
      } as RegisterResponse, 409)
    }

    console.error('[Register Error]', err)
    return c.json({
      success: false,
      error: 'Registration failed',
    } as RegisterResponse, 500)
  }
})

// ============================================================================
// POST /renew - Renew an existing name
// ============================================================================

interface RenewRequest {
  label: string
  signature: string
  nonce: string
  timestamp: number
}

interface RenewResponse {
  success: boolean
  expires_at?: number
  error?: string
}

app.post('/renew', async (c) => {
  const body = await c.req.json<RenewRequest>()
  const { label, signature, nonce, timestamp } = body

  // Input hardening: validate nonce format
  if (!nonce || typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128) {
    return c.json({ success: false, error: 'Invalid nonce' } as RenewResponse, 400)
  }

  const validation = validateLabel(label)
  if (!validation.valid) {
    return c.json({ success: false, error: `Invalid label: ${validation.reason}` } as RenewResponse, 400)
  }
  const normalizedLabel = validation.normalized

  // Look up existing registration
  const row = await c.env.DB.prepare(
    'SELECT * FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<HeavenNameRow>()

  if (!row) {
    return c.json({ success: false, error: 'Name not found' } as RenewResponse, 404)
  }

  const now = Math.floor(Date.now() / 1000)

  // Can't renew if past grace period
  if (now > row.grace_ends_at) {
    return c.json({ success: false, error: 'Name has expired and passed grace period' } as RenewResponse, 400)
  }

  // Validate timestamp
  const sigExpiresAt = timestamp + 120
  const timestampError = validateTimestamp(timestamp, now)
  if (timestampError) {
    return c.json({ success: false, error: timestampError } as RenewResponse, 400)
  }

  // Verify signature (must be from current owner)
  const message = buildHeavenMessage({
    action: 'renew',
    label: normalizedLabel,
    pkp: row.pkp_address,
    nonce,
    issuedAt: timestamp,
    expiresAt: sigExpiresAt,
  })

  const validSig = await verifySignature(message, signature, row.pkp_address)
  if (!validSig) {
    return c.json({ success: false, error: 'Invalid signature' } as RenewResponse, 401)
  }

  // Calculate new expiry (extend from current expiry if not expired, else from now)
  const baseTime = now > row.expires_at ? now : row.expires_at
  const newExpiresAt = baseTime + ONE_YEAR_SECONDS
  const newGraceEndsAt = newExpiresAt + GRACE_PERIOD_SECONDS

  // Atomic: INSERT nonce (fails if exists) + update name in batch
  try {
    const results = await c.env.DB.batch([
      // 1. Insert nonce - will fail with UNIQUE constraint if already exists
      c.env.DB.prepare(
        'INSERT INTO heaven_nonces (nonce, pkp_address, used_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(nonce, row.pkp_address, now, now + 300, now),

      // 2. Update registration
      c.env.DB.prepare(`
        UPDATE heaven_names
        SET expires_at = ?, grace_ends_at = ?, status = 'active', updated_at = ?
        WHERE label = ?
      `).bind(newExpiresAt, newGraceEndsAt, now, normalizedLabel),
    ])

    // Verify the update actually changed a row
    if ((results[1]?.meta?.changes ?? 0) !== 1) {
      return c.json({ success: false, error: 'Name not found or not updated' } as RenewResponse, 409)
    }

    return c.json({ success: true, expires_at: newExpiresAt } as RenewResponse)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    if (errorMsg.includes('UNIQUE') && errorMsg.includes('heaven_nonces')) {
      return c.json({ success: false, error: 'Nonce already used (replay detected)' } as RenewResponse, 409)
    }

    console.error('[Renew Error]', err)
    return c.json({ success: false, error: 'Renewal failed' } as RenewResponse, 500)
  }
})

// ============================================================================
// POST /update - Update profile CID
// ============================================================================

interface UpdateRequest {
  label: string
  profileCid: string
  signature: string
  nonce: string
  timestamp: number
}

interface UpdateResponse {
  success: boolean
  error?: string
}

app.post('/update', async (c) => {
  const body = await c.req.json<UpdateRequest>()
  const { label, profileCid, signature, nonce, timestamp } = body

  // Input hardening: validate nonce format
  if (!nonce || typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128) {
    return c.json({ success: false, error: 'Invalid nonce' } as UpdateResponse, 400)
  }

  // Input hardening: validate profileCid length
  if (profileCid && (typeof profileCid !== 'string' || profileCid.length > 256)) {
    return c.json({ success: false, error: 'profileCid too long' } as UpdateResponse, 400)
  }

  const validation = validateLabel(label)
  if (!validation.valid) {
    return c.json({ success: false, error: `Invalid label: ${validation.reason}` } as UpdateResponse, 400)
  }
  const normalizedLabel = validation.normalized

  // Look up existing registration
  const row = await c.env.DB.prepare(
    'SELECT * FROM heaven_names WHERE label = ?'
  ).bind(normalizedLabel).first<HeavenNameRow>()

  if (!row) {
    return c.json({ success: false, error: 'Name not found' } as UpdateResponse, 404)
  }

  const now = Math.floor(Date.now() / 1000)

  // Can't update expired names
  if (now > row.expires_at) {
    return c.json({ success: false, error: 'Name has expired' } as UpdateResponse, 400)
  }

  // Validate timestamp
  const sigExpiresAt = timestamp + 120
  const timestampError = validateTimestamp(timestamp, now)
  if (timestampError) {
    return c.json({ success: false, error: timestampError } as UpdateResponse, 400)
  }

  // Verify signature
  const message = buildHeavenMessage({
    action: 'update',
    label: normalizedLabel,
    pkp: row.pkp_address,
    nonce,
    issuedAt: timestamp,
    expiresAt: sigExpiresAt,
    profileCid,
  })

  const validSig = await verifySignature(message, signature, row.pkp_address)
  if (!validSig) {
    return c.json({ success: false, error: 'Invalid signature' } as UpdateResponse, 401)
  }

  // Atomic: INSERT nonce (fails if exists) + update profile in batch
  try {
    const results = await c.env.DB.batch([
      // 1. Insert nonce - will fail with UNIQUE constraint if already exists
      c.env.DB.prepare(
        'INSERT INTO heaven_nonces (nonce, pkp_address, used_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(nonce, row.pkp_address, now, now + 300, now),

      // 2. Update profile CID
      c.env.DB.prepare(`
        UPDATE heaven_names SET profile_cid = ?, updated_at = ? WHERE label = ?
      `).bind(profileCid, now, normalizedLabel),
    ])

    // Verify the update actually changed a row
    if ((results[1]?.meta?.changes ?? 0) !== 1) {
      return c.json({ success: false, error: 'Name not found or not updated' } as UpdateResponse, 409)
    }

    return c.json({ success: true } as UpdateResponse)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    if (errorMsg.includes('UNIQUE') && errorMsg.includes('heaven_nonces')) {
      return c.json({ success: false, error: 'Nonce already used (replay detected)' } as UpdateResponse, 409)
    }

    console.error('[Update Error]', err)
    return c.json({ success: false, error: 'Update failed' } as UpdateResponse, 500)
  }
})

export default app
