/**
 * Remote Signer
 *
 * Proxies XMTP sign requests to the frontend via IPC stdout.
 * The frontend signs with PKP/Lit and sends the signature back via stdin.
 */

import { IdentifierKind, type Signer } from '@xmtp/node-sdk'
import { sendEvent } from './protocol.js'

const SIGN_TIMEOUT_MS = 30_000

type PendingSign = {
  resolve: (signature: Uint8Array) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingSign>()
let requestCounter = 0

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Create a remote signer that proxies sign requests to the frontend.
 */
export function createRemoteSigner(address: string): Signer {
  return {
    type: 'EOA',
    getIdentifier: () => ({
      identifier: address,
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const requestId = `sign-${++requestCounter}`

      return new Promise<Uint8Array>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error(`Signing timed out after ${SIGN_TIMEOUT_MS}ms`))
        }, SIGN_TIMEOUT_MS)

        pending.set(requestId, { resolve, reject, timer })

        sendEvent('sign-request', { requestId, message })
      })
    },
  }
}

/**
 * Resolve a pending sign request (called when frontend sends signing.resolve).
 */
export function resolveSignRequest(requestId: string, signature: string): void {
  const entry = pending.get(requestId)
  if (!entry) {
    console.error(`[signer] No pending sign request for ${requestId}`)
    return
  }
  clearTimeout(entry.timer)
  pending.delete(requestId)
  entry.resolve(hexToBytes(signature))
}
