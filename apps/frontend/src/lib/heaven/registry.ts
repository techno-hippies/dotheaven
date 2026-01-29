/**
 * Heaven Name Registry - MegaETH
 *
 * Client-side functions for:
 * - Checking name availability (direct RPC)
 * - Registering names via Lit Action (gasless, sponsor PKP pays)
 */

import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

// Contract addresses (MegaETH Testnet)
const REGISTRY_V1 = '0x61CAed8296a2eF78eCf9DCa5eDf3C44469c6b1E2' as const
const RECORDS_V1 = '0x351ba82bAfDA1070bba8158852624653e3654929' as const
const HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27' as const

const registryAbi = parseAbi([
  'function available(bytes32 parentNode, string calldata label) external view returns (bool)',
  'function price(bytes32 parentNode, string calldata label, uint256 duration) external view returns (uint256)',
  'function fullName(uint256 tokenId) external view returns (string)',
  'function expiries(uint256 tokenId) external view returns (uint256)',
])

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
  'function addr(bytes32 node) external view returns (address)',
])

// Lit Action code for heaven-claim-name-v1
// This will be loaded from IPFS CID in production; inline for dev
const CLAIM_NAME_ACTION_URL = import.meta.env.VITE_HEAVEN_CLAIM_NAME_ACTION_CID
  ? `https://ipfs.filebase.io/ipfs/${import.meta.env.VITE_HEAVEN_CLAIM_NAME_ACTION_CID}`
  : null

let _cachedActionCode: string | null = null

async function getClaimNameActionCode(): Promise<string> {
  if (_cachedActionCode) return _cachedActionCode

  if (CLAIM_NAME_ACTION_URL) {
    const res = await fetch(CLAIM_NAME_ACTION_URL)
    if (!res.ok) throw new Error(`Failed to fetch Lit Action: ${res.status}`)
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  // Dev fallback: import the action code directly
  const res = await fetch('/lit-actions/heaven-claim-name-v1.js')
  if (res.ok) {
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  throw new Error(
    'Heaven claim-name action not available. Set VITE_HEAVEN_CLAIM_NAME_ACTION_CID or serve the action file locally.'
  )
}

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

  // Sign authorization message with user's PKP
  const message = `heaven:register:${label}:${recipientAddress}:${timestamp}:${nonce}`

  const signResult = await litClient.executeJs({
    code: `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`,
    authContext,
    jsParams: {
      message,
      publicKey: pkpPublicKey,
    },
  })

  if (!signResult.signatures?.sig) {
    throw new Error('Failed to sign registration authorization')
  }

  const sig = signResult.signatures.sig
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
  const signature = `0x${sigHex}${v}`

  // Execute the register action
  const actionCode = await getClaimNameActionCode()

  const result = await litClient.executeJs({
    code: actionCode,
    authContext,
    jsParams: {
      recipient: recipientAddress,
      label,
      signature,
      timestamp,
      nonce,
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
  return client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'addr',
    args: [node],
  })
}

export { REGISTRY_V1, RECORDS_V1, HEAVEN_NODE }
