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
 *   2. Parse header, decrypt AES key via litClient.decrypt() (client-side)
 *   3. Decrypt audio with AES key
 *
 * The Lit BLS nodes enforce the canAccess() contract condition on Base during
 * threshold decryption. No Lit Action is needed for decrypt.
 *
 * Share flow:
 *   1. Call content-access-v1 Lit Action (grant/revoke/batch)
 */

import { getLitClient } from './lit/client'
import type { PKPAuthContext } from './lit'
import {
  CONTENT_REGISTER_V1_CID,
  CONTENT_ACCESS_V1_CID,
  LINK_EOA_V1_CID,
} from './lit/action-cids'

type EncryptedKey = {
  ciphertext: string
  dataToEncryptHash: string
  accessControlConditions: unknown[]
}

/** Encrypted Filebase covers key — bound to content-register-v1 action CID (update after redeploy). */
const FILEBASE_COVERS_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'tDexT2JOQHWx+3l3F6X1ggsITqpaGilj+DVUrVez5Gd0THUIv/sfcy4Brmpu9tMJ9PDk0EOGSoG+168+idOZM8Ixi/lrjhwDNEDmyL8EMCCGAXAV/pVe4ObQn0vcC6Ljg4ckVja+soDkyQ9E/JWklf+ZtbtkcmMNO2YszHgA0QjHg9blClYg89mTQVOZe4kqlA9GO2wzyRS3hhxfV4WsoaVaMrJD15g6nRCM8N2AcCN+hS/KS7WhE+Z+04k7ZS0R0zmuns6WNq3PB1pTdsm0FYNPwl2kM5iFAg==',
  dataToEncryptHash: '1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: 'QmchDhdrQ8JiX1NDFe6XG2wspWhGMpfEZ652iZp9NzVmCu' },
  }],
}
import { CONTENT_ACCESS_MIRROR } from './content-crypto'
import {
  encryptAudio,
  decryptAudio,
  parseHeader,
  beamUrl,
  ALGO_AES_GCM_256,
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
  if (!CONTENT_REGISTER_V1_CID) {
    throw new Error('CONTENT_REGISTER_V1_CID not set — deploy content-register-v1 first')
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
  if (coverImage) {
    jsParams.coverImage = coverImage
    jsParams.filebaseEncryptedKey = FILEBASE_COVERS_ENCRYPTED_KEY
  }

  const result = await litClient.executeJs({
    ipfsId: CONTENT_REGISTER_V1_CID,
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
 * Decryption is client-side via litClient.decrypt(). The Lit BLS nodes enforce
 * the canAccess() contract condition on Base ContentAccessMirror during threshold
 * decryption — no Lit Action is needed.
 *
 * @param datasetOwner - Address of the Synapse dataset owner
 * @param pieceCid - Filecoin piece CID
 * @param contentId - bytes32 content ID
 * @param authContext - Lit PKP auth context (must include access-control-condition-decryption resource)
 * @param network - 'calibration' or 'mainnet'
 */
export async function fetchAndDecrypt(
  datasetOwner: string,
  pieceCid: string,
  contentId: string,
  authContext: PKPAuthContext,
  network: 'calibration' | 'mainnet' = 'mainnet',
): Promise<DownloadResult> {
  // Validate contentId format
  if (!/^0x[0-9a-fA-F]{64}$/.test(contentId)) {
    throw new Error(`Invalid contentId: expected 0x-prefixed bytes32 hex, got "${contentId}"`)
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

  // 3. Decrypt AES key via litClient.decrypt() (client-side)
  //    Lit BLS nodes enforce canAccess() on Base ContentAccessMirror during threshold decryption.
  if (!CONTENT_ACCESS_MIRROR) {
    throw new Error('CONTENT_ACCESS_MIRROR not set — deploy ContentAccessMirror first')
  }

  // Unified access control conditions matching what was used during encryption
  const unifiedAccessControlConditions = [
    {
      conditionType: 'evmContract' as const,
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

  const decryptResult = await litClient.decrypt({
    unifiedAccessControlConditions: unifiedAccessControlConditions as any,
    ciphertext: header.litCiphertext,
    dataToEncryptHash: header.litDataToEncryptHash,
    authContext,
    chain: 'baseSepolia',
  })

  // Parse JSON payload and extract the AES key
  const decryptedPayload = new TextDecoder().decode(decryptResult.decryptedData)
  let parsed: { key?: string; contentId?: string }
  try {
    parsed = JSON.parse(decryptedPayload)
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
const linkedEoaSessionCache = new Set<string>()

function linkedEoaCacheKey(pkpPublicKey: string, eoaAddress: string): string {
  return `${pkpPublicKey.toLowerCase()}:${eoaAddress.toLowerCase()}`
}

/**
 * Grant or revoke access to content.
 */
/**
 * Link a PKP to its originating EOA on ContentAccessMirror (Base).
 * This allows content grants made to the EOA to also apply when the user
 * authenticates via their PKP. Called lazily during content-access operations.
 *
 * No-ops if LINK_EOA_V1_CID is not deployed yet.
 */
export async function linkEoa(
  authContext: PKPAuthContext,
  pkpPublicKey: string,
  eoaAddress: string,
): Promise<{ txHash?: string; alreadyLinked?: boolean } | null> {
  if (!LINK_EOA_V1_CID) {
    console.warn('[ContentService] LINK_EOA_V1_CID not set — skipping linkEoa')
    return null
  }
  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  // Derive PKP address from public key for the signature message
  const { computeAddress } = await import('ethers')
  const pkpAddress = computeAddress(pkpPublicKey).toLowerCase()

  // Pre-sign EIP-191 message proving PKP ownership (via user's PKP)
  const { signMessageWithPKP } = await import('./lit/signer-pkp')
  const message = `heaven:linkEoa:${pkpAddress}:${eoaAddress.toLowerCase()}:${timestamp}:${nonce}`
  const signature = await signMessageWithPKP(
    { publicKey: pkpPublicKey, ethAddress: pkpAddress as `0x${string}`, tokenId: '' },
    authContext,
    message,
  )

  const isRetryableNodeFault = (message: string): boolean => {
    const msg = message.toLowerCase()
    return (
      msg.includes('nodesystemfault') ||
      msg.includes('nodeunknownerror') ||
      msg.includes('ecdsa signing failed') ||
      msg.includes('could not delete file') ||
      msg.includes('/presigns/') ||
      msg.includes('.cbor')
    )
  }
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const maxAttempts = 3
  let response: any = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (import.meta.env.DEV) {
        console.log('[ContentService] linkEoa executeJs', {
          cid: LINK_EOA_V1_CID,
          attempt,
          maxAttempts,
        })
      }
      const result = await litClient.executeJs({
        ipfsId: LINK_EOA_V1_CID,
        authContext,
        jsParams: {
          userPkpPublicKey: pkpPublicKey,
          eoaAddress,
          signature,
          timestamp,
          nonce,
        },
      })

      response = JSON.parse(result.response as string)
      if (!response.success) {
        const errorMessage = String(response.error || 'Unknown linkEoa error')
        if (attempt < maxAttempts && isRetryableNodeFault(errorMessage)) {
          console.warn(`[ContentService] linkEoa transient Lit node error, retrying (${attempt}/${maxAttempts})`)
          await sleep(400 * attempt)
          continue
        }
        throw new Error(`linkEoa failed: ${errorMessage}`)
      }
      break
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (attempt < maxAttempts && isRetryableNodeFault(errorMessage)) {
        console.warn(`[ContentService] linkEoa executeJs transient failure, retrying (${attempt}/${maxAttempts})`)
        await sleep(400 * attempt)
        continue
      }
      throw error
    }
  }

  return {
    txHash: response.txHash,
    alreadyLinked: response.alreadyLinked,
  }
}

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
    eoaAddress?: string
  },
): Promise<{ txHash: string; blockNumber: number }> {
  if (!CONTENT_ACCESS_V1_CID) {
    throw new Error('CONTENT_ACCESS_V1_CID not set — deploy content-access-v1 first')
  }
  const eoaAddress = params.eoaAddress?.trim()
  if (eoaAddress) {
    const cacheKey = linkedEoaCacheKey(pkpPublicKey, eoaAddress)
    if (!linkedEoaSessionCache.has(cacheKey)) {
      try {
        await linkEoa(authContext, pkpPublicKey, eoaAddress)
        linkedEoaSessionCache.add(cacheKey)
      } catch (e) {
        // Non-fatal: allow access ops to continue for PKP-native use.
        console.warn('[ContentService] linkEoa during manageAccess failed (non-fatal):', e)
      }
    }
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
