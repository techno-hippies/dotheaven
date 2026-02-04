/**
 * PostService — creates photo and text posts via Media Worker + Lit Actions.
 *
 * Photo flow:
 *   1. Client uploads full-res image to Media Worker
 *   2. Worker runs safety check, optional AI conversion, uploads to Filebase
 *   3. Worker returns CID
 *   4. Client calls Lit Action with CID to register IP Asset on Story Protocol
 *
 * Text flow: user writes text → Lit Action uploads JSON + registers IP Asset
 */

import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'
import { POST_REGISTER_V1_CID } from './lit/action-cids'

// ── Media Worker URL ──────────────────────────────────────────────────

const MEDIA_WORKER_URL = import.meta.env.VITE_MEDIA_WORKER_URL || 'https://heaven-media.deletion-backup782.workers.dev'

// ── Encrypted API keys (tied to POST_REGISTER_V1_CID) ─────────────────
// Filebase key is needed for metadata upload to IPFS

const FILEBASE_ENCRYPTED_KEY = {
  ciphertext: 'k4/tlPd6PmUYUCY7ziMbrM3ZpyZE2Q09FkTJ0xbcUwwWeyl0Gg7RC7DVLgStjplVQBqXz+EXCyuhI21POTOr+wmb6kDEAZLXCkicqoeNbyxlXkhkilwJ6uup0R+SpBr6JJAbiVmo9XpucywHF3kUS/zSWDcSdRA9Zz4UySSxN2hVhRkRr1/f0TTGOSbYr7cbdryFPgDnxMWR1tCzj/oamKCUND1vs9Zhvf2azMZjrBeDHbYlKNQC',
  dataToEncryptHash: '23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: POST_REGISTER_V1_CID },
  }],
}

// OpenRouter key is needed for text post safety checks
const OPENROUTER_ENCRYPTED_KEY = {
  ciphertext: 'sUiPgmLZUFb4dz9MyxrenTLqZY9GBj9z2Zs/egvKfPQNtVdnPC85aMhcOLGZyVsN/vXo7g0w4428AxgH7jhqBxIqPNrgG3YwfRg3HEsLSA1KYntGDQZdX8CWe7WRnvymSLkkSeWVMF2s0ALi4k4EfUaknCyRlw0qwd8wHAMrtxal8bWDeqdqwfCN1PhH8lT7pLw4hYoajZwf6MYC',
  dataToEncryptHash: '2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: POST_REGISTER_V1_CID },
  }],
}


// ── Types ─────────────────────────────────────────────────────────────

export interface PostCreateResult {
  cid: string
  /** Story Protocol IP Asset address (null if skipStoryRegistration) */
  ipId: string | null
  /** Post identifier (unique per post: author + timestamp + content) */
  ipIdBytes32: string
  /** Content-based ID for clustering/deduplication (same image → same contentId) */
  contentIdBytes32: string
  /** Story Protocol NFT token ID (null if skipStoryRegistration) */
  tokenId: string | null
  /** Story Protocol tx hash (null if skipStoryRegistration) */
  txHash: string | null
  /** MegaETH mirror tx hash */
  megaTxHash?: string | null
  mode: 'ai' | 'direct'
  isAdult: boolean
  imageUrl: string
}

export interface TextPostResult {
  contentCid: string
  ipId: string
  ipIdBytes32: string
  tokenId: string
  txHash: string
}

export type PostProcessingStep = 'safety' | 'converting' | 'uploading' | 'registering'

/** Attribution data for content ownership */
export interface PostAttribution {
  /** 'mine' = original content, 'not-mine' = shared content */
  ownership: 'mine' | 'not-mine'
  /** Source URL for shared content */
  sourceUrl?: string
  /** Platform name (twitter, tiktok, etc.) */
  sourcePlatform?: string
  /** Original creator handle */
  sourceHandle?: string
}

export interface PostCreateParams {
  imageFile: File
  title: string
  description?: string
  attribution?: PostAttribution
  onStep?: (step: PostProcessingStep) => void
}

export interface TextPostParams {
  text: string
  title?: string
  description?: string
  attribution?: PostAttribution
  onStep?: (step: 'uploading' | 'registering') => void
}

