/**
 * ContentService — orchestrates encrypted Filecoin upload/download + on-chain registration.
 *
 * Upload flow:
 *   1. Encrypt audio (AES-GCM + Lit-encrypted key) → combined blob
 *   2. Upload blob to Synapse (caller provides Synapse context)
 *   3. Call content-register Lit Action (v2 preferred, v1 fallback) to register on ContentRegistry
 *
 * Download flow:
 *   1. Fetch encrypted blob from Beam CDN
 *   2. Parse header, decrypt AES key via content-decrypt-v1 Lit Action (server-side)
 *   3. Decrypt audio with AES key
 *
 * The decrypt Lit Action checks canAccess() on MegaETH ContentRegistry,
 * then uses decryptAndCombine to recover the AES key server-side.
 *
 * Share flow:
 *   1. Call content-access-v1 Lit Action (grant/revoke/batch)
 */

import { getLitClient } from './lit/client'
import type { PKPAuthContext } from './lit'
import {
  CONTENT_REGISTER_V1_CID,
  CONTENT_REGISTER_V2_CID,
  CONTENT_ACCESS_V1_CID,
  CONTENT_DECRYPT_V1_CID,
} from './lit/action-cids'

type EncryptedKey = {
  ciphertext: string
  dataToEncryptHash: string
  accessControlConditions: unknown[]
}

/** Encrypted Filebase covers key — bound to content-register-v1 action CID (update after redeploy). */
const FILEBASE_COVERS_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'guGcS501abbYbS4YtUVh9QTZoSYr8N6PfDqHjRYI0G5GMCQQf7rBfIQVNMmTC1473kDeerp6uNZ7/umhre4zfFTrFiSXsrDHkgEav0Ef61+GAZXE1Ar92k+VTcnKdiXXHNzzBgFDeh8YOuVRJ41YfBg7q5Ls8w9y8tDBiMmwCY0BA5zXP+IlpUZhTg3NKtvKHJeZoLPVxqbKe+GL5ETB7agVcfMgE96F1Xljpqv1gXKxAIlCGfzThmiJ3KIegOd930MIML8OvkJpcFM0VQ75E1CQBX9mC48FAg==',
  dataToEncryptHash: '1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: CONTENT_REGISTER_V1_CID },
  }],
}
import {
  encryptAudio,
  decryptAudio,
  parseHeader,
  beamUrl,
  ALGO_AES_GCM_256,
} from './content-crypto'

export { computeContentId } from './content-crypto'

const ACTIVE_CONTENT_REGISTER_CID = CONTENT_REGISTER_V2_CID || CONTENT_REGISTER_V1_CID
const ACTIVE_CONTENT_REGISTER_VERSION = CONTENT_REGISTER_V2_CID ? 'v2' : 'v1'

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
 * @param trackMeta - Track metadata (title, artist, album)
 * @param algo - Encryption algorithm (0=plaintext, 1=AES-GCM-256)
 * @param coverImage - Optional album art to upload
 */
