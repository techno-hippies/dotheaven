/**
 * Heaven Profile Verification — Self.xyz
 *
 * Reads verification state from:
 * - Celo Sepolia: SelfProfileVerifier.verifiedAt(user) — source of truth
 * - MegaETH: VerificationMirror.verifiedAt(user) — local mirror for contract gating
 *
 * Frontend shows badge based on either chain having nonzero verifiedAt.
 * Mirror sync triggered via Lit Action when needed.
 */

import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { celoSepolia, megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

// Contract addresses — update after deployment
const SELF_VERIFIER_CELO = (import.meta.env.VITE_SELF_VERIFIER_CELO ?? '') as Address
const VERIFICATION_MIRROR_MEGAETH = (import.meta.env.VITE_VERIFICATION_MIRROR_MEGAETH ?? '') as Address

const verifierAbi = parseAbi([
  'function verifiedAt(address user) external view returns (uint64)',
  'function nationality(address user) external view returns (string)',
])

const mirrorAbi = parseAbi([
  'function verifiedAt(address user) external view returns (uint64)',
  'function nationality(address user) external view returns (string)',
  'function nonces(address user) external view returns (uint256)',
])

const celoClient = createPublicClient({
  chain: celoSepolia,
  transport: http(),
})

const megaClient = createPublicClient({
  chain: megaTestnetV2,
  transport: http(),
})

export interface VerificationStatus {
  /** Whether user is verified on Celo (source of truth) */
  verified: boolean
  /** Celo verifiedAt timestamp (0 = unverified) */
  celoVerifiedAt: number
  /** MegaETH mirror verifiedAt timestamp (0 = not mirrored) */
  megaEthVerifiedAt: number
  /** Whether mirror is stale (Celo verified but MegaETH not yet synced) */
  mirrorStale: boolean
  /** 3-letter ISO nationality code (e.g. "USA", "GBR") */
  nationality: string
}

const CACHE_KEY_PREFIX = 'heaven:verified:'
const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour

interface CachedStatus {
  status: VerificationStatus
  cachedAt: number
}

function getCached(user: string): VerificationStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + user.toLowerCase())
    if (!raw) return null
    const cached: CachedStatus = JSON.parse(raw)
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null
    return cached.status
  } catch {
    return null
  }
}

function setCache(user: string, status: VerificationStatus) {
  try {
    const cached: CachedStatus = { status, cachedAt: Date.now() }
    localStorage.setItem(CACHE_KEY_PREFIX + user.toLowerCase(), JSON.stringify(cached))
  } catch {
    // ignore storage errors
  }
}

/**
 * Check verification status for a user by reading both chains.
 * Results are cached in localStorage for 1 hour.
 */
export async function getVerificationStatus(
  userAddress: Address,
  { skipCache = false }: { skipCache?: boolean } = {},
): Promise<VerificationStatus> {
  if (!skipCache) {
    const cached = getCached(userAddress)
    if (cached) {
      console.log('[Verify] Using cached status for', userAddress, cached)
      return cached
    }
  }

  console.log('[Verify] Fetching verification status from Celo verifier:', SELF_VERIFIER_CELO, 'for', userAddress)

  const [celoTs, celoNat, megaTs] = await Promise.all([
    SELF_VERIFIER_CELO
      ? celoClient.readContract({
          address: SELF_VERIFIER_CELO,
          abi: verifierAbi,
          functionName: 'verifiedAt',
          args: [userAddress],
        }).catch(() => 0n)
      : Promise.resolve(0n),
    SELF_VERIFIER_CELO
      ? celoClient.readContract({
          address: SELF_VERIFIER_CELO,
          abi: verifierAbi,
          functionName: 'nationality',
          args: [userAddress],
        }).catch(() => '')
      : Promise.resolve(''),
    VERIFICATION_MIRROR_MEGAETH
      ? megaClient.readContract({
          address: VERIFICATION_MIRROR_MEGAETH,
          abi: mirrorAbi,
          functionName: 'verifiedAt',
          args: [userAddress],
        }).catch(() => 0n)
      : Promise.resolve(0n),
  ])

  const celoVerifiedAt = Number(celoTs)
  const megaEthVerifiedAt = Number(megaTs)

  const status: VerificationStatus = {
    verified: celoVerifiedAt > 0,
    celoVerifiedAt,
    megaEthVerifiedAt,
    mirrorStale: celoVerifiedAt > 0 && megaEthVerifiedAt < celoVerifiedAt,
    nationality: celoNat as string,
  }

  setCache(userAddress, status)
  return status
}

