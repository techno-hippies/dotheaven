/**
 * XMTP Browser Client
 *
 * Wraps @xmtp/browser-sdk with Lit Protocol PKP signer integration.
 */

import {
  Client,
  IdentifierKind,
  ConsentState,
  type ListMessagesOptions,
  type Signer,
  type Dm,
  type DecodedMessage,
} from '@xmtp/browser-sdk'

const IS_DEV = import.meta.env.DEV
const IS_TAURI = import.meta.env.VITE_PLATFORM === 'tauri'
const XMTP_ENV = (import.meta.env.VITE_XMTP_ENV || (IS_DEV ? 'dev' : 'production')) as
  | 'dev'
  | 'production'

const CONNECT_TIMEOUT_MS = 20000

// Singleton client instance
let xmtpClient: Client | null = null
let xmtpClientPromise: Promise<Client> | null = null
let currentAddress: string | null = null

/**
 * Convert hex string signature to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function supportsOpfs(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (!window.isSecureContext) return false
  return typeof navigator.storage?.getDirectory === 'function'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || ms <= 0) return promise
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[XMTP] ${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

/**
 * Create an XMTP-compatible signer from PKP
 */
export function createPKPSigner(
  address: `0x${string}`,
  signMessage: (message: string) => Promise<string>
): Signer {
  if (IS_DEV) console.log('[XMTP] Creating PKP signer for:', address)

  return {
    type: 'EOA',
    getIdentifier: () => {
      if (IS_DEV) console.log('[XMTP] getIdentifier called, returning:', address)
      return {
        identifier: address,
        identifierKind: IdentifierKind.Ethereum,
      }
    },
    signMessage: async (message: string) => {
      if (IS_DEV) console.log('[XMTP] signMessage called, message length:', message.length)
      try {
        const signature = await signMessage(message)
        if (IS_DEV) console.log('[XMTP] Signature received:', signature.slice(0, 20) + '...')
        return hexToBytes(signature)
      } catch (error) {
        console.error('[XMTP] signMessage failed:', error)
        throw error
      }
    },
  }
}

/**
 * Initialize XMTP client with PKP signer
 */
export async function initXMTPClient(
  address: `0x${string}`,
  signMessage: (message: string) => Promise<string>
): Promise<Client> {
  if (IS_DEV)
    console.log('[XMTP] initXMTPClient called:', {
      address,
      hasExistingClient: !!xmtpClient,
      hasExistingPromise: !!xmtpClientPromise,
      currentAddress,
    })

  // Return existing if same identity
  if (xmtpClient && currentAddress === address.toLowerCase()) {
    if (IS_DEV) console.log('[XMTP] Returning existing client')
    return xmtpClient
  }

  // If different address, disconnect first
  if (xmtpClient && currentAddress !== address.toLowerCase()) {
    if (IS_DEV) console.log('[XMTP] Address changed, disconnecting old client')
    disconnect()
  }

  if (xmtpClientPromise) {
    if (IS_DEV) console.log('[XMTP] Returning existing promise')
    return xmtpClientPromise
  }

  if (IS_DEV) console.log('[XMTP] Creating new client for:', address)

  xmtpClientPromise = (async () => {
    const signer = createPKPSigner(address, signMessage)

    if (IS_DEV) console.log('[XMTP] Signer created, calling Client.create with env:', XMTP_ENV)

    const canUseOpfs = supportsOpfs()
    if (!canUseOpfs && IS_DEV) {
      console.warn(
        `[XMTP] OPFS unavailable${IS_TAURI ? ' in Tauri' : ''}; using in-memory storage`
      )
    }

    const createOpts = {
      env: XMTP_ENV,
      dbPath: canUseOpfs ? undefined : null,
      disableDeviceSync: canUseOpfs ? undefined : true,
    } as const

    let client: Client
    try {
      client = await withTimeout(
        Client.create(signer, createOpts),
        CONNECT_TIMEOUT_MS,
        'Client.create'
      )
    } catch (err) {
      // If we hit the installation limit, use static revocation API and retry
      if (err instanceof Error && err.message.includes('registered 10/10 installations')) {
        console.warn('[XMTP] Installation limit reached, revoking all installations...')

        // Extract inboxId from the error message
        const inboxIdMatch = err.message.match(/InboxID\s+([a-f0-9]+)/)
        const inboxId = inboxIdMatch?.[1]
        if (!inboxId) throw err

        // Use static API to fetch and revoke all existing installations
        const inboxStates = await Client.fetchInboxStates([inboxId], XMTP_ENV)
        const installationBytes = inboxStates[0].installations.map((i: { bytes: Uint8Array }) => i.bytes)

        await Client.revokeInstallations(signer, inboxId, installationBytes, XMTP_ENV)
        if (IS_DEV) console.log('[XMTP] All installations revoked, retrying client creation...')

        client = await withTimeout(
          Client.create(signer, createOpts),
          CONNECT_TIMEOUT_MS,
          'Client.create (retry after revocation)'
        )
      } else {
        throw err
      }
    }

    xmtpClient = client

    currentAddress = address.toLowerCase()

    if (IS_DEV) console.log('[XMTP] Client initialized:', xmtpClient.inboxId)

    return xmtpClient
  })()

  try {
    return await xmtpClientPromise
  } catch (error) {
    xmtpClientPromise = null
    console.error('[XMTP] Failed to initialize client:', error)
    throw error
  } finally {
    // Only clear promise reference after completion, client stays
    xmtpClientPromise = null
  }
}

