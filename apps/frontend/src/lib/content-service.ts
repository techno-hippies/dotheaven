/**
 * ContentService — orchestrates encrypted Filecoin upload/download + on-chain registration.
 *
 * Upload flow:
 *   1. Encrypt audio (AES-GCM + Lit-encrypted key) → combined blob
 *   2. Upload blob to Synapse (caller provides Synapse context)
 *   3. Call content-register-v1 Lit Action to register on ContentRegistry
 *
 * Download flow:
 *   1. Fetch encrypted blob from Beam CDN
 *   2. Parse header, call content-decrypt-v1 Lit Action for AES key
 *   3. Decrypt audio with AES key
 *
 * Share flow:
 *   1. Call content-access-v1 Lit Action (grant/revoke/batch)
 */

import { getLitClient } from './lit/client'
import type { PKPAuthContext } from './lit'
import {
  CONTENT_REGISTER_V1_CID,
  CONTENT_ACCESS_V1_CID,
  CONTENT_DECRYPT_V1_CID,
} from './lit/action-cids'
import { CONTENT_ACCESS_MIRROR } from './content-crypto'
import {
  encryptAudio,
  decryptAudio,
  parseHeader,
  beamUrl,
  computeContentId,
  ALGO_AES_GCM_256,
  CONTENT_REGISTRY,
} from './content-crypto'

export { computeContentId } from './content-crypto'

// ── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  contentId: string
  txHash: string
  blockNumber: number
  pieceCid: string
  blobSize: number
}

export interface DownloadResult {
  audio: Uint8Array
}

// ── Upload ─────────────────────────────────────────────────────────────

/**
 * Encrypt audio and register on ContentRegistry.
 *
 * The caller is responsible for uploading the blob to Synapse and providing the pieceCid.
 * This function handles encryption + on-chain registration.
 *
 * @param audio - Raw audio bytes
 * @param trackId - bytes32 hex string (from ScrobbleV3)
 * @param pieceCid - Filecoin piece CID from Synapse upload
 * @param authContext - Lit PKP auth context
 * @param pkpPublicKey - User's PKP public key
 * @param datasetOwner - Beam dataset owner address (defaults to user)
 */
export async function registerContent(
  trackId: string,
  pieceCid: string,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  datasetOwner?: string,
): Promise<{ contentId: string; txHash: string; blockNumber: number }> {
  if (!CONTENT_REGISTER_V1_CID) {
    throw new Error('CONTENT_REGISTER_V1_CID not set — deploy content-register-v1 first')
  }
  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  const result = await litClient.executeJs({
    ipfsId: CONTENT_REGISTER_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      trackId,
      pieceCid,
      datasetOwner: datasetOwner || undefined,
      algo: ALGO_AES_GCM_256,
      timestamp,
      nonce,
    },
  })

  const response = JSON.parse(result.response as string)
  if (!response.success) {
    throw new Error(`Content register failed: ${response.error}`)
  }

  return {
    contentId: response.contentId,
    txHash: response.txHash,
    blockNumber: response.blockNumber,
  }
}

/**
 * Encrypt audio bytes for Synapse upload.
 * Returns the blob to upload + metadata. Call registerContent after uploading to Synapse.
 *
 * @param audio - Raw audio bytes
 * @param contentId - bytes32 hex string (pre-computed via computeContentId(trackId, owner))
 * @param authContext - Lit PKP auth context
 */
export async function encryptForUpload(
  audio: Uint8Array,
  contentId: string,
  authContext: PKPAuthContext,
) {
  return encryptAudio(audio, contentId, authContext)
}

// ── Download ───────────────────────────────────────────────────────────

/**
 * Fetch and decrypt content from Beam CDN.
 *
 * @param datasetOwner - Address of the Synapse dataset owner
 * @param pieceCid - Filecoin piece CID
 * @param contentId - bytes32 content ID
 * @param authContext - Lit PKP auth context
 * @param pkpPublicKey - User's PKP public key
 * @param network - 'calibration' or 'mainnet'
 */
export async function fetchAndDecrypt(
  datasetOwner: string,
  pieceCid: string,
  contentId: string,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  network: 'calibration' | 'mainnet' = 'calibration',
): Promise<DownloadResult> {
  // 1. Fetch encrypted blob from Beam CDN
  const url = beamUrl(datasetOwner, pieceCid, network)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Beam CDN fetch failed: ${response.status} ${response.statusText}`)
  }
  const blob = new Uint8Array(await response.arrayBuffer())

  // 2. Parse header to get Lit ciphertext + hash
  const header = parseHeader(blob)

  // 3. Call content-decrypt-v1 Lit Action to get AES key
  if (!CONTENT_DECRYPT_V1_CID) {
    throw new Error('CONTENT_DECRYPT_V1_CID not set — deploy content-decrypt-v1 first')
  }
  if (!CONTENT_ACCESS_MIRROR) {
    throw new Error('CONTENT_ACCESS_MIRROR not set — deploy ContentAccessMirror first')
  }

  // Contract-gated condition matching what was used during encryption
  const accessControlConditions = [
    {
      conditionType: 'evmContract',
      contractAddress: CONTENT_ACCESS_MIRROR,
      chain: 'baseSepolia',
      functionName: 'canAccess',
      functionParams: [':userAddress', contentId.toLowerCase()],
      functionAbi: {
        type: 'function' as const,
        name: 'canAccess',
        stateMutability: 'view' as const,
        inputs: [
          { type: 'address', name: 'user', internalType: 'address' },
          { type: 'bytes32', name: 'contentId', internalType: 'bytes32' },
        ],
        outputs: [
          { type: 'bool', name: '', internalType: 'bool' },
        ],
      },
      returnValueTest: { key: '', comparator: '=', value: 'true' },
    },
  ]

  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  const result = await litClient.executeJs({
    ipfsId: CONTENT_DECRYPT_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      contentId,
      timestamp,
      nonce,
      ciphertext: header.litCiphertext,
      dataToEncryptHash: header.litDataToEncryptHash,
      unifiedAccessControlConditions: accessControlConditions,
    },
  })

  const decryptResponse = JSON.parse(result.response as string)
  if (!decryptResponse.success) {
    throw new Error(`Content decrypt failed: ${decryptResponse.error}`)
  }

  // 4. Decrypt audio with AES key
  const audio = await decryptAudio(blob, decryptResponse.key)

  return { audio }
}

// ── Access Control ─────────────────────────────────────────────────────

/**
 * Grant or revoke access to content.
 */
export async function manageAccess(
  operation: 'grant' | 'revoke' | 'grantBatch' | 'revokeBatch' | 'deactivate',
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  params: {
    contentId?: string
    contentIds?: string[]
    grantee?: string
  },
): Promise<{ txHash: string; blockNumber: number }> {
  if (!CONTENT_ACCESS_V1_CID) {
    throw new Error('CONTENT_ACCESS_V1_CID not set — deploy content-access-v1 first')
  }
  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  const result = await litClient.executeJs({
    ipfsId: CONTENT_ACCESS_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      operation,
      timestamp,
      nonce,
      ...params,
    },
  })

  const response = JSON.parse(result.response as string)
  if (!response.success) {
    throw new Error(`Content access ${operation} failed: ${response.error}`)
  }

  return { txHash: response.txHash, blockNumber: response.blockNumber }
}
