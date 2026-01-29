/**
 * Heaven Avatar Upload - via Lit Action
 *
 * Uploads avatar to IPFS with anime/stylized style enforcement.
 * Realistic photos of humans are rejected by Gemini vision check.
 */

import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

const AVATAR_ACTION_CODE_URL = import.meta.env.VITE_AVATAR_UPLOAD_ACTION_CID
  ? `https://ipfs.filebase.io/ipfs/${import.meta.env.VITE_AVATAR_UPLOAD_ACTION_CID}`
  : null

let _cachedActionCode: string | null = null

async function getAvatarActionCode(): Promise<string> {
  if (_cachedActionCode) return _cachedActionCode

  if (AVATAR_ACTION_CODE_URL) {
    const res = await fetch(AVATAR_ACTION_CODE_URL)
    if (!res.ok) throw new Error(`Failed to fetch avatar action: ${res.status}`)
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  // Dev fallback
  const res = await fetch('/lit-actions/avatar-upload-v1.js')
  if (res.ok) {
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  throw new Error(
    'Avatar upload action not available. Set VITE_AVATAR_UPLOAD_ACTION_CID or serve the action file locally.'
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix: "data:image/png;base64,..."
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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
): Promise<AvatarUploadResult> {
  const litClient = await getLitClient()

  // Convert file to base64 and compute hash
  const base64 = await fileToBase64(file)
  const arrayBuffer = await file.arrayBuffer()
  const imageHash = await sha256Hex(arrayBuffer)

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000_000)

  // Sign authorization message with user's PKP
  const message = `heaven:avatar:${imageHash}:${timestamp}:${nonce}`

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
    throw new Error('Failed to sign avatar authorization')
  }

  const sig = signResult.signatures.sig
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
  const signature = `0x${sigHex}${v}`

  // Execute the avatar upload action
  const actionCode = await getAvatarActionCode()

  const contentType = file.type || 'image/png'

  const result = await litClient.executeJs({
    code: actionCode,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      imageUrl: { base64, contentType },
      signature,
      timestamp,
      nonce,
      // Keys — in production these come from encrypted Lit secrets.
      // For dev, pass plaintext from env vars.
      openrouterPlaintextKey: import.meta.env.VITE_OPENROUTER_API_KEY || undefined,
      filebasePlaintextKey: import.meta.env.VITE_FILEBASE_API_KEY || undefined,
    },
  })

  const response = JSON.parse(result.response as string)
  return response as AvatarUploadResult
}