// ── IPFS gateway ──────────────────────────────────────────────────────

const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

// ── Media Worker Upload ───────────────────────────────────────────────

interface MediaUploadResult {
  success: boolean
  cid?: string
  mode?: 'ai' | 'direct'
  isAdult?: boolean
  contentType?: string
  error?: string
}

async function uploadToMediaWorker(file: File): Promise<MediaUploadResult> {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch(`${MEDIA_WORKER_URL}/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json() as MediaUploadResult

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Upload failed: ${response.status}`)
  }

  return data
}

// ── Photo Post Service ───────────────────────────────────────────────

export async function createPost(
  params: PostCreateParams,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): Promise<PostCreateResult> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) throw new Error('Not authenticated')

  const { imageFile, title, description = '', attribution, onStep } = params

  // Determine if this is original content (register on Story) or shared (skip Story)
  // IMPORTANT: Only treat as original if user EXPLICITLY claims ownership.
  // Missing attribution = unknown ownership = skip Story registration (conservative default)
  const isOriginal = attribution?.ownership === 'mine'

  // Step 1: Upload to Media Worker (safety check + optional AI conversion + Filebase upload)
  onStep?.('safety')
  const uploadResult = await uploadToMediaWorker(imageFile)

  if (!uploadResult.cid) {
    throw new Error('Upload failed: no CID returned')
  }

  // Step 2: Register IP Asset via Lit Action
  onStep?.('registering')

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000)

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  const result = await litClient.executeJs({
    ipfsId: POST_REGISTER_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      imageCid: uploadResult.cid,
      title,
      description,
      isAdult: uploadResult.isAdult || false,
      contentType: uploadResult.contentType || 'image/jpeg',
      timestamp,
      nonce,
      rightsMode: 0,
      licenseEnabled: false,
      filebaseEncryptedKey: FILEBASE_ENCRYPTED_KEY,
      // Skip Story Protocol registration for shared content
      skipStoryRegistration: !isOriginal,
      // Attribution data for shared content (stored in metadata)
      attribution: attribution ? {
        ownership: attribution.ownership,
        sourceUrl: attribution.sourceUrl,
        sourcePlatform: attribution.sourcePlatform,
        sourceHandle: attribution.sourceHandle,
      } : undefined,
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

  if (!response.success) {
    throw new Error(response.error || 'IP registration failed')
  }

  return {
    cid: uploadResult.cid,
    ipId: response.ipId ?? null,
    ipIdBytes32: response.ipIdBytes32,
    contentIdBytes32: response.contentIdBytes32,
    tokenId: response.tokenId ?? null,
    txHash: response.txHash ?? null,
    megaTxHash: response.megaTxHash ?? null,
    mode: uploadResult.mode || 'direct',
    isAdult: uploadResult.isAdult || false,
    imageUrl: `${IPFS_GATEWAY}/${uploadResult.cid}`,
  }
}

// ── Text Post Service ────────────────────────────────────────────────
// Uses unified POST_REGISTER_V1 action with `text` param (no imageCid)

export async function createTextPost(
  params: TextPostParams,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): Promise<TextPostResult> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) throw new Error('Not authenticated')

  const { text, title, description, onStep } = params

  onStep?.('uploading')

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000)

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Use unified POST_REGISTER_V1 with text param (no imageCid = text post)
  // Text posts skip Story Protocol registration (no IP registration for text-only)
  const result = await litClient.executeJs({
    ipfsId: POST_REGISTER_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      text,                            // Text content (triggers text post path)
      title: title || '',
      description: description || '',
      timestamp,
      nonce,
      rightsMode: 0,
      licenseEnabled: false,
      filebaseEncryptedKey: FILEBASE_ENCRYPTED_KEY,
      openrouterEncryptedKey: OPENROUTER_ENCRYPTED_KEY, // For text safety check
      skipStoryRegistration: true,     // Text posts don't register on Story
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

  if (!response.success) {
    throw new Error(response.error || 'Text post creation failed')
  }

  return {
    contentCid: response.contentCid,
    ipId: response.ipId || '',
    ipIdBytes32: response.ipIdBytes32,
    tokenId: response.tokenId || '',
    txHash: response.txHash || '',
  }
}
