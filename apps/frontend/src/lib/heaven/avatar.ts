/**
 * Heaven Avatar Upload - via Lit Action
 *
 * Uploads avatar to IPFS with anime/stylized style enforcement.
 * Realistic photos of humans are rejected by Gemini vision check.
 */

import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

const AVATAR_UPLOAD_CID = 'QmeA1zpz9R5Wem6gVjeUChAHKNXPRSqLHmujLVRuyo5bP5'

/** Encrypted Filebase key — only decryptable by the avatar upload Lit Action CID */
const FILEBASE_ENCRYPTED_KEY = {
  ciphertext: 'gI64VYKoMv3lF1gIjF2cX/qNiG4YcP0Zemg/qxvuWDyRV5XwIUFPbhA3AbRKh7cz1kmzy8BXP7dMrISPiuXlYaz6lLfICsDHd3y0uVyepYJlSeupN2f+W41bRmnPg6D1I7s08RLQMayWLcQYLmEHpucnqh4X6PLpDqtpVE3GvfbhiXKNSimc1TX98L8DB5z7gRqOXK9ddS4ut1OwvXTHQ4xNrm22JeeRwyD5Y04lVT/hI8ffz8MC',
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
  options?: { skipStyleCheck?: boolean },
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

  const contentType = file.type || 'image/png'

  const result = await litClient.executeJs({
    ipfsId: AVATAR_UPLOAD_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      imageUrl: { base64, contentType },
      signature,
      timestamp,
      nonce,
      skipStyleCheck: options?.skipStyleCheck ?? false,
      filebaseEncryptedKey: FILEBASE_ENCRYPTED_KEY,
      openrouterPlaintextKey: options?.skipStyleCheck ? undefined : (import.meta.env.VITE_OPENROUTER_API_KEY || undefined),
    },
  })

  const response = JSON.parse(result.response as string)
  return response as AvatarUploadResult
}
