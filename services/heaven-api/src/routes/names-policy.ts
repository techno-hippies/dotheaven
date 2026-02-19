import { Hono, type Context } from 'hono'
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
  keccak256 as keccak256Hex,
  toUtf8Bytes,
} from 'ethers'
import type { Env, UserIdentityRow } from '../types'

const app = new Hono<{ Bindings: Env }>()
type NamesContext = Context<{ Bindings: Env }>

const DEFAULT_TEMPO_CHAIN_ID = 42431
const DEFAULT_TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz'
const DEFAULT_TEMPO_REGISTRY_V2 = '0xA111c5cA16752B09fF16B3B8B24BA55a8486aB23'
const DEFAULT_TEMPO_HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27'
const DEFAULT_TEMPO_PIRATE_NODE = '0xace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a'

const DEFAULT_PERMIT_TTL_SECONDS = 180
const DEFAULT_POW_TTL_SECONDS = 300
const DEFAULT_POW_DIFFICULTY_HEX = 4

const DEFAULT_LONG_WALLET_LIMIT_10M = 8
const DEFAULT_LONG_IP_LIMIT_10M = 24
const DEFAULT_LONG_DEVICE_LIMIT_10M = 12

const LONG_RATE_LIMIT_WINDOW_SECONDS = 10 * 60
const SHORT_NAME_MAX_LEN = 5
const SHORT_NAME_CAP = 3
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60
const POLICY_SHORT_SELF = 0
const POLICY_LONG_POW = 1

const STORE_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const REGISTRY_ABI = [
  'function price(bytes32 parentNode, string label, uint256 duration) view returns (uint256)',
  'function isReserved(bytes32 parentNode, string label) view returns (bool)',
  'function premiumPriceForLabel(bytes32 parentNode, string label) view returns (uint256)',
]

const STORE_ABI = [
  'function quote(bytes32 parentNode, string label) view returns (tuple(uint256 price, uint256 duration, bool enabled))',
  'function shortPurchasesByNullifier(bytes32 nullifierHash) view returns (uint16)',
  'function buyWithPermit(string label, (address buyer,address recipient,bytes32 parentNode,bytes32 labelHash,uint256 duration,uint256 maxPrice,uint8 policyType,bytes32 nullifierHash,uint256 nonce,uint256 deadline) permit, bytes signature) returns (uint256)',
]

type NamePolicyConfig = {
  chainId: number
  rpcUrl: string
  registry: string
  store: string
  heavenNode: string
  pirateNode: string
  policySignerPrivateKey: string
  policySignerAddress?: string
  permitTtlSeconds: number
  powTtlSeconds: number
  basePowDifficultyHex: number
  longWalletLimit10m: number
  longIpLimit10m: number
  longDeviceLimit10m: number
}

type PowChallengeRow = {
  challenge_id: string
  wallet_address: string
  label_hash: string
  parent_node: string
  challenge: string
  difficulty: number
  expires_at: number
  consumed_at: number | null
}

function normalizeAddress(input: string | null | undefined): string | null {
  if (!input) return null
  const clean = input.trim().toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(clean)) return null
  return clean
}

function normalizeBytes32(input: string | null | undefined): string | null {
  if (!input) return null
  const clean = input.trim().toLowerCase()
  if (!/^0x[a-f0-9]{64}$/.test(clean)) return null
  return clean
}

