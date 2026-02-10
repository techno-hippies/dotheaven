/**
 * Heaven Name Registry - MegaETH
 *
 * Client-side functions for:
 * - Checking name availability (direct RPC)
 * - Registering names via Lit Action (gasless, sponsor PKP pays)
 */

import { createPublicClient, http, parseAbi, keccak256, encodePacked, toBytes, type Address } from 'viem'
import { REGISTRY_V1, RECORDS_V1, HEAVEN_NODE } from '@heaven/core'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import { HEAVEN_CLAIM_NAME_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'

const registryAbi = parseAbi([
  'function available(bytes32 parentNode, string calldata label) external view returns (bool)',
  'function price(bytes32 parentNode, string calldata label, uint256 duration) external view returns (uint256)',
  'function fullName(uint256 tokenId) external view returns (string)',
  'function expiries(uint256 tokenId) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function primaryName(address) external view returns (string label, bytes32 parentNode)',
  'function primaryNode(address) external view returns (bytes32)',
])

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
  'function addr(bytes32 node) external view returns (address)',
])

// Singleton client for connection reuse
let _client: ReturnType<typeof createPublicClient> | null = null

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: megaTestnetV2,
      transport: http(megaTestnetV2.rpcUrls.default.http[0]),
      batch: { multicall: true },
    })
  }
  return _client
}

/**
 * Check if a .heaven name is available
 */
export async function checkNameAvailable(label: string): Promise<boolean> {
  const client = getClient()
  return client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'available',
    args: [HEAVEN_NODE, label],
  })
}

/**
 * Get price for a .heaven name (in wei)
 */
export async function getNamePrice(label: string): Promise<bigint> {
  const client = getClient()
  const duration = BigInt(365 * 24 * 60 * 60) // 1 year
  return client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'price',
    args: [HEAVEN_NODE, label, duration],
  })
}

export interface RegisterResult {
  success: boolean
  txHash?: string
  tokenId?: string
  node?: string
  label?: string
  fullName?: string
  error?: string
}

/**
 * Register a .heaven name via Lit Action (gasless)
 *
 * The sponsor PKP pays gas on MegaETH. User signs an EIP-191 message
 * authorizing the registration.
 */
export async function registerHeavenName(
  label: string,
  recipientAddress: `0x${string}`,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
): Promise<RegisterResult> {
  // Overall timeout to prevent indefinite hanging
  const timeoutPromise = new Promise<RegisterResult>((_, reject) =>
    setTimeout(() => reject(new Error('Registration timed out after 90 seconds. Lit network may be experiencing issues. Please try again.')), 90000)
  )

  const registerPromise = (async () => {
    const litClient = await getLitClient()

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000_000)

  // Pre-sign the EIP-191 message from the frontend using PKP signer.
  // This is more reliable than signing inside the Lit Action (signAndCombineEcdsa)
  // because it works with both WebAuthn and EOA auth contexts.
  const { signMessageWithPKP } = await import('../lit/signer-pkp')
  const message = `heaven:register:${label}:${recipientAddress}:${timestamp}:${nonce}`
  const { computeAddress } = await import('ethers')
  const pkpAddress = computeAddress(pkpPublicKey).toLowerCase() as `0x${string}`
  const signature = await signMessageWithPKP(
    { publicKey: pkpPublicKey, ethAddress: pkpAddress, tokenId: '' },
    authContext,
    message,
  )

  const claimCidCandidates = [HEAVEN_CLAIM_NAME_CID]
  const isRetryableLitNodeFault = (message: string): boolean => {
    const msg = message.toLowerCase()
    return (
      msg.includes('nodesystemfault') ||
      msg.includes('nodeunknownerror') ||
      msg.includes('ecdsa signing failed') ||
      msg.includes('could not delete file') ||
      msg.includes('/presigns/') ||
      msg.includes('.cbor') ||
      msg.includes('500') ||
      msg.includes('internal server error') ||
      msg.includes('request timeout') ||
      msg.includes('timed out')
    )
  }
  const isScopeError = (message: string): boolean => {
    const msg = message.toLowerCase()
    return msg.includes('nodeauthsigscopetoolimited') || msg.includes('required scope [1]')
  }
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  let lastError = 'Claim action failed'
  for (const cid of claimCidCandidates) {
    const maxAttemptsPerCid = 4
    for (let attempt = 1; attempt <= maxAttemptsPerCid; attempt++) {
      try {
        if (import.meta.env.DEV) {
          console.log('[HeavenRegistry] registerHeavenName executeJs', {
            cid,
            attempt,
            label,
            recipientAddress,
          })
        }
        const result = await litClient.executeJs({
          ipfsId: cid,
          authContext,
          jsParams: {
            recipient: recipientAddress,
            label,
            userPkpPublicKey: pkpPublicKey,
            timestamp,
            nonce,
            signature,
          },
        })

        const response = JSON.parse(result.response as string) as RegisterResult
        if (response.success) return response

        const err = String(response.error || 'Unknown claim error')
        lastError = err
        if (isRetryableLitNodeFault(err) && attempt < maxAttemptsPerCid) {
          await sleep(400 * attempt)
          continue
        }
        if (isScopeError(err)) {
          // Try next CID candidate
          break
        }
        return response
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error)
        lastError = err
        if (import.meta.env.DEV) {
          console.warn(`[HeavenRegistry] registerHeavenName error (attempt ${attempt}/${maxAttemptsPerCid}):`, err)
        }
        if (isRetryableLitNodeFault(err) && attempt < maxAttemptsPerCid) {
          await sleep(400 * attempt)
          continue
        }
        if (isScopeError(err)) {
          // Try next CID candidate
          break
        }
        return { success: false, error: err }
      }
    }
  }

  return { success: false, error: lastError }
  })()

  return Promise.race([registerPromise, timeoutPromise])
}

