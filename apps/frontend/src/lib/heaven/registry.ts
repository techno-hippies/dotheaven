/**
 * Heaven Name Registry - MegaETH
 *
 * Client-side functions for:
 * - Checking name availability (direct RPC)
 * - Registering names via Lit Action (gasless, sponsor PKP pays)
 */

import { createPublicClient, http, parseAbi, keccak256, encodePacked, toBytes, type Address } from 'viem'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import { HEAVEN_CLAIM_NAME_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'

// Contract addresses (MegaETH Testnet)
const REGISTRY_V1 = '0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2' as const
const RECORDS_V1 = '0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3' as const
const HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27' as const

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

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
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
  const litClient = await getLitClient()

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000_000)

  // Pre-sign the EIP-191 message from the frontend using PKP signer.
  // This is more reliable than signing inside the Lit Action (signAndCombineEcdsa)
  // because it works with both WebAuthn and EOA auth contexts.
  const { signMessageWithPKP } = await import('../lit/signer-pkp')
  const message = `heaven:register:${label}:${recipientAddress}:${timestamp}:${nonce}`
  const signature = await signMessageWithPKP(
    { publicKey: pkpPublicKey, ethAddress: recipientAddress, tokenId: '' },
    authContext,
    message,
  )

  // Must use ipfsId (not inline code) so Lit nodes can verify the action
  // is permitted to sign with the sponsor PKP
  const result = await litClient.executeJs({
    ipfsId: HEAVEN_CLAIM_NAME_CID,
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

  const response = JSON.parse(result.response as string)
  return response as RegisterResult
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

export { REGISTRY_V1, RECORDS_V1, HEAVEN_NODE }