function normalizeLabel(input: string | null | undefined): string | null {
  if (!input) return null
  const label = input.trim().toLowerCase()
  if (!STORE_LABEL_REGEX.test(label)) return null
  return label
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

function randomHex(bytesLen: number): string {
  const bytes = new Uint8Array(bytesLen)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomUint256(): bigint {
  return BigInt(`0x${randomHex(32)}`)
}

function resolveParentNode(tld: string, cfg: NamePolicyConfig): string | null {
  const normalized = tld.trim().toLowerCase()
  if (normalized === 'heaven') return cfg.heavenNode
  if (normalized === 'pirate') return cfg.pirateNode
  return null
}

function getPowDifficulty(base: number, labelLength: number): number {
  if (labelLength <= 6) return base
  if (labelLength === 7) return Math.max(2, base - 1)
  return Math.max(2, base - 2)
}

function hasPow(hashHex: string, difficulty: number): boolean {
  const prefix = '0'.repeat(Math.max(0, difficulty))
  return hashHex.replace(/^0x/, '').startsWith(prefix)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getConfig(env: Env): NamePolicyConfig {
  const cfg: NamePolicyConfig = {
    chainId: parseIntEnv(env.TEMPO_CHAIN_ID, DEFAULT_TEMPO_CHAIN_ID, 1, 100_000_000),
    rpcUrl: (env.TEMPO_RPC_URL || DEFAULT_TEMPO_RPC_URL).trim(),
    registry: (env.TEMPO_NAME_REGISTRY_V2 || DEFAULT_TEMPO_REGISTRY_V2).trim(),
    store: (env.TEMPO_PREMIUM_NAME_STORE_V2 || '').trim(),
    heavenNode: (env.TEMPO_HEAVEN_NODE || DEFAULT_TEMPO_HEAVEN_NODE).trim().toLowerCase(),
    pirateNode: (env.TEMPO_PIRATE_NODE || DEFAULT_TEMPO_PIRATE_NODE).trim().toLowerCase(),
    // Backward-compatible fallback while dedicated policy key is being rolled out.
    policySignerPrivateKey: (env.TEMPO_POLICY_SIGNER_PRIVATE_KEY || env.TEMPO_OPERATOR_PRIVATE_KEY || '').trim(),
    policySignerAddress: (env.TEMPO_POLICY_SIGNER_ADDRESS || '').trim() || undefined,
    permitTtlSeconds: parseIntEnv(env.NAMES_PERMIT_TTL_SECONDS, DEFAULT_PERMIT_TTL_SECONDS, 30, 3600),
    powTtlSeconds: parseIntEnv(env.NAMES_POW_TTL_SECONDS, DEFAULT_POW_TTL_SECONDS, 30, 3600),
    basePowDifficultyHex: parseIntEnv(env.NAMES_POW_DIFFICULTY_HEX, DEFAULT_POW_DIFFICULTY_HEX, 1, 12),
    longWalletLimit10m: parseIntEnv(env.NAMES_LONG_WALLET_LIMIT_10M, DEFAULT_LONG_WALLET_LIMIT_10M, 1, 300),
    longIpLimit10m: parseIntEnv(env.NAMES_LONG_IP_LIMIT_10M, DEFAULT_LONG_IP_LIMIT_10M, 1, 1000),
    longDeviceLimit10m: parseIntEnv(env.NAMES_LONG_DEVICE_LIMIT_10M, DEFAULT_LONG_DEVICE_LIMIT_10M, 1, 500),
  }

  if (!cfg.rpcUrl) throw new Error('Missing TEMPO_RPC_URL')
  if (!/^0x[a-fA-F0-9]{40}$/.test(cfg.registry)) throw new Error('Invalid TEMPO_NAME_REGISTRY_V2')
  if (!/^0x[a-fA-F0-9]{40}$/.test(cfg.store)) throw new Error('Missing or invalid TEMPO_PREMIUM_NAME_STORE_V2')
  if (!normalizeBytes32(cfg.heavenNode)) throw new Error('Invalid TEMPO_HEAVEN_NODE')
  if (!normalizeBytes32(cfg.pirateNode)) throw new Error('Invalid TEMPO_PIRATE_NODE')
  if (!/^0x[a-fA-F0-9]{64}$/.test(cfg.policySignerPrivateKey)) {
    throw new Error('Missing or invalid TEMPO_POLICY_SIGNER_PRIVATE_KEY (or TEMPO_OPERATOR_PRIVATE_KEY fallback)')
  }
  if (cfg.policySignerAddress && !/^0x[a-fA-F0-9]{40}$/.test(cfg.policySignerAddress)) {
    throw new Error('Invalid TEMPO_POLICY_SIGNER_ADDRESS')
  }

  return cfg
}

async function resolveQuote(
  provider: JsonRpcProvider,
  cfg: NamePolicyConfig,
  parentNode: string,
  label: string,
  requestedDuration: bigint,
): Promise<{ price: bigint; duration: bigint; listingEnabled: boolean }> {
  const store = new Contract(cfg.store, STORE_ABI, provider)
  const registry = new Contract(cfg.registry, REGISTRY_ABI, provider)

  const listing = await store.quote(parentNode, label)
  const listingPrice = BigInt(listing.price ?? listing[0] ?? 0)
  const listingDuration = BigInt(listing.duration ?? listing[1] ?? 0)
  const listingEnabled = Boolean(listing.enabled ?? listing[2])

  if (listingEnabled) {
    if (listingDuration <= 0n) throw new Error('Listing duration is invalid')
    return { price: listingPrice, duration: listingDuration, listingEnabled: true }
  }

  const [reservedRaw, premiumRaw] = await Promise.all([
    registry.isReserved(parentNode, label),
    registry.premiumPriceForLabel(parentNode, label),
  ])

  const reserved = Boolean(reservedRaw)
  const premium = BigInt(premiumRaw)
  if (reserved || premium > 0n) {
    throw new Error('LISTING_REQUIRED')
  }

  const dynamicPrice = BigInt(await registry.price(parentNode, label, requestedDuration))
  return { price: dynamicPrice, duration: requestedDuration, listingEnabled: false }
}

async function resolveShortNullifier(c: NamesContext, wallet: string): Promise<{ nullifierHash: string; source: 'self' }> {
  const row = await c.env.DB.prepare(`
    SELECT user_address, identity_nullifier_hash, verification_session_id
    FROM user_identity
    WHERE user_address = ?
  `).bind(wallet).first<UserIdentityRow>()

  if (!row) throw new Error('SELF_REQUIRED')

  const explicit = normalizeBytes32(row.identity_nullifier_hash)
  if (explicit) return { nullifierHash: explicit, source: 'self' }

  throw new Error('SELF_NULLIFIER_REQUIRED')
}

async function enforceLongRateLimits(
  c: NamesContext,
  cfg: NamePolicyConfig,
  wallet: string,
  now: number,
): Promise<{ ipHash: string | null; deviceId: string | null }> {
  const windowStart = now - LONG_RATE_LIMIT_WINDOW_SECONDS
  const ipRaw = (c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || '').split(',')[0].trim()
  const deviceId = (c.req.header('x-device-id') || '').trim().slice(0, 128) || null
  const ipHash = ipRaw ? await sha256Hex(ipRaw) : null

  const walletCount = Number((await c.env.DB.prepare(`
    SELECT COUNT(*) AS cnt
    FROM name_permit_issuance
    WHERE wallet_address = ? AND issued_at >= ?
  `).bind(wallet, windowStart).first<{ cnt: number }>())?.cnt || 0)
  if (walletCount >= cfg.longWalletLimit10m) throw new Error('RATE_LIMIT_WALLET')

  if (ipHash) {
    const ipCount = Number((await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM name_permit_issuance
      WHERE ip_hash = ? AND issued_at >= ?
    `).bind(ipHash, windowStart).first<{ cnt: number }>())?.cnt || 0)
    if (ipCount >= cfg.longIpLimit10m) throw new Error('RATE_LIMIT_IP')
  }

  if (deviceId) {
    const deviceCount = Number((await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM name_permit_issuance
      WHERE device_id = ? AND issued_at >= ?
    `).bind(deviceId, windowStart).first<{ cnt: number }>())?.cnt || 0)
    if (deviceCount >= cfg.longDeviceLimit10m) throw new Error('RATE_LIMIT_DEVICE')
  }

  return { ipHash, deviceId }
}

async function consumePowChallenge(
  c: NamesContext,
  wallet: string,
  labelHash: string,
  parentNode: string,
  challengeId: string,
  powNonce: string,
  now: number,
): Promise<void> {
  const row = await c.env.DB.prepare(`
    SELECT challenge_id, wallet_address, label_hash, parent_node, challenge, difficulty, expires_at, consumed_at
    FROM name_pow_challenges
    WHERE challenge_id = ?
  `).bind(challengeId).first<PowChallengeRow>()

  if (!row) throw new Error('POW_CHALLENGE_NOT_FOUND')
  if (row.wallet_address !== wallet || row.label_hash !== labelHash || row.parent_node !== parentNode) {
    throw new Error('POW_CHALLENGE_MISMATCH')
  }
  if (row.consumed_at) throw new Error('POW_CHALLENGE_ALREADY_USED')
  if (row.expires_at < now) throw new Error('POW_CHALLENGE_EXPIRED')

  const digest = keccak256Hex(toUtf8Bytes(`${row.challenge}:${powNonce}`))
  if (!hasPow(digest, row.difficulty)) throw new Error('POW_INVALID')

  const result = await c.env.DB.prepare(`
    UPDATE name_pow_challenges
    SET consumed_at = ?
    WHERE challenge_id = ? AND consumed_at IS NULL AND expires_at >= ?
  `).bind(now, challengeId, now).run()

  if ((result.meta?.changes || 0) !== 1) throw new Error('POW_CHALLENGE_ALREADY_USED')
}

app.post('/challenge', async (c) => {
  let cfg: NamePolicyConfig
  try {
    cfg = getConfig(c.env)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Policy config error' }, 500)
  }

  const body = await c.req.json<{ label?: string; tld?: string; wallet?: string }>()
  const wallet = normalizeAddress(body.wallet)
  const label = normalizeLabel(body.label)
  const tld = (body.tld || '').toLowerCase().trim()
  const parentNode = resolveParentNode(tld, cfg)

  if (!wallet) return c.json({ error: 'Invalid wallet address' }, 400)
  if (!label) return c.json({ error: 'Invalid label format' }, 400)
  if (!parentNode) return c.json({ error: 'Unsupported TLD' }, 400)
  if (label.length <= SHORT_NAME_MAX_LEN) {
    return c.json({ error: 'PoW challenge is only required for labels with length >= 6' }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const challengeId = randomHex(16)
  const challenge = randomHex(32)
  const difficulty = getPowDifficulty(cfg.basePowDifficultyHex, label.length)
  const expiresAt = now + cfg.powTtlSeconds
  const labelHash = keccak256Hex(toUtf8Bytes(label))

  await c.env.DB.prepare(`
    INSERT INTO name_pow_challenges (challenge_id, wallet_address, label_hash, parent_node, challenge, difficulty, expires_at, consumed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).bind(challengeId, wallet, labelHash, parentNode, challenge, difficulty, expiresAt, now).run()

  return c.json({
    challengeId,
    challenge,
    difficulty,
    expiresAt,
    algorithm: 'keccak256',
    format: 'keccak256("<challenge>:<powNonce>") must have leading zero hex nibbles',
  })
})

app.post('/permit', async (c) => {
  let cfg: NamePolicyConfig
  try {
    cfg = getConfig(c.env)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Policy config error' }, 500)
  }

  const body = await c.req.json<{
    label?: string
    tld?: string
    wallet?: string
    recipient?: string
    durationSeconds?: number
    maxPrice?: string
    challengeId?: string
    powNonce?: string
  }>()

  const label = normalizeLabel(body.label)
  const wallet = normalizeAddress(body.wallet)
  const recipient = normalizeAddress(body.recipient || body.wallet)
  const tld = (body.tld || '').toLowerCase().trim()
  const parentNode = resolveParentNode(tld, cfg)
  const now = Math.floor(Date.now() / 1000)

  if (!label) return c.json({ error: 'Invalid label format' }, 400)
  if (!wallet) return c.json({ error: 'Invalid wallet address' }, 400)
  if (!recipient) return c.json({ error: 'Invalid recipient address' }, 400)
  if (!parentNode) return c.json({ error: 'Unsupported TLD' }, 400)

  const durationSeconds = body.durationSeconds ?? ONE_YEAR_SECONDS
  if (!Number.isInteger(durationSeconds) || durationSeconds < ONE_YEAR_SECONDS) {
    return c.json({ error: `durationSeconds must be >= ${ONE_YEAR_SECONDS}` }, 400)
  }

  const policyType = label.length <= SHORT_NAME_MAX_LEN ? POLICY_SHORT_SELF : POLICY_LONG_POW
  const requestedDuration = BigInt(durationSeconds)
  const labelHash = keccak256Hex(toUtf8Bytes(label))

  const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId)
  const store = new Contract(cfg.store, STORE_ABI, provider)

  let nullifierHash = '0x0000000000000000000000000000000000000000000000000000000000000000'
  let nullifierSource: 'self' | null = null
  let ipHash: string | null = null
  let deviceId: string | null = null

  if (policyType === POLICY_SHORT_SELF) {
    try {
      const resolved = await resolveShortNullifier(c, wallet)
      nullifierHash = resolved.nullifierHash
      nullifierSource = resolved.source
    } catch (err) {
      if (err instanceof Error && err.message === 'SELF_REQUIRED') {
        return c.json({
          error:
            'Short names (5 characters or less) require one-time Self verification. Open Verify Identity, complete it, then try again.',
        }, 403)
      }
      if (err instanceof Error && err.message === 'SELF_NULLIFIER_REQUIRED') {
        return c.json({
          error:
            'This wallet has an older verification record without a short-name credential. Run Self verification once to refresh, then try again.',
        }, 403)
      }
      return c.json({ error: 'Failed to resolve identity nullifier' }, 500)
    }
  } else {
    try {
      const rateMeta = await enforceLongRateLimits(c, cfg, wallet, now)
      ipHash = rateMeta.ipHash
      deviceId = rateMeta.deviceId
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'RATE_LIMIT_WALLET') return c.json({ error: 'Rate limited: wallet limit exceeded' }, 429)
      if (code === 'RATE_LIMIT_IP') return c.json({ error: 'Rate limited: IP limit exceeded' }, 429)
      if (code === 'RATE_LIMIT_DEVICE') return c.json({ error: 'Rate limited: device limit exceeded' }, 429)
      return c.json({ error: 'Rate limit check failed' }, 500)
    }
  }

  let requiredPrice: bigint
  let requiredDuration: bigint
  let listingEnabled = false
  try {
    const quote = await resolveQuote(provider, cfg, parentNode, label, requestedDuration)
    requiredPrice = quote.price
    requiredDuration = quote.duration
    listingEnabled = quote.listingEnabled
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Quote failed'
    if (msg === 'LISTING_REQUIRED') {
      return c.json({ error: 'Name requires an explicit store listing' }, 409)
    }
    return c.json({ error: 'Failed to resolve quote' }, 500)
  }

  if (policyType === POLICY_SHORT_SELF) {
    if (requiredPrice <= 0n) {
      return c.json({ error: 'Short names must be paid/listed; resolved quote is zero' }, 409)
    }
    const usedCount = BigInt(await store.shortPurchasesByNullifier(nullifierHash))
    if (usedCount >= BigInt(SHORT_NAME_CAP)) {
      return c.json({ error: `Short-name cap reached (${SHORT_NAME_CAP} lifetime)` }, 409)
    }
  }

  if (policyType === POLICY_LONG_POW) {
    const challengeId = (body.challengeId || '').trim()
    const powNonce = (body.powNonce || '').trim()
    if (!challengeId || !powNonce) {
      return c.json({ error: 'challengeId and powNonce are required for labels with length >= 6' }, 400)
    }
    try {
      await consumePowChallenge(c, wallet, labelHash, parentNode, challengeId, powNonce, now)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'POW_CHALLENGE_NOT_FOUND') return c.json({ error: 'PoW challenge not found' }, 404)
      if (code === 'POW_CHALLENGE_EXPIRED') return c.json({ error: 'PoW challenge expired' }, 410)
      if (code === 'POW_CHALLENGE_ALREADY_USED') return c.json({ error: 'PoW challenge already used' }, 409)
      if (code === 'POW_CHALLENGE_MISMATCH') return c.json({ error: 'PoW challenge does not match this request' }, 400)
      if (code === 'POW_INVALID') return c.json({ error: 'Invalid PoW nonce for challenge' }, 403)
      return c.json({ error: 'PoW verification failed' }, 500)
    }
  }

  const parsedMaxPrice = body.maxPrice && /^[0-9]+$/.test(body.maxPrice.trim()) ? BigInt(body.maxPrice.trim()) : null
  const maxPrice = parsedMaxPrice ?? requiredPrice
  if (maxPrice < requiredPrice) {
    return c.json({ error: 'maxPrice is below required quote' }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO name_permit_issuance (wallet_address, ip_hash, device_id, label_hash, parent_node, policy_type, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(wallet, ipHash, deviceId, labelHash, parentNode, policyType, now).run()

  const signer = new Wallet(cfg.policySignerPrivateKey)
  if (cfg.policySignerAddress) {
    const expected = getAddress(cfg.policySignerAddress)
    const actual = getAddress(await signer.getAddress())
    if (expected != actual) {
      return c.json({ error: 'Policy signer private key does not match TEMPO_POLICY_SIGNER_ADDRESS' }, 500)
    }
  }

  const permit = {
    buyer: getAddress(wallet),
    recipient: getAddress(recipient),
    parentNode,
    labelHash,
    duration: requiredDuration,
    maxPrice,
    policyType,
    nullifierHash,
    nonce: randomUint256(),
    deadline: BigInt(now + cfg.permitTtlSeconds),
  }

  const domain = {
    name: 'PremiumNameStoreV2',
    version: '2',
    chainId: cfg.chainId,
    verifyingContract: getAddress(cfg.store),
  }

  const types = {
    NamePermit: [
      { name: 'buyer', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'parentNode', type: 'bytes32' },
      { name: 'labelHash', type: 'bytes32' },
      { name: 'duration', type: 'uint256' },
      { name: 'maxPrice', type: 'uint256' },
      { name: 'policyType', type: 'uint8' },
      { name: 'nullifierHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }

  const signature = await signer.signTypedData(domain, types, permit)
  const callData = store.interface.encodeFunctionData('buyWithPermit', [label, permit, signature])

  return c.json({
    permit: {
      buyer: permit.buyer,
      recipient: permit.recipient,
      parentNode: permit.parentNode,
      labelHash: permit.labelHash,
      duration: permit.duration.toString(),
      maxPrice: permit.maxPrice.toString(),
      policyType: permit.policyType,
      nullifierHash: permit.nullifierHash,
      nonce: permit.nonce.toString(),
      deadline: permit.deadline.toString(),
    },
    signature,
    policy: policyType === POLICY_SHORT_SELF ? 'SHORT_SELF' : 'LONG_POW',
    nullifierSource,
    quote: {
      price: requiredPrice.toString(),
      durationSeconds: requiredDuration.toString(),
      listingEnabled,
      paymentToken: '0x20C0000000000000000000000000000000000001',
    },
    tx: {
      to: cfg.store,
      data: callData,
    },
  })
})

export default app