export async function registerContent(
  trackId: string,
  pieceCid: string,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  datasetOwner?: string,
  trackMeta?: { title: string; artist: string; album?: string },
  algo?: number,
  coverImage?: { base64: string; contentType: string },
): Promise<{ contentId: string; txHash: string; blockNumber: number; coverCid?: string; coverTxHash?: string }> {
  if (!ACTIVE_CONTENT_REGISTER_CID) {
    throw new Error(
      'No content-register CID set — deploy content-register-v2 (preferred) or content-register-v1',
    )
  }
  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  // Build jsParams
  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpPublicKey,
    trackId,
    pieceCid,
    datasetOwner: datasetOwner || undefined,
    algo: algo ?? ALGO_AES_GCM_256,
    title: trackMeta?.title || '',
    artist: trackMeta?.artist || '',
    album: trackMeta?.album || '',
    timestamp,
    nonce,
  }

  // Add cover image if provided (uses encrypted key — no plaintext in frontend)
  if (coverImage && ACTIVE_CONTENT_REGISTER_VERSION === 'v1') {
    jsParams.coverImage = coverImage
    jsParams.filebaseEncryptedKey = FILEBASE_COVERS_ENCRYPTED_KEY
  } else if (coverImage && ACTIVE_CONTENT_REGISTER_VERSION === 'v2') {
    console.warn('[ContentService] coverImage ignored for content-register-v2 (use track-cover-v4)')
  }

  const result = await litClient.executeJs({
    ipfsId: ACTIVE_CONTENT_REGISTER_CID,
    authContext,
    jsParams,
  })

  const response = JSON.parse(result.response as string)
  if (!response.success) {
    throw new Error(`Content register failed: ${response.error}`)
  }

  return {
    contentId: response.contentId,
    txHash: response.txHash,
    blockNumber: response.blockNumber,
    coverCid: response.coverCid || undefined,
    coverTxHash: response.coverTxHash || undefined,
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
 * Decryption uses content-decrypt-v1 Lit Action (server-side via executeJs +
 * decryptAndCombine). This bypasses the Lit SDK v8 limitation where client-side
 * litClient.decrypt() fails with Lit Action ACC conditions (BLSNetworkSig not
 * supported for wallet sig validation).
 *
 * The Lit Action checks canAccess() on MegaETH ContentRegistry directly,
 * then calls decryptAndCombine to recover the AES key.
 *
 * @param datasetOwner - Address of the Synapse dataset owner
 * @param pieceCid - Filecoin piece CID
 * @param contentId - bytes32 content ID
 * @param authContext - Lit PKP auth context (must include lit-action-execution + pkp-signing resources)
 * @param pkpPublicKey - User's PKP public key
 * @param network - 'calibration' or 'mainnet'
 */
export async function fetchAndDecrypt(
  datasetOwner: string,
  pieceCid: string,
  contentId: string,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  network: 'calibration' | 'mainnet' = 'mainnet',
): Promise<DownloadResult> {
  // Validate contentId format
  if (!/^0x[0-9a-fA-F]{64}$/.test(contentId)) {
    throw new Error(`Invalid contentId: expected 0x-prefixed bytes32 hex, got "${contentId}"`)
  }
  if (!CONTENT_DECRYPT_V1_CID) {
    throw new Error('CONTENT_DECRYPT_V1_CID not set — deploy content-decrypt-v1 first')
  }

  // 1. Fetch encrypted blob from Beam CDN
  const url = beamUrl(datasetOwner, pieceCid, network)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Beam CDN fetch failed: ${response.status} ${response.statusText}`)
  }
  const blob = new Uint8Array(await response.arrayBuffer())

  // 2. Parse header to get Lit ciphertext + hash
  const header = parseHeader(blob)

  // 3. Decrypt AES key via content-decrypt-v1 Lit Action (server-side)
  const litClient = await getLitClient()
  const timestamp = Date.now()
  const nonce = crypto.randomUUID()

  const result = await litClient.executeJs({
    ipfsId: CONTENT_DECRYPT_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      contentId: contentId.toLowerCase(),
      ciphertext: header.litCiphertext,
      dataToEncryptHash: header.litDataToEncryptHash,
      decryptCid: CONTENT_DECRYPT_V1_CID,
      timestamp,
      nonce,
    },
  })

  const decryptResponse = JSON.parse(result.response as string)
  if (!decryptResponse.success) {
    throw new Error(`Content decrypt failed: ${decryptResponse.error}`)
  }

  // Parse JSON payload and extract the AES key
  let parsed: { key?: string; contentId?: string }
  try {
    parsed = JSON.parse(decryptResponse.decryptedPayload)
  } catch {
    throw new Error('Decrypted payload is not valid JSON — possible key corruption or wrong access condition')
  }
  if (!parsed.key) {
    throw new Error('Decrypted payload missing key')
  }
  if (parsed.contentId?.toLowerCase() !== contentId.toLowerCase()) {
    throw new Error(`Content ID mismatch: payload bound to ${parsed.contentId}, requested ${contentId}`)
  }

  // 4. Decrypt audio with AES key
  const audio = await decryptAudio(blob, parsed.key)

  return { audio }
}

/**
 * Fetch plaintext (unencrypted) content from Beam CDN.
 * Used when algo=0 (public uploads that skip Lit encryption).
 */
export async function fetchPlaintext(
  datasetOwner: string,
  pieceCid: string,
  network: 'calibration' | 'mainnet' = 'mainnet',
): Promise<DownloadResult> {
  const url = beamUrl(datasetOwner, pieceCid, network)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Beam CDN fetch failed: ${response.status} ${response.statusText}`)
  }
  const audio = new Uint8Array(await response.arrayBuffer())
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

  if (import.meta.env.DEV) {
    console.log('[ContentService] manageAccess executeJs', {
      cid: CONTENT_ACCESS_V1_CID,
      operation,
    })
  }
  const result = await litClient.executeJs({
    ipfsId: CONTENT_ACCESS_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      operation,
      timestamp,
      nonce,
      ...(params.contentId ? { contentId: params.contentId } : {}),
      ...(params.contentIds ? { contentIds: params.contentIds } : {}),
      ...(params.grantee ? { grantee: params.grantee } : {}),
    },
  })

  const response = JSON.parse(result.response as string)
  if (!response.success) {
    throw new Error(`Content access ${operation} failed: ${response.error}`)
  }

  return { txHash: response.txHash, blockNumber: response.blockNumber }
}
