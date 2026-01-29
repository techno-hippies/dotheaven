/**
 * PKP Message Signing
 * Signs messages using PKP via Lit Protocol
 */

import { getLitClient } from './client'
import { clearAuthContext } from './auth-pkp'
import type { PKPInfo, PKPAuthContext } from './types'

const IS_DEV = import.meta.env.DEV

/**
 * Check if error is a Lit Protocol session expiration
 */
function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('encrypted payload decryption failed') ||
      msg.includes('invalid signature') ||
      msg.includes('session has expired') ||
      msg.includes('auth method verification failed')
    )
  }
  return false
}

/**
 * Custom error for session expiration
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again to continue.')
    this.name = 'SessionExpiredError'
  }
}

/**
 * Sign a message using PKP (standalone function)
 * This creates an Ethereum signature compatible with SIWE/EIP-191
 * Used for XMTP and other protocols that need direct message signing
 */
export async function signMessageWithPKP(
  pkpInfo: PKPInfo,
  authContext: PKPAuthContext,
  message: string
): Promise<string> {
  if (IS_DEV) console.log('[PKPSigner] Signing message with PKP...')

  try {
    const litClient = await getLitClient()

    // Lit Action to sign personal message
    const litActionCode = `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`

    const result = await litClient.executeJs({
      code: litActionCode,
      authContext: authContext,
      jsParams: {
        message,
        publicKey: pkpInfo.publicKey,
      },
    })

    if (IS_DEV) console.log('[PKPSigner] Sign result:', result)

    // Extract signature
    if (result.signatures && result.signatures.sig) {
      const sig = result.signatures.sig

      // Combine r, s, and v into single signature
      if (sig.signature && sig.recoveryId !== undefined) {
        const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
        // Remove 0x prefix if present before constructing final signature
        const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
        const signature = `0x${sigHex}${v}`

        if (IS_DEV) console.log('[PKPSigner] Message signed successfully')
        return signature
      }
    }

    throw new Error('No signature returned from Lit Action')
  } catch (error) {
    console.error('[PKPSigner] Failed to sign message:', error)
    if (isSessionExpiredError(error)) {
      clearAuthContext()
      throw new SessionExpiredError()
    }
    throw new Error(
      `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