/**
 * Get the current client (must be initialized first)
 */
export function getClient(): Client | null {
  return xmtpClient
}

/**
 * Get the client's inbox ID
 */
export function getInboxId(): string | null {
  return xmtpClient?.inboxId ?? null
}

/**
 * Get or create a DM conversation with an address
 */
export async function getOrCreateDM(address: string): Promise<Dm> {
  if (!xmtpClient) {
    throw new Error('XMTP client not initialized')
  }

  if (IS_DEV) console.log('[XMTP] Creating DM with:', address)

  const conversation = await xmtpClient.conversations.createDmWithIdentifier({
    identifier: address,
    identifierKind: IdentifierKind.Ethereum,
  })

  if (IS_DEV) console.log('[XMTP] DM created:', conversation.id)

  return conversation
}

/**
 * List all DM conversations
 */
export async function listDMs(): Promise<Dm[]> {
  if (!xmtpClient) {
    throw new Error('XMTP client not initialized')
  }

  const consentStates = [ConsentState.Allowed, ConsentState.Unknown]
  await xmtpClient.conversations.syncAll(consentStates)
  return xmtpClient.conversations.listDms({ consentStates })
}

/**
 * Send a message to a conversation
 */
export async function sendMessage(conversation: Dm, content: string): Promise<void> {
  await conversation.sendText(content)
  if (IS_DEV) console.log('[XMTP] Message sent')
}

/**
 * Load messages from a conversation
 */
export async function loadMessages(
  conversation: Dm,
  options?: ListMessagesOptions
): Promise<DecodedMessage[]> {
  await conversation.sync()
  return conversation.messages(options)
}

/**
 * Stream messages from a conversation
 */
export async function streamMessages(
  conversation: Dm,
  onMessage: (message: DecodedMessage) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  const stream = await conversation.stream()

  let isActive = true

  ;(async () => {
    try {
      for await (const msg of stream) {
        if (!isActive || msg === undefined) break
        onMessage(msg)
      }
    } catch (error) {
      if (isActive && error instanceof Error) {
        console.error('[XMTP] Stream error:', error)
        onError?.(error)
      }
    }
  })()

  return () => {
    isActive = false
  }
}

/**
 * Update consent state for a conversation
 */
export async function updateConsentState(conversation: Dm, state: ConsentState): Promise<void> {
  await conversation.updateConsentState(state)
  if (IS_DEV) console.log('[XMTP] Consent state updated to:', state)
}

/**
 * Disconnect and cleanup
 */
export function disconnect(): void {
  xmtpClient = null
  xmtpClientPromise = null
  currentAddress = null
  if (IS_DEV) console.log('[XMTP] Disconnected')
}

/**
 * Check if client is connected
 */
export function isConnected(): boolean {
  return xmtpClient !== null
}

// Re-export types and enums
export { ConsentState }
export type { Dm, DecodedMessage, ListMessagesOptions }
