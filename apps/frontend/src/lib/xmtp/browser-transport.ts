/**
 * Browser Transport
 *
 * XMTP transport using @xmtp/browser-sdk directly in the WebView.
 * Used for web builds where OPFS is available.
 */

import {
  Client,
  IdentifierKind,
  ConsentState,
  GroupMessageKind,
  SortDirection,
  type Signer,
  type Dm,
  type DecodedMessage,
} from '@xmtp/browser-sdk'
import type {
  XmtpTransport,
  ConversationInfo,
  XmtpMessage,
  LoadMessagesOptions,
  SignMessageFn,
} from './transport'

const IS_DEV = import.meta.env.DEV
const XMTP_ENV = (import.meta.env.VITE_XMTP_ENV || (IS_DEV ? 'dev' : 'production')) as
  | 'dev'
  | 'production'
const CONNECT_TIMEOUT_MS = 20000

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
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

function createPKPSigner(address: string, signMessage: SignMessageFn): Signer {
  return {
    type: 'EOA',
    getIdentifier: () => ({
      identifier: address,
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await signMessage(message)
      return hexToBytes(signature)
    },
  }
}

function getDisplayableContent(msg: DecodedMessage): string | null {
  const kind = msg.kind as GroupMessageKind | string
  const isApplication = kind === GroupMessageKind.Application || kind === 'application'
  if (!isApplication) return null

  const typeId = msg.contentType?.typeId
  if (typeId !== 'text' && typeId !== 'markdown') return null

  if (typeof msg.content === 'string') return msg.content
  if (typeof msg.fallback === 'string' && msg.fallback.length > 0) return msg.fallback
  return null
}

function decodedToXmtpMessage(msg: DecodedMessage, conversationId: string): XmtpMessage | null {
  const content = getDisplayableContent(msg)
  if (!content) return null
  return {
    id: msg.id,
    conversationId,
    senderAddress: msg.senderInboxId,
    content,
    sentAtNs: String(msg.sentAtNs),
    kind: 'application',
  }
}

export class BrowserTransport implements XmtpTransport {
  private client: Client | null = null
  private clientPromise: Promise<Client> | null = null
  private currentAddress: string | null = null
  private conversationCache = new Map<string, Dm>()
  private activeStreams = new Map<string, () => void>()

  async init(address: string, signMessage: SignMessageFn): Promise<void> {
    if (this.client && this.currentAddress === address.toLowerCase()) return

    if (this.client && this.currentAddress !== address.toLowerCase()) {
      this.disconnect()
    }

    if (this.clientPromise) {
      await this.clientPromise
      return
    }

    this.clientPromise = (async () => {
      const signer = createPKPSigner(address, signMessage)
      const canUseOpfs = supportsOpfs()

      if (!canUseOpfs && IS_DEV) {
        console.warn('[XMTP/Browser] OPFS unavailable; using in-memory storage')
      }

      const createOpts = {
        env: XMTP_ENV,
        dbPath: canUseOpfs ? undefined : null,
        disableDeviceSync: canUseOpfs ? undefined : true,
      } as const

      let client: Client
      try {
        client = await withTimeout(Client.create(signer, createOpts), CONNECT_TIMEOUT_MS, 'Client.create')
      } catch (err) {
        if (err instanceof Error && err.message.includes('registered 10/10 installations')) {
          console.warn('[XMTP/Browser] Installation limit reached, revoking all installations...')
          const inboxIdMatch = err.message.match(/InboxID\s+([a-f0-9]+)/)
          const inboxId = inboxIdMatch?.[1]
          if (!inboxId) throw err

          const inboxStates = await Client.fetchInboxStates([inboxId], XMTP_ENV)
          const installationBytes = inboxStates[0].installations.map((i: { bytes: Uint8Array }) => i.bytes)
          await Client.revokeInstallations(signer, inboxId, installationBytes, XMTP_ENV)

          client = await withTimeout(Client.create(signer, createOpts), CONNECT_TIMEOUT_MS, 'Client.create (retry)')
        } else {
          throw err
        }
      }

      this.client = client
      this.currentAddress = address.toLowerCase()
      return client
    })()

    try {
      await this.clientPromise
    } catch (error) {
      console.error('[XMTP/Browser] Failed to initialize:', error)
      throw error
    } finally {
      this.clientPromise = null
    }
  }

  disconnect(): void {
    this.activeStreams.forEach((cleanup) => cleanup())
    this.activeStreams.clear()
    this.conversationCache.clear()
    this.client = null
    this.clientPromise = null
    this.currentAddress = null
  }

  isConnected(): boolean {
    return this.client !== null
  }

  getInboxId(): string | null {
    return this.client?.inboxId ?? null
  }

  async listConversations(): Promise<ConversationInfo[]> {
    if (!this.client) throw new Error('Not connected')

    const consentStates = [ConsentState.Allowed, ConsentState.Unknown]
    await this.client.conversations.syncAll(consentStates)
    const dms = await this.client.conversations.listDms({ consentStates })

    const results: ConversationInfo[] = []
    for (const dm of dms) {
      this.conversationCache.set(dm.id, dm)

      const members = await dm.members()
      const myId = this.client.inboxId
      const peer = members.find((m) => m.inboxId !== myId)
      // @ts-expect-error - accountAddresses may not be typed
      const rawAddr = peer?.accountAddresses?.[0] as string | undefined
      // Fallback to dm.id if no account address found (e.g. dm:xxx conversation IDs)
      const peerAddress = rawAddr || dm.id
      console.log('[BrowserTransport] listConversations dm:', dm.id, 'peer:', peer?.inboxId, 'rawAddr:', rawAddr, 'peerAddress:', peerAddress)

      this.conversationCache.set(peerAddress.toLowerCase(), dm)

      const messages = await dm.messages({ limit: 1n, direction: SortDirection.Descending })
      const lastMsg = messages[0]
      const lastContent = lastMsg ? getDisplayableContent(lastMsg) : undefined

      results.push({
        id: dm.id,
        peerAddress,
        lastMessage: lastContent || undefined,
        lastMessageAt: lastMsg ? lastMsg.sentAt.getTime() : undefined,
        lastMessageSender: lastMsg?.senderInboxId,
      })
    }
    return results
  }

  async getOrCreateConversation(peerAddress: string): Promise<string> {
    if (!this.client) throw new Error('Not connected')

    const cached = this.conversationCache.get(peerAddress.toLowerCase())
    if (cached) return cached.id

    const dm = await this.client.conversations.createDmWithIdentifier({
      identifier: peerAddress,
      identifierKind: IdentifierKind.Ethereum,
    })

    const consentState = await dm.consentState()
    if (consentState === ConsentState.Unknown) {
      await dm.updateConsentState(ConsentState.Allowed)
    }

    this.conversationCache.set(dm.id, dm)
    this.conversationCache.set(peerAddress.toLowerCase(), dm)
    return dm.id
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    const dm = this.conversationCache.get(conversationId)
    if (!dm) throw new Error(`Conversation ${conversationId} not found`)
    await dm.sendText(content)
  }

  async loadMessages(conversationId: string, options?: LoadMessagesOptions): Promise<XmtpMessage[]> {
    const dm = this.conversationCache.get(conversationId)
    if (!dm) throw new Error(`Conversation ${conversationId} not found`)

    await dm.sync()
    const msgs = await dm.messages({
      direction: SortDirection.Ascending,
      kind: GroupMessageKind.Application,
      limit: options?.limit ? BigInt(options.limit) : undefined,
      sentAfterNs: options?.sentAfterNs ? BigInt(options.sentAfterNs) : undefined,
    })

    return msgs
      .map((m) => decodedToXmtpMessage(m, conversationId))
      .filter((m): m is XmtpMessage => m !== null)
  }

  streamMessages(
    conversationId: string,
    onMessage: (msg: XmtpMessage) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.activeStreams.has(conversationId)) {
      return () => {}
    }

    const dm = this.conversationCache.get(conversationId)
    if (!dm) {
      onError?.(new Error(`Conversation ${conversationId} not found`))
      return () => {}
    }

    let isActive = true
    this.activeStreams.set(conversationId, () => { isActive = false })

    ;(async () => {
      try {
        const stream = await dm.stream()
        for await (const msg of stream) {
          if (!isActive || msg === undefined) break
          const decoded = decodedToXmtpMessage(msg, conversationId)
          if (decoded) onMessage(decoded)
        }
      } catch (error) {
        if (isActive && error instanceof Error) {
          onError?.(error)
        }
      } finally {
        this.activeStreams.delete(conversationId)
      }
    })()

    return () => {
      isActive = false
      this.activeStreams.delete(conversationId)
    }
  }

  streamAllMessages(
    _onMessage: (msg: XmtpMessage) => void,
    _onError?: (err: Error) => void
  ): () => void {
    // TODO: implement for browser-sdk when needed
    console.warn('[BrowserTransport] streamAllMessages not yet implemented')
    return () => {}
  }

  async updateConsent(conversationId: string, state: 'allowed' | 'denied' | 'unknown'): Promise<void> {
    const dm = this.conversationCache.get(conversationId)
    if (!dm) throw new Error(`Conversation ${conversationId} not found`)

    const consentState =
      state === 'allowed' ? ConsentState.Allowed :
      state === 'denied' ? ConsentState.Denied :
      ConsentState.Unknown
    await dm.updateConsentState(consentState)
  }
}