/**
 * Look up a text record for a .heaven name
 */
export async function getTextRecord(node: `0x${string}`, key: string): Promise<string> {
  const client = getClient()
  return client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'text',
    args: [node, key],
  })
}

/**
 * Look up the ETH address for a .heaven name
 */
export async function getAddr(node: `0x${string}`): Promise<Address> {
  const client = getClient()
  // tokenId = uint256(node) in RegistryV1
  const tokenId = BigInt(node)
  return client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'ownerOf',
    args: [tokenId],
  })
}

/**
 * Compute the ENS-compatible node (namehash) for a .heaven subname.
 * node = keccak256(abi.encodePacked(parentNode, keccak256(label)))
 */
export function computeNode(label: string): `0x${string}` {
  const labelHash = keccak256(toBytes(label))
  return keccak256(encodePacked(['bytes32', 'bytes32'], [HEAVEN_NODE, labelHash]))
}

/**
 * Reverse lookup: address → primary name.
 * The contract validates ownership + expiry, returning empty if invalid.
 * Returns null if the address has no valid primary name.
 */
/**
 * Reverse lookup: address → primary node only (no label).
 * Use when you need the node for record lookups but don't need to display the name.
 * Validated on-chain (ownership + expiry).
 */
export async function getPrimaryNode(address: `0x${string}`): Promise<`0x${string}` | null> {
  const client = getClient()
  const node = await client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'primaryNode',
    args: [address],
  })
  if (!node || node === '0x0000000000000000000000000000000000000000000000000000000000000000') return null
  return node as `0x${string}`
}

/**
 * Reverse lookup: address → primary name (label + node).
 * Use when you need both the display label and the node.
 * Validated on-chain (ownership + expiry).
 */
export async function getPrimaryName(address: `0x${string}`): Promise<{ node: `0x${string}`; label: string } | null> {
  const client = getClient()
  const [label, parentNode] = await client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'primaryName',
    args: [address],
  })
  if (!label) return null

  // Derive node from parentNode + label (same as computeNode but with arbitrary parent)
  const labelHash = keccak256(toBytes(label))
  const node = keccak256(encodePacked(['bytes32', 'bytes32'], [parentNode, labelHash]))
  return { node, label }
}

// ── Batched functions for community queries ─────────────────────────

export interface PrimaryNameResult {
  address: `0x${string}`
  label: string | null
  node: `0x${string}` | null
}

/**
 * Batch lookup: addresses → primary names.
 * Uses multicall to fetch all in ~1 RPC request.
 */
export async function getPrimaryNamesBatch(addresses: `0x${string}`[]): Promise<PrimaryNameResult[]> {
  if (addresses.length === 0) return []

  const client = getClient()

  // Use multicall for batched reads
  const contracts = addresses.map((addr) => ({
    address: REGISTRY_V1 as `0x${string}`,
    abi: registryAbi,
    functionName: 'primaryName' as const,
    args: [addr] as const,
  }))

  const results = await client.multicall({
    contracts,
    allowFailure: true,
  })

  return results.map((result, i) => {
    const addr = addresses[i]
    if (result.status === 'failure' || !result.result) {
      return { address: addr, label: null, node: null }
    }

    const [label, parentNode] = result.result as [string, `0x${string}`]
    if (!label) {
      return { address: addr, label: null, node: null }
    }

    // Derive node from parentNode + label
    const labelHash = keccak256(toBytes(label))
    const node = keccak256(encodePacked(['bytes32', 'bytes32'], [parentNode, labelHash]))
    return { address: addr, label, node }
  })
}

export interface TextRecordRequest {
  node: `0x${string}`
  key: string
}

export interface TextRecordResult {
  node: `0x${string}`
  key: string
  value: string
}

/**
 * Batch lookup: (node, key) pairs → text records.
 * Uses multicall to fetch all in ~1 RPC request.
 */
export async function getTextRecordsBatch(requests: TextRecordRequest[]): Promise<TextRecordResult[]> {
  if (requests.length === 0) return []

  const client = getClient()

  const contracts = requests.map((req) => ({
    address: RECORDS_V1 as `0x${string}`,
    abi: recordsAbi,
    functionName: 'text' as const,
    args: [req.node, req.key] as const,
  }))

  const results = await client.multicall({
    contracts,
    allowFailure: true,
  })

  return results.map((result, i) => {
    const req = requests[i]
    const value = result.status === 'success' ? (result.result as string) : ''
    return { node: req.node, key: req.key, value }
  })
}

export { REGISTRY_V1, RECORDS_V1, HEAVEN_NODE }
