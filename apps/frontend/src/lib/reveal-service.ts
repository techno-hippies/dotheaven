/**
 * RevealService — handles photo reveal payment and image retrieval.
 *
 * Flow:
 * 1. Check reveal status (isRevealValid) and price
 * 2. Pay for reveal via EngagementV2.payReveal() (user pays ETH)
 * 3. Execute photo-reveal-v1.js Lit Action to get watermarked image
 *
 * The reveal system provides 24h access windows with accountability:
 * - Each payment creates a unique watermark code
 * - Watermarks trace back to the viewer + payment window
 * - Owners can view their own photos without payment/watermark
 */

import { ethers } from 'ethers'
import type { PKPAuthContext, PKPInfo } from './lit'
import { getLitClient } from './lit/client'
import { PHOTO_REVEAL_V1_CID } from './lit/action-cids'
import { megaTestnetV2 } from './chains'
import { PKPEthersSigner } from './lit/pkp-ethers-signer'

// ── Contract Addresses ───────────────────────────────────────────────

const ENGAGEMENT_V2_ADDRESS = '0xAF769d204e51b64D282083Eb0493F6f37cd93138'

// ── Constants ────────────────────────────────────────────────────────

const MIN_REVEAL_PRICE = ethers.parseEther('0.0001')
const REVEAL_WINDOW_SECONDS = 24 * 60 * 60 // 24 hours

// Heaven Images service URL (for watermarking)
const HEAVEN_IMAGES_URL = import.meta.env.VITE_HEAVEN_IMAGES_URL || 'https://heaven-images.deletion-backup782.workers.dev'

// ── ABI ──────────────────────────────────────────────────────────────

const ENGAGEMENT_V2_ABI = [
  'function revealPriceWei(bytes32 postId) view returns (uint256)',
  'function revealPaidAt(bytes32 postId, address viewer) view returns (uint64)',
  'function revealNonce(bytes32 postId, address viewer) view returns (uint32)',
  'function isRevealValid(bytes32 postId, address viewer) view returns (bool)',
  'function payReveal(bytes32 postId) payable',
]

// ── Types ────────────────────────────────────────────────────────────

export interface RevealStatus {
  /** Whether the viewer has a valid payment (within 24h window) */
  isValid: boolean
  /** Price to reveal in wei (0n if already paid) */
  priceWei: bigint
  /** Price formatted in ETH (e.g. "0.0001") */
  priceEth: string
  /** Timestamp when payment expires (0 if not paid) */
  expiresAt: number
  /** Time remaining in seconds (0 if not paid or expired) */
  remainingSeconds: number
  /** Current nonce (increments with each payment) */
  nonce: number
}

export interface RevealResult {
  success: boolean
  /** Base64 encoded watermarked image */
  imageBase64?: string
  /** Image content type (e.g. "image/jpeg") */
  contentType?: string
  /** Whether this is the owner viewing their own photo (no watermark) */
  isOwner?: boolean
  /** Viewer label shown in watermark */
  viewerLabel?: string
  /** 8-char display watermark code */
  watermarkCode?: string
  /** Full bytes32 watermark code */
  watermarkCodeBytes32?: string
  /** TX hash of the reveal log */
  logTxHash?: string
  /** Error message if failed */
  error?: string
}

export interface PayRevealResult {
  success: boolean
  txHash?: string
  error?: string
}

// ── Provider ─────────────────────────────────────────────────────────

function getMegaProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(megaTestnetV2.rpcUrls.default.http[0])
}

// ── Read Functions ───────────────────────────────────────────────────

/**
 * Get reveal status for a post + viewer combination.
 */
export async function getRevealStatus(
  postId: string,
  viewerAddress: string,
): Promise<RevealStatus> {
  const provider = getMegaProvider()
  const contract = new ethers.Contract(ENGAGEMENT_V2_ADDRESS, ENGAGEMENT_V2_ABI, provider)

  const [priceWei, paidAt, nonce, isValid] = await Promise.all([
    contract.revealPriceWei(postId) as Promise<bigint>,
    contract.revealPaidAt(postId, viewerAddress) as Promise<bigint>,
    contract.revealNonce(postId, viewerAddress) as Promise<bigint>,
    contract.isRevealValid(postId, viewerAddress) as Promise<boolean>,
  ])

  // Use MIN_REVEAL_PRICE if no custom price set
  const effectivePrice = priceWei > 0n ? priceWei : MIN_REVEAL_PRICE
  const paidAtNum = Number(paidAt)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = paidAtNum > 0 ? paidAtNum + REVEAL_WINDOW_SECONDS : 0
  const remainingSeconds = isValid ? Math.max(0, expiresAt - now) : 0

  return {
    isValid,
    priceWei: isValid ? 0n : effectivePrice,
    priceEth: ethers.formatEther(isValid ? 0n : effectivePrice),
    expiresAt,
    remainingSeconds,
    nonce: Number(nonce),
  }
}

/**
 * Get reveal price for a post (without viewer context).
 */
