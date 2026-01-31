/**
 * Heaven Avatar Upload - via Lit Action
 *
 * Uploads avatar to IPFS with anime/stylized style enforcement.
 * Realistic photos of humans are rejected by Gemini vision check.
 */

import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

const AVATAR_UPLOAD_CID = 'QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A'

/** Encrypted Filebase key — only decryptable by the avatar upload Lit Action CID */
const FILEBASE_ENCRYPTED_KEY = {
  ciphertext: 'pfbkdwk48PntH/CrTFsyRFLDxDak2yPMIvQMSss8iboeaa3bRGoY3M3ng11b1Ve5tH9A1lN7mVKpoDMYFGS+TClXG1JZKcKLIp9O8YVmBOxl8jGK+zGqCHiIU7JF/cFPpL5xAeZHgPjJL0XUlTWJiApU7lUqOGweTAwIiynpiEpfffxvcZM3Vt/oEIOvvbZfj/XXgOBHsQICM76Afx3r5rd9u1EwjjUAw1Az0qmtCRbvf43Kk7gC',
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

  // Convert file to base64
  const base64 = await fileToBase64(file)

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000_000)

  const contentType = file.type || 'image/png'

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
      openrouterPlaintextKey: options?.skipStyleCheck ? undefined : (import.meta.env.VITE_OPENROUTER_API_KEY || undefined),
    },
  })

  const response = JSON.parse(result.response as string)
  return response as AvatarUploadResult
}
