/**
 * Wallet routes - Relay for gasless profile creation via EIP-712 meta-tx.
 *
 * POST /api/wallet/set-profile
 * Android signs EIP-712 typed data (free, no gas), sends signature + params here.
 * Worker validates signature off-chain, then broadcasts setProfileWithSig() on-chain.
 * Relay wallet pays gas but cannot forge profiles (contract verifies user signature).
 *
 * Hardening:
 * - Off-chain signature recovery before spending gas
 * - Nonce match check (on-chain vs submitted)
 * - Deadline freshness check (must be > now + 15s)
 * - Per-user rate limit (1 profile set per 60s via D1)
 */

import { Hono } from 'hono'
import { createWalletClient, createPublicClient, http, encodeFunctionData, hashTypedData, recoverAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import type { Env } from '../types'

const CHAIN_ID = 84532 // Base Sepolia
const DATING_PROFILE_ADDRESS = '0x2D950745907874311834510d6472bdfebe04A114' as const

const DATING_PROFILE_ABI = [
  {
    name: 'setProfileWithSig',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'gender', type: 'uint8' },
      { name: 'interestedMask', type: 'uint16' },
      { name: 'locationMode', type: 'uint8' },
      { name: 'locationLat', type: 'int32' },
      { name: 'locationLng', type: 'int32' },
      { name: 'heightCm', type: 'uint16' },
      { name: 'birthYear', type: 'uint16' },
      { name: 'nationalityCode', type: 'uint16' },
      { name: 'ethnicityMask', type: 'uint16' },
      { name: 'relationshipMode', type: 'uint8' },
      { name: 'privateCid', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

// EIP-712 domain for off-chain verification (must match contract constructor: "DatingProfileV3", "1")
const EIP712_DOMAIN = {
  name: 'DatingProfileV3',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: DATING_PROFILE_ADDRESS,
} as const

// EIP-712 types for SetProfile (matches SETPROFILE_TYPEHASH in contract)
const SET_PROFILE_TYPES = {
  SetProfile: [
    { name: 'user', type: 'address' },
    { name: 'gender', type: 'uint8' },
    { name: 'interestedMask', type: 'uint16' },
    { name: 'locationMode', type: 'uint8' },
    { name: 'locationLat', type: 'int32' },
    { name: 'locationLng', type: 'int32' },
    { name: 'heightCm', type: 'uint16' },
    { name: 'birthYear', type: 'uint16' },
    { name: 'nationalityCode', type: 'uint16' },
    { name: 'ethnicityMask', type: 'uint16' },
    { name: 'relationshipMode', type: 'uint8' },
    { name: 'privateCidHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

// Rate limit: 1 profile set per 60 seconds per user
const RATE_LIMIT_SECONDS = 60

const wallet = new Hono<{ Bindings: Env }>()

// GET /api/wallet/nonce?user=0x...
// Returns the current nonce for the user (needed to build the EIP-712 message)
wallet.get('/nonce', async (c) => {
  const userAddress = c.req.query('user')
  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return c.json({ error: 'Missing or invalid user address' }, 400)
  }

  const rpcUrl = c.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  const nonce = await publicClient.readContract({
    address: DATING_PROFILE_ADDRESS,
    abi: DATING_PROFILE_ABI,
    functionName: 'nonces',
    args: [userAddress as `0x${string}`],
  })

  return c.json({ nonce: nonce.toString() })
})

// POST /api/wallet/set-profile
// Body: { userAddress, gender, interestedMask, locationMode, locationLat, locationLng,
//         heightCm, birthYear, nationalityCode, ethnicityMask, deadline, signature }
wallet.post('/set-profile', async (c) => {
  const { BASE_SEPOLIA_RELAY_PK, BASE_SEPOLIA_RPC } = c.env

  if (!BASE_SEPOLIA_RELAY_PK) {
    console.error('[Wallet] Missing BASE_SEPOLIA_RELAY_PK')
    return c.json({ error: 'Server configuration error' }, 500)
  }

  const rpcUrl = BASE_SEPOLIA_RPC || 'https://sepolia.base.org'

  const body = await c.req.json<{
    userAddress: string
    gender: number
    interestedMask: number
    locationMode: number
    locationLat: number
    locationLng: number
    heightCm: number
    birthYear: number
    nationalityCode: number
    ethnicityMask: number
    relationshipMode: number
    deadline: string  // uint256 as string
    signature: string // 0x-prefixed hex
  }>()

  const { userAddress, gender, interestedMask, locationMode, locationLat, locationLng,
          heightCm, birthYear, nationalityCode, ethnicityMask, relationshipMode, deadline, signature } = body

  // --- Input validation ---
  if (!userAddress || gender === undefined || interestedMask === undefined ||
      locationMode === undefined || deadline === undefined || !signature) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return c.json({ error: 'Invalid userAddress format' }, 400)
  }

  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return c.json({ error: 'Invalid signature format' }, 400)
  }

  const deadlineBig = BigInt(deadline)
  const nowSec = BigInt(Math.floor(Date.now() / 1000))

  // --- Deadline freshness check ---
  if (deadlineBig <= nowSec + 15n) {
    console.warn(`[Wallet] Deadline too close or expired: deadline=${deadline}, now=${nowSec}`)
    return c.json({ error: 'Deadline expired or too close (must be > now + 15s)' }, 400)
  }

  // --- Rate limit check (D1) ---
  try {
    const rateLimitResult = await c.env.DB.prepare(
      'SELECT last_profile_set FROM wallet_rate_limits WHERE user_address = ?'
    ).bind(userAddress.toLowerCase()).first<{ last_profile_set: number }>()

    if (rateLimitResult) {
      const elapsed = Math.floor(Date.now() / 1000) - rateLimitResult.last_profile_set
      if (elapsed < RATE_LIMIT_SECONDS) {
        console.warn(`[Wallet] Rate limited: user=${userAddress}, elapsed=${elapsed}s`)
        return c.json({ error: `Rate limited. Try again in ${RATE_LIMIT_SECONDS - elapsed}s` }, 429)
      }
    }
  } catch (e) {
    // Rate limit table might not exist yet - skip (non-critical)
    console.warn('[Wallet] Rate limit check skipped (table may not exist):', e)
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  // --- Nonce check ---
  let onChainNonce: bigint
  try {
    onChainNonce = await publicClient.readContract({
      address: DATING_PROFILE_ADDRESS,
      abi: DATING_PROFILE_ABI,
      functionName: 'nonces',
      args: [userAddress as `0x${string}`],
    })
  } catch (e) {
    console.error('[Wallet] Failed to read on-chain nonce:', e)
    return c.json({ error: 'Failed to verify nonce' }, 500)
  }

  // --- Compute privateCidHash for EIP-712 message ---
  // V3: empty CID maps to bytes32(0) (clean sentinel for "no envelope yet")
  const privateCidHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

  // --- Off-chain signature verification ---
  try {
    const recovered = await recoverAddress({
      hash: hashTypedData({
        domain: EIP712_DOMAIN,
        types: SET_PROFILE_TYPES,
        primaryType: 'SetProfile',
        message: {
          user: userAddress as `0x${string}`,
          gender,
          interestedMask,
          locationMode,
          locationLat,
          locationLng,
          heightCm,
          birthYear,
          nationalityCode,
          ethnicityMask,
          relationshipMode: relationshipMode ?? 0,
          privateCidHash,
          nonce: onChainNonce,
          deadline: deadlineBig,
        },
      }),
      signature: signature as `0x${string}`,
    })

    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      console.error(`[Wallet] Signature mismatch: recovered=${recovered}, expected=${userAddress}`)
      return c.json({ error: 'Invalid signature (recovered address does not match user)' }, 403)
    }

    console.log(`[Wallet] Signature verified: user=${userAddress}, nonce=${onChainNonce}`)
  } catch (e: any) {
    console.error('[Wallet] Signature verification failed:', e)
    return c.json({ error: `Signature verification failed: ${e?.message || e}` }, 403)
  }

  // --- Broadcast transaction ---
  console.log(`[Wallet] setProfileWithSig: user=${userAddress}, gender=${gender}, interestedMask=${interestedMask}, locMode=${locationMode}, lat=${locationLat}, lng=${locationLng}, height=${heightCm}, birthYear=${birthYear}, nationality=${nationalityCode}, ethnicity=${ethnicityMask}, relMode=${relationshipMode ?? 0}, nonce=${onChainNonce}, deadline=${deadline}`)

  try {
    const account = privateKeyToAccount(BASE_SEPOLIA_RELAY_PK as `0x${string}`)

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    })

    // privateCid is empty bytes during onboarding (no survey envelope yet)
    const privateCid = '0x' as `0x${string}`

    const data = encodeFunctionData({
      abi: DATING_PROFILE_ABI,
      functionName: 'setProfileWithSig',
      args: [
        userAddress as `0x${string}`,
        gender,
        interestedMask,
        locationMode,
        locationLat,
        locationLng,
        heightCm,
        birthYear,
        nationalityCode,
        ethnicityMask,
        relationshipMode ?? 0,
        privateCid,
        deadlineBig,
        signature as `0x${string}`,
      ],
    })

    const hash = await walletClient.sendTransaction({
      to: DATING_PROFILE_ADDRESS,
      data,
    })

    console.log(`[Wallet] TX sent: ${hash}`)

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (receipt.status === 'reverted') {
      console.error(`[Wallet] TX reverted: ${hash}`)
      return c.json({ error: 'Transaction reverted', hash, nonceUsed: onChainNonce.toString() }, 500)
    }

    console.log(`[Wallet] TX confirmed in block ${receipt.blockNumber}: ${hash}`)

    // --- Update rate limit ---
    try {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO wallet_rate_limits (user_address, last_profile_set) VALUES (?, ?)'
      ).bind(userAddress.toLowerCase(), Math.floor(Date.now() / 1000)).run()
    } catch (e) {
      // Non-critical
      console.warn('[Wallet] Rate limit update failed:', e)
    }

    return c.json({
      success: true,
      hash,
      blockNumber: receipt.blockNumber.toString(),
      nonceUsed: onChainNonce.toString(),
    })
  } catch (e: any) {
    console.error('[Wallet] TX error:', e)
    return c.json({ error: `Transaction failed: ${e?.message || e}` }, 500)
  }
})

