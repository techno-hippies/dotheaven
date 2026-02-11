/**
 * Heaven Avatar Upload - via Lit Action
 *
 * Uploads avatar to IPFS with anime/stylized style enforcement.
 * Realistic photos of humans are rejected by Gemini vision check.
 */

import { getLitClient } from '../lit/client'
import { AVATAR_UPLOAD_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'

/** Encrypted Filebase key — only decryptable by the avatar upload Lit Action CID */
const FILEBASE_ENCRYPTED_KEY = {
  ciphertext: 'uPCvvNTzGAf2924hvE8+0W7DNjZQNkUlye+zQWkOfK4YpShWfw+Pwx8+0zGAIM4Amvu68nUz/+Ie65Wk9hsDQq8L61O0qbLfdyr8Nx2nR+BlgMlneDO7uL92s7o3422JmH8v22Nazy+jCXDNNyzNFIEUvQ7FeLmlC2cVPGosKhZeA1EWX3Mdropmss6s4IZM3qjw+mYRXYHbzMOzek7gpsrUFJ1ilNnXKwUPcKFzDJ5aoUQw7oQC',
  dataToEncryptHash: '23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4',
  accessControlConditions: [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: AVATAR_UPLOAD_CID,
      },
    },
  ],
}

/** Encrypted OpenRouter key — only decryptable by the avatar upload Lit Action CID */
const OPENROUTER_ENCRYPTED_KEY = {
  ciphertext: 'ohXZVCRGljiCLwqlq7SOsCS29E1X0GR8PlAwmtAzoZOUQ3YQYaNT0vT+OXmAYduQyKfcVQeptpog4O2cw53iCOI72Eb7mu6cG0WuqZgXxzVKC7Mc/UKOV7DzQtvjy9RcW+UpSheW626Q+RlLqyNY0uIyeR6EWywjYrpc9n59GZ6I8JLkR5geeit02OxZE9LeCIQdHlvnLj92QSEC',
  dataToEncryptHash: '2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092',
  accessControlConditions: [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: AVATAR_UPLOAD_CID,
      },
    },
  ],
}

/** Max dimension (width or height) for avatar uploads */
const MAX_AVATAR_SIZE = 512
/** JPEG quality (0-1) for compressed avatars */
const JPEG_QUALITY = 0.85

/**
 * Resize & compress an image file to JPEG, capping dimensions at MAX_AVATAR_SIZE.
 * Returns { base64, contentType } ready for the Lit Action payload.
 */
async function resizeImage(file: File): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  // Calculate scaled dimensions preserving aspect ratio
  let targetW = width
  let targetH = height
  if (width > MAX_AVATAR_SIZE || height > MAX_AVATAR_SIZE) {
    const scale = MAX_AVATAR_SIZE / Math.max(width, height)
    targetW = Math.round(width * scale)
    targetH = Math.round(height * scale)
  }

  const canvas = new OffscreenCanvas(targetW, targetH)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return { base64: btoa(binary), contentType: 'image/jpeg' }
}

export interface AvatarUploadResult {
  success: boolean
  avatarCID?: string
  imageHash?: string
  error?: string
}

/**
 * Upload an avatar via Lit Action (includes anime/stylized style check).
 *
 * The Lit Action will:
 * 1. Verify the user's signature
 * 2. Check image style via Gemini 3 Flash (rejects realistic human photos)
 * 3. Upload to IPFS via Filebase
 */
export async function uploadAvatar(
  file: File,
  pkpPublicKey: string,
  authContext: PKPAuthContext,
  options?: { skipStyleCheck?: boolean },
): Promise<AvatarUploadResult> {
  const litClient = await getLitClient()

  // Resize & compress to JPEG before sending to Lit network
  const { base64, contentType } = await resizeImage(file)

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000_000)

  // Single executeJs: action signs with user's PKP, validates, uploads
  const result = await litClient.executeJs({
    ipfsId: AVATAR_UPLOAD_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      imageUrl: { base64, contentType },
      timestamp,
      nonce,
      skipStyleCheck: options?.skipStyleCheck ?? false,
      filebaseEncryptedKey: FILEBASE_ENCRYPTED_KEY,
      openrouterEncryptedKey: options?.skipStyleCheck ? undefined : OPENROUTER_ENCRYPTED_KEY,
    },
  })

  const response = JSON.parse(result.response as string)
  return response as AvatarUploadResult
}
