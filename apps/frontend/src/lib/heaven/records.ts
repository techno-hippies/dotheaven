/**
 * Heaven Records - Set ENS-compatible text records via Lit Action (gasless)
 *
 * Uses RecordsV1 contract on MegaETH. Sponsor PKP pays gas.
 * User's PKP signs EIP-191 message authorizing the record update.
 */

import { createPublicClient, http, parseAbi } from 'viem'
import { RECORDS_V1 } from '@heaven/core'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import { HEAVEN_SET_RECORDS_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'

const recordsAbi = parseAbi([
  'function nonces(bytes32 node) external view returns (uint256)',
])

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
}

export interface SetTextRecordResult {
  success: boolean
  txHash?: string
  blockNumber?: number
  node?: string
  user?: string
  nonce?: number
  error?: string
}

/**
 * Set a single text record on a .heaven name via Lit Action (gasless).
 *
 * @param node - bytes32 namehash of the name
 * @param key - record key (e.g. "avatar", "cover")
 * @param value - record value (e.g. "ipfs://Qm...")
 * @param pkpPublicKey - user's PKP public key
 * @param authContext - Lit auth context
 */
export async function setTextRecord(
  node: string,
  key: string,
  value: string,
  pkpPublicKey: string,
  authContext: PKPAuthContext,
): Promise<SetTextRecordResult> {
  const litClient = await getLitClient()
  const client = getClient()

  // Read on-chain nonce for the node
  const nonce = await client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'nonces',
    args: [node as `0x${string}`],
  })

  const result = await litClient.executeJs({
    ipfsId: HEAVEN_SET_RECORDS_CID,
    authContext,
    jsParams: {
      node,
      userPkpPublicKey: pkpPublicKey,
      nonce: Number(nonce),
      key,
      value,
    },
  })

  const response = JSON.parse(result.response as string)
  return response as SetTextRecordResult
}

/**
 * Set multiple text records on a .heaven name in one tx (gasless).
 */
export async function setTextRecords(
  node: string,
  keys: string[],
  values: string[],
  pkpPublicKey: string,
  authContext: PKPAuthContext,
): Promise<SetTextRecordResult> {
  const litClient = await getLitClient()
  const client = getClient()

  const nonce = await client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'nonces',
    args: [node as `0x${string}`],
  })

  const result = await litClient.executeJs({
    ipfsId: HEAVEN_SET_RECORDS_CID,
    authContext,
    jsParams: {
      node,
      userPkpPublicKey: pkpPublicKey,
      nonce: Number(nonce),
      keys,
      values,
    },
  })

  const response = JSON.parse(result.response as string)
  return response as SetTextRecordResult
}