// POST /api/wallet/register-name
// Body: { userAddress, label }
// Relay calls registerFor(parentNode, label, userAddress, 365 days) on MultiTldSubnameRegistrarV3
// For .heaven names with 5+ chars, cost is 0 USDC (free)
wallet.post('/register-name', async (c) => {
  const { BASE_SEPOLIA_RELAY_PK, BASE_SEPOLIA_RPC } = c.env

  if (!BASE_SEPOLIA_RELAY_PK) {
    console.error('[Wallet] Missing BASE_SEPOLIA_RELAY_PK')
    return c.json({ error: 'Server configuration error' }, 500)
  }

  const rpcUrl = BASE_SEPOLIA_RPC || 'https://sepolia.base.org'

  const body = await c.req.json<{
    userAddress: string
    label: string
  }>()

  const { userAddress, label } = body

  if (!userAddress || !label) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return c.json({ error: 'Invalid userAddress format' }, 400)
  }

  // Validate label: lowercase alphanumeric + hyphen, no start/end hyphen
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) || label.length < 3) {
    return c.json({ error: 'Invalid label (3+ chars, lowercase alphanumeric + hyphen)' }, 400)
  }

  const REGISTRAR_ADDRESS = '0x12b7e3872198fD27fC1106fd85d438E9f1789594' as const
  const HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27' as const
  const ONE_YEAR = BigInt(365 * 24 * 60 * 60) // 365 days in seconds

  const REGISTRAR_ABI = [
    {
      name: 'registerFor',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'parentNode', type: 'bytes32' },
        { name: 'label', type: 'string' },
        { name: 'to', type: 'address' },
        { name: 'duration', type: 'uint256' },
      ],
      outputs: [{ name: 'tokenId', type: 'uint256' }],
    },
    {
      name: 'available',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'parentNode', type: 'bytes32' },
        { name: 'label', type: 'string' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  // Check availability first
  try {
    const isAvailable = await publicClient.readContract({
      address: REGISTRAR_ADDRESS,
      abi: REGISTRAR_ABI,
      functionName: 'available',
      args: [HEAVEN_NODE, label],
    })

    if (!isAvailable) {
      return c.json({ error: 'Name not available' }, 409)
    }
  } catch (e: any) {
    console.error('[Wallet] Availability check failed:', e)
    return c.json({ error: `Availability check failed: ${e?.message || e}` }, 500)
  }

  // Register the name
  console.log(`[Wallet] registerFor: label=${label}, to=${userAddress}, duration=1year`)

  try {
    const account = privateKeyToAccount(BASE_SEPOLIA_RELAY_PK as `0x${string}`)

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    })

    const data = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: 'registerFor',
      args: [HEAVEN_NODE, label, userAddress as `0x${string}`, ONE_YEAR],
    })

    const hash = await walletClient.sendTransaction({
      to: REGISTRAR_ADDRESS,
      data,
    })

    console.log(`[Wallet] Name register TX sent: ${hash}`)

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (receipt.status === 'reverted') {
      console.error(`[Wallet] Name register TX reverted: ${hash}`)
      return c.json({ error: 'Transaction reverted', hash }, 500)
    }

    console.log(`[Wallet] Name registered in block ${receipt.blockNumber}: ${label}.heaven -> ${userAddress}`)

    // Sync to D1 cache (so /api/names/available returns correct result)
    try {
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = now + 365 * 24 * 60 * 60
      const graceEndsAt = expiresAt + 90 * 24 * 60 * 60
      await c.env.DB.prepare(`
        INSERT INTO heaven_names (label, label_display, pkp_address, status, registered_at, expires_at, grace_ends_at, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
        ON CONFLICT(label) DO UPDATE SET pkp_address = ?, status = 'active', expires_at = ?, grace_ends_at = ?, updated_at = ?
      `).bind(label, label, userAddress.toLowerCase(), now, expiresAt, graceEndsAt, now, now, userAddress.toLowerCase(), expiresAt, graceEndsAt, now).run()
    } catch (dbErr) {
      console.warn('[Wallet] D1 cache sync failed (non-fatal):', dbErr)
    }

    return c.json({
      success: true,
      hash,
      blockNumber: receipt.blockNumber.toString(),
      label,
      fullName: `${label}.heaven`,
    })
  } catch (e: any) {
    console.error('[Wallet] Name register TX error:', e)
    return c.json({ error: `Transaction failed: ${e?.message || e}` }, 500)
  }
})

// GET /api/wallet/domain - Returns EIP-712 domain info (debug/verification)
wallet.get('/domain', async (c) => {
  const rpcUrl = c.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  const domainSeparator = await publicClient.readContract({
    address: DATING_PROFILE_ADDRESS,
    abi: DATING_PROFILE_ABI,
    functionName: 'DOMAIN_SEPARATOR',
  })

  return c.json({
    domain: EIP712_DOMAIN,
    domainSeparator,
    contract: DATING_PROFILE_ADDRESS,
    chainId: CHAIN_ID,
  })
})

export default wallet