export async function getRevealPrice(postId: string): Promise<{ priceWei: bigint; priceEth: string }> {
  const provider = getMegaProvider()
  const contract = new ethers.Contract(ENGAGEMENT_V2_ADDRESS, ENGAGEMENT_V2_ABI, provider)

  const priceWei = (await contract.revealPriceWei(postId)) as bigint
  const effectivePrice = priceWei > 0n ? priceWei : MIN_REVEAL_PRICE

  return {
    priceWei: effectivePrice,
    priceEth: ethers.formatEther(effectivePrice),
  }
}

// ── Payment Function ─────────────────────────────────────────────────

/**
 * Pay to reveal a photo. User pays ETH directly to the contract.
 * All funds go to charity (immutable wallet in contract).
 */
export async function payReveal(
  postId: string,
  pkp: PKPInfo,
  authContext: PKPAuthContext,
): Promise<PayRevealResult> {
  try {
    const provider = getMegaProvider()

    // Get the price first
    const contract = new ethers.Contract(ENGAGEMENT_V2_ADDRESS, ENGAGEMENT_V2_ABI, provider)
    const priceWei = (await contract.revealPriceWei(postId)) as bigint
    const effectivePrice = priceWei > 0n ? priceWei : MIN_REVEAL_PRICE

    // Create signer
    const signer = new PKPEthersSigner(pkp, authContext, provider)

    // Connect contract to signer
    const contractWithSigner = contract.connect(signer) as ethers.Contract

    // Send payment transaction
    const tx = await contractWithSigner.payReveal(postId, { value: effectivePrice })
    const receipt = await tx.wait()

    return {
      success: true,
      txHash: receipt?.hash || tx.hash,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ── Reveal Function ──────────────────────────────────────────────────

export interface RevealParams {
  /** Post ID (bytes32) */
  postId: string
  /** Post creator address (for owner bypass check) */
  postCreator: string
  /** Encrypted original photo data from post metadata */
  encryptedOriginal: {
    ciphertext: string
    dataToEncryptHash: string
    accessControlConditions: any[]
  }
  /** Viewer's .heaven name (optional, for watermark display) */
  viewerHeavenName?: string
  /** Output width (default 1024) */
  outputWidth?: number
  /** Output height (default 1024) */
  outputHeight?: number
  /** Skip on-chain logging (for testing) */
  dryRun?: boolean
}

/**
 * Execute photo reveal via Lit Action.
 * Requires valid payment window OR being the post owner.
 */
export async function executeReveal(
  params: RevealParams,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): Promise<RevealResult> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) {
    return { success: false, error: 'Not authenticated' }
  }

  const {
    postId,
    postCreator,
    encryptedOriginal,
    viewerHeavenName,
    outputWidth = 1024,
    outputHeight = 1024,
    dryRun = false,
  } = params

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000)

  try {
    const litClient = await getLitClient()
    const authContext = await getAuthContext()

    const result = await litClient.executeJs({
      ipfsId: PHOTO_REVEAL_V1_CID,
      authContext,
      jsParams: {
        viewerPkpPublicKey: pkpPublicKey,
        postId,
        postCreator,
        encryptedOriginal,
        timestamp,
        nonce,
        heavenImagesUrl: HEAVEN_IMAGES_URL,
        viewerHeavenName,
        outputWidth,
        outputHeight,
        watermarkLayers: ['overlay', 'corner', 'tiled'],
        dryRun,
      },
    })

    const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Reveal failed',
      }
    }

    return {
      success: true,
      imageBase64: response.imageBase64,
      contentType: response.contentType,
      isOwner: response.isOwner,
      viewerLabel: response.viewerLabel,
      watermarkCode: response.watermarkCode,
      watermarkCodeBytes32: response.watermarkCodeBytes32,
      logTxHash: response.logTxHash,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ── Combined Flow ────────────────────────────────────────────────────

/**
 * Full reveal flow: check status → pay if needed → execute reveal.
 * Returns the watermarked image or error.
 */
export async function revealPhoto(
  params: RevealParams & {
    pkp: PKPInfo
  },
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
  onStep?: (step: 'checking' | 'paying' | 'revealing') => void,
): Promise<RevealResult> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) {
    return { success: false, error: 'Not authenticated' }
  }

  const viewerAddress = ethers.computeAddress('0x' + pkpPublicKey)
  const { postId, postCreator, pkp } = params

  // Check if viewer is owner (free bypass)
  const isOwner = viewerAddress.toLowerCase() === postCreator.toLowerCase()

  if (!isOwner) {
    // Check payment status
    onStep?.('checking')
    const status = await getRevealStatus(postId, viewerAddress)

    if (!status.isValid) {
      // Need to pay
      onStep?.('paying')
      const authContext = await getAuthContext()
      const payResult = await payReveal(postId, pkp, authContext)

      if (!payResult.success) {
        return { success: false, error: payResult.error || 'Payment failed' }
      }
    }
  }

  // Execute reveal
  onStep?.('revealing')
  return executeReveal(params, getAuthContext, getPkpPublicKey)
}

// ── Utility: Format Time Remaining ───────────────────────────────────

/**
 * Format remaining seconds as human-readable string.
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`
  }
  return `${minutes}m remaining`
}
