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

const recordsCidCandidates = [HEAVEN_SET_RECORDS_CID]

function isRetryableIpfsCodeFetchError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    msg.includes('error retrieving ipfs code file') ||
    msg.includes('timeout error getting code from ipfs') ||
    msg.includes('operation timed out') ||
    msg.includes('errorkind\":\"ipfs') ||
    msg.includes('status\":500')
  )
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function executeRecordsAction(
  litClient: Awaited<ReturnType<typeof getLitClient>>,
  authContext: PKPAuthContext,
  jsParams: Record<string, unknown>,
): Promise<SetTextRecordResult> {
  let lastError = 'setRecords failed'
  for (const cid of recordsCidCandidates) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (import.meta.env.DEV) {
          console.log('[HeavenRecords] executeJs', { cid, attempt })
        }
        const result = await litClient.executeJs({
          ipfsId: cid,
          authContext,
          jsParams,
        })
        const response = JSON.parse(result.response as string) as SetTextRecordResult
        if (response.success) return response
        const err = String(response.error || 'setRecords action returned success=false')
        lastError = err
        if (isRetryableIpfsCodeFetchError(err) && attempt < 3) {
          await sleep(500 * attempt)
          continue
        }
        if (isRetryableIpfsCodeFetchError(err)) break
        return response
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error)
        lastError = err
        if (isRetryableIpfsCodeFetchError(err) && attempt < 3) {
          await sleep(500 * attempt)
          continue
        }
        if (isRetryableIpfsCodeFetchError(err)) break
        return { success: false, error: err }
      }
    }
  }
  return { success: false, error: lastError }
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

  return executeRecordsAction(litClient, authContext, {
    node,
    userPkpPublicKey: pkpPublicKey,
    nonce: Number(nonce),
    key,
    value,
  })
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

  return executeRecordsAction(litClient, authContext, {
    node,
    userPkpPublicKey: pkpPublicKey,
    nonce: Number(nonce),
    keys,
    values,
  })
}