// ============================================================
// Self.xyz QR / deeplink generation
// ============================================================

export interface SelfVerifyConfig {
  /** SelfProfileVerifier contract address on Celo (lowercase) */
  contractAddress: Address
  /** User's PKP address */
  userAddress: Address
  /** Scope from the deployed contract */
  scope: string
}

/**
 * Build the Self.xyz universal link for passport verification.
 * User scans QR (desktop) or taps link (mobile).
 * Self app submits proof directly to the Celo contract.
 */
export async function buildSelfVerifyLink(config: SelfVerifyConfig): Promise<string> {
  // Dynamic import — sdk-common is lightweight (only uuid dep, browser-safe ESM)
  const { SelfAppBuilder, getUniversalLink } = await import('@selfxyz/sdk-common')

  const app = new SelfAppBuilder({
    version: 2,
    appName: 'Heaven',
    scope: config.scope,
    endpoint: config.contractAddress.toLowerCase(),
    endpointType: 'staging_celo' as any,
    userId: config.userAddress,
    userIdType: 'hex',
    disclosures: {
      minimumAge: 18,
      nationality: true,
    },
  }).build()

  return getUniversalLink(app)
}

// ============================================================
// Mirror sync via Lit Action
// ============================================================

const MIRROR_ACTION_URL = import.meta.env.VITE_SELF_MIRROR_ACTION_CID
  ? `https://ipfs.filebase.io/ipfs/${import.meta.env.VITE_SELF_MIRROR_ACTION_CID}`
  : null

let _cachedMirrorActionCode: string | null = null

async function getMirrorActionCode(): Promise<string> {
  if (_cachedMirrorActionCode) return _cachedMirrorActionCode

  if (MIRROR_ACTION_URL) {
    const res = await fetch(MIRROR_ACTION_URL)
    if (!res.ok) throw new Error(`Failed to fetch mirror Lit Action: ${res.status}`)
    _cachedMirrorActionCode = await res.text()
    return _cachedMirrorActionCode
  }

  // Dev fallback
  const res = await fetch('/lit-actions/self-verify-mirror-v1.js')
  if (!res.ok) throw new Error(`Failed to fetch mirror Lit Action: ${res.status}`)
  _cachedMirrorActionCode = await res.text()
  return _cachedMirrorActionCode
}

export interface MirrorResult {
  success: boolean
  txHash?: string
  alreadyMirrored?: boolean
  error?: string
}

/**
 * Sync verification state from Celo to MegaETH via Lit Action.
 * Only needed when mirrorStale is true and you need on-chain enforcement on MegaETH.
 */
export async function syncVerificationToMegaEth(
  userAddress: Address,
  authContext: PKPAuthContext,
): Promise<MirrorResult> {
  if (!SELF_VERIFIER_CELO || !VERIFICATION_MIRROR_MEGAETH) {
    return { success: false, error: 'Verification contracts not configured' }
  }

  const litClient = await getLitClient()
  const code = await getMirrorActionCode()

  const result = await litClient.executeJs({
    ...authContext,
    code,
    jsParams: {
      userAddress,
      celoVerifierAddress: SELF_VERIFIER_CELO,
      megaEthMirrorAddress: VERIFICATION_MIRROR_MEGAETH,
    },
  })

  const response = JSON.parse(result.response as string)

  // Clear cache so next read picks up the new state
  if (response.success) {
    localStorage.removeItem(CACHE_KEY_PREFIX + userAddress.toLowerCase())
  }

  return response
}
