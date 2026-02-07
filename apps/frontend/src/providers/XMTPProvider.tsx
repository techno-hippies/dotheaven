import {
  createContext,
  useContext,
  type ParentComponent,
  createSignal,
  createEffect,
  onCleanup,
} from 'solid-js'
import {
  createTransport,
  resetTransport,
  type XmtpTransport,
  type XmtpMessage as XmtpWireMessage,
  type ConversationInfo,
} from '../lib/xmtp'
import { useAuth } from './AuthContext'

const IS_DEV = import.meta.env.DEV
const IS_TAURI_PLATFORM = import.meta.env.VITE_PLATFORM === 'tauri'
const XMTP_ENV = (import.meta.env.VITE_XMTP_ENV || (IS_DEV ? 'dev' : 'production')) as
  | 'dev'
  | 'production'
const CONNECT_RETRY_COOLDOWN_MS = 30_000
const INSTALLATION_RECOVERY_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// localStorage-backed read state
// ---------------------------------------------------------------------------

const READ_STATE_KEY = 'heaven:xmtp:lastRead'

/** Load persisted lastRead timestamps: { [peerAddressLower]: epochMs } */
function loadReadState(): Record<string, number> {
  try {
    const raw = localStorage.getItem(READ_STATE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveReadState(state: Record<string, number>) {
  try {
    localStorage.setItem(READ_STATE_KEY, JSON.stringify(state))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function markRead(peerAddress: string): number {
  const key = peerAddress.toLowerCase()
  const state = loadReadState()
  const now = Date.now()
  state[key] = now
  saveReadState(state)
  return now
}

function getLastReadAt(peerAddress: string): number {
  return loadReadState()[peerAddress.toLowerCase()] ?? 0
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface XMTPMessage {
  id: string
  content: string
  sender: 'user' | 'other'
  timestamp: Date
  optimistic?: boolean
}

export interface ChatListItem {
  id: string
  peerAddress: string
  name: string
  lastMessage?: string
  timestamp?: Date
  hasUnread?: boolean
}

interface XMTPContextValue {
  isConnected: () => boolean
  isConnecting: () => boolean
  connect: () => Promise<void>
  disconnect: () => void
  inboxId: () => string | null
  conversations: () => ChatListItem[]
  refreshConversations: () => Promise<void>
  getConversation: (peerAddress: string) => Promise<string>
  getMessages: (peerAddress: string) => XMTPMessage[]
  sendMessage: (peerAddress: string, content: string) => Promise<void>
  subscribeToMessages: (peerAddress: string, callback: (messages: XMTPMessage[]) => void) => () => void
}

const XMTPContext = createContext<XMTPContextValue>()

// Module-level conversation ID cache: peerAddress → conversationId
const conversationIdCache = new Map<string, string>()
// Reverse lookup: conversationId → peerAddress
const conversationPeerCache = new Map<string, string>()

/**
 * Convert transport message to local display format
 */
function toLocalMessage(msg: XmtpWireMessage, myInboxId: string): XMTPMessage {
  return {
    id: msg.id,
    content: msg.content,
    sender: msg.senderAddress === myInboxId ? 'user' : 'other',
    timestamp: new Date(Number(msg.sentAtNs) / 1_000_000),
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || ms <= 0) return promise
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[XMTPProvider] ${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isInstallationLimitError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return /10\/10\s+installations/i.test(message)
}

function extractInboxId(message: string): string | null {
  const match =
    message.match(/InboxID\s+([a-f0-9]{64})/i) ??
    message.match(/inbox(?:\s*id)?[:\s]+([a-f0-9]{64})/i)
  return match?.[1]?.toLowerCase() ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parseHexBytes(value: string): Uint8Array | null {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  if (!/^[0-9a-f]+$/i.test(clean)) return null
  return hexToBytes(clean)
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value

  if (Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return new Uint8Array(value)
  }

  if (typeof value === 'string') {
    return parseHexBytes(value)
  }

  return null
}

function getInstallationBytes(installations: unknown[]): Uint8Array[] {
  const bytes: Uint8Array[] = []
  for (const installation of installations) {
    const direct = toUint8Array(installation)
    if (direct) {
      bytes.push(direct)
      continue
    }

    const record = asRecord(installation)
    if (!record) continue

    const candidate = toUint8Array(record.bytes) ?? toUint8Array(record.id) ?? toUint8Array(record.installationId)
    if (candidate) {
      bytes.push(candidate)
    }
  }
  return bytes
}

async function recoverFromInstallationLimit(
  address: string,
  signMessage: (message: string) => Promise<string>,
  error: unknown,
): Promise<boolean> {
  if (!IS_TAURI_PLATFORM || !isInstallationLimitError(error)) return false

  const message = getErrorMessage(error)
  const inboxId = extractInboxId(message)
  if (!inboxId) {
    console.error('[XMTPProvider] Installation limit reached but inboxId was not found in error:', message)
    return false
  }

  console.warn(`[XMTPProvider] Installation limit reached for inbox ${inboxId}, attempting static revocation`)

  try {
    const { Client, IdentifierKind } = await import('@xmtp/browser-sdk')

    const signer = {
      type: 'EOA',
      getIdentifier: () => ({
        identifier: address,
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (text: string) => {
        const signature = await signMessage(text)
        return hexToBytes(signature)
      },
    } as const

    const fetchInboxStates = Client.fetchInboxStates.bind(Client) as (...args: unknown[]) => Promise<unknown[]>
    const revokeInstallations = Client.revokeInstallations.bind(Client) as (...args: unknown[]) => Promise<void>

    let inboxStates: unknown[]
    try {
      inboxStates = await withTimeout(
        fetchInboxStates([inboxId], XMTP_ENV),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.fetchInboxStates'
      )
    } catch (fetchError) {
      if (IS_DEV) {
        console.warn('[XMTPProvider] fetchInboxStates with env failed, retrying without env:', fetchError)
      }
      inboxStates = await withTimeout(
        fetchInboxStates([inboxId]),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.fetchInboxStates (no env)'
      )
    }

    const state = asRecord(inboxStates[0])
    const installations = Array.isArray(state?.installations) ? state.installations : []
    const installationBytes = getInstallationBytes(installations)
    if (installationBytes.length === 0) {
      throw new Error('Inbox state did not include any revocable installations')
    }

    try {
      await withTimeout(
        revokeInstallations(signer, inboxId, installationBytes, XMTP_ENV),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.revokeInstallations'
      )
    } catch (revokeError) {
      if (IS_DEV) {
        console.warn('[XMTPProvider] revokeInstallations with env failed, retrying without env:', revokeError)
      }
      await withTimeout(
        revokeInstallations(signer, inboxId, installationBytes),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.revokeInstallations (no env)'
      )
    }

    console.warn(`[XMTPProvider] Revoked ${installationBytes.length} installations for inbox ${inboxId}`)
    return true
  } catch (recoveryError) {
    console.error('[XMTPProvider] Failed installation-limit recovery:', recoveryError)
    return false
  }
}

export const XMTPProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const [isConnected, setIsConnected] = createSignal(false)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [inboxId, setInboxId] = createSignal<string | null>(null)
  const [conversations, setConversations] = createSignal<ChatListItem[]>([])
  const [messagesMap, setMessagesMap] = createSignal<Record<string, XMTPMessage[]>>({})

  // Track which chat the user is currently viewing (peerAddress lowercase)
  const [activeChat, setActiveChat] = createSignal<string | null>(null)

  let transport: XmtpTransport | null = null
  const streamCleanups = new Map<string, () => void>()
  let globalStreamCleanup: (() => void) | null = null
  let lastConnectFailureAt = 0
  let lastConnectFailureAddress: string | null = null

  onCleanup(() => {
    streamCleanups.forEach((cleanup) => cleanup())
    streamCleanups.clear()
    globalStreamCleanup?.()
    globalStreamCleanup = null
  })

  // Auto-disconnect when auth logs out
  createEffect(() => {
    if (!auth.isAuthenticated() && isConnected()) {
      disconnect()
    }
  })

  const connect = async () => {
    const address = auth.pkpAddress()
    if (!address) {
      throw new Error('Not authenticated - please sign in first')
    }
    const normalizedAddress = address.toLowerCase()

    if (isConnected() || isConnecting()) return

    const msSinceFailure = Date.now() - lastConnectFailureAt
    if (
      lastConnectFailureAddress === normalizedAddress &&
      lastConnectFailureAt > 0 &&
      msSinceFailure < CONNECT_RETRY_COOLDOWN_MS
    ) {
      if (IS_DEV) {
        const remainingSeconds = Math.ceil((CONNECT_RETRY_COOLDOWN_MS - msSinceFailure) / 1000)
        console.warn(`[XMTPProvider] Skipping reconnect for ${remainingSeconds}s after previous failure`)
      }
      return
    }

    setIsConnecting(true)

    try {
      transport = await createTransport()
      await transport.init(address, auth.signMessage)

      setInboxId(transport.getInboxId())
      setIsConnected(true)
      lastConnectFailureAt = 0
      lastConnectFailureAddress = null

      await refreshConversations()

      // Start global message stream for unread tracking
      startGlobalStream()
    } catch (error) {
      let connectError: unknown = error

      if (await recoverFromInstallationLimit(address, auth.signMessage, connectError)) {
        try {
          if (!transport) transport = await createTransport()
          await transport.init(address, auth.signMessage)

          setInboxId(transport.getInboxId())
          setIsConnected(true)
          lastConnectFailureAt = 0
          lastConnectFailureAddress = null

          await refreshConversations()
          startGlobalStream()
          return
        } catch (retryError) {
          connectError = retryError
        }
      }

      lastConnectFailureAt = Date.now()
      lastConnectFailureAddress = normalizedAddress
      console.error('[XMTPProvider] Failed to connect:', connectError)
      throw connectError
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    globalStreamCleanup?.()
    globalStreamCleanup = null

    streamCleanups.forEach((cleanup) => cleanup())
    streamCleanups.clear()
    setMessagesMap({})
    setConversations([])
    setActiveChat(null)
    conversationIdCache.clear()
    conversationPeerCache.clear()

    resetTransport()
    transport = null
    setIsConnected(false)
    setInboxId(null)
    lastConnectFailureAt = 0
    lastConnectFailureAddress = null
  }

  const formatAddress = (address: string): string => {
    // Skip non-address strings (e.g. XMTP conversation IDs like "dm:abc123...")
    if (!address.startsWith('0x')) {
      return address.length > 20 ? `${address.slice(0, 8)}...${address.slice(-4)}` : address
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // -------------------------------------------------------------------------
  // Global message stream — drives unread indicators
  // -------------------------------------------------------------------------

  const startGlobalStream = () => {
    if (!transport) return

    globalStreamCleanup = transport.streamAllMessages(
      (msg) => {
        const myId = inboxId()
        if (!myId) return

        // Only care about messages from the peer (not our own sends)
        if (msg.senderAddress === myId) return

        // Find which peerAddress this conversation belongs to
        const peerKey = conversationPeerCache.get(msg.conversationId)
        if (!peerKey) return

        const currentActive = activeChat()
        const isViewing = currentActive === peerKey

        // Update conversation list: lastMessage, timestamp, and unread state
        setConversations((prev) => {
          const now = new Date(Number(msg.sentAtNs) / 1_000_000)
          const updated = prev.map((c) => {
            if (c.peerAddress.toLowerCase() !== peerKey) return c
            return {
              ...c,
              lastMessage: msg.content,
              timestamp: now,
              hasUnread: isViewing ? false : true,
            }
          })
          return updated.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0
            if (!a.timestamp) return 1
            if (!b.timestamp) return -1
            return b.timestamp.getTime() - a.timestamp.getTime()
          })
        })

        // If viewing, persist read state
        if (isViewing) {
          markRead(peerKey)
        }
      },
      (error) => {
        console.error('[XMTPProvider] Global stream error:', error)
      }
    )
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  const refreshConversations = async () => {
    if (!transport || !isConnected()) return

    try {
      const convos = await transport.listConversations()

      const myId = inboxId()
      const chatList: ChatListItem[] = convos.map((c: ConversationInfo) => {
        const peerKey = c.peerAddress.toLowerCase()
        conversationIdCache.set(peerKey, c.id)
        conversationPeerCache.set(c.id, peerKey)

        // Determine unread from localStorage
        const lastReadAt = getLastReadAt(c.peerAddress)
        const msgAt = c.lastMessageAt ?? 0
        const isFromPeer = c.lastMessageSender ? c.lastMessageSender !== myId : false
        const hasUnread = isFromPeer && msgAt > lastReadAt

        return {
          id: c.id,
          peerAddress: c.peerAddress,
          name: formatAddress(c.peerAddress),
          lastMessage: c.lastMessage,
          timestamp: c.lastMessageAt ? new Date(c.lastMessageAt) : undefined,
          hasUnread,
        }
      })

      chatList.sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0
        if (!a.timestamp) return 1
        if (!b.timestamp) return -1
        return b.timestamp.getTime() - a.timestamp.getTime()
      })

      setConversations(chatList)
    } catch (error) {
      console.error('[XMTPProvider] Failed to refresh conversations:', error)
    }
  }

  const getConversation = async (peerAddress: string): Promise<string> => {
    if (!transport) throw new Error('Not connected')

    const key = peerAddress.toLowerCase()
    const cached = conversationIdCache.get(key)
    if (cached) return cached

    const conversationId = await transport.getOrCreateConversation(peerAddress)
    conversationIdCache.set(key, conversationId)
    conversationPeerCache.set(conversationId, key)
    return conversationId
  }

  const getMessagesForPeer = (peerAddress: string): XMTPMessage[] => {
    return messagesMap()[peerAddress.toLowerCase()] || []
  }

  const upsertMessage = (peerAddress: string, msg: XmtpWireMessage) => {
    const myId = inboxId()
    if (!myId) return

    const localMsg = toLocalMessage(msg, myId)
    const key = peerAddress.toLowerCase()

    setMessagesMap((prev) => {
      const existing = prev[key] || []
      const existingIndex = existing.findIndex(
        (m) => m.id === localMsg.id || (m.optimistic && m.content === localMsg.content)
      )

      if (existingIndex >= 0) {
        const updated = [...existing]
        updated[existingIndex] = localMsg
        return { ...prev, [key]: updated }
      }

      return { ...prev, [key]: [...existing, localMsg] }
    })
  }

  const sendMessageToPeer = async (peerAddress: string, content: string) => {
    if (!transport) throw new Error('Not connected')

    const conversationId = await getConversation(peerAddress)
    const key = peerAddress.toLowerCase()

    // Optimistic message
    const optimisticMsg: XMTPMessage = {
      id: `optimistic-${Date.now()}`,
      content,
      sender: 'user',
      timestamp: new Date(),
      optimistic: true,
    }

    setMessagesMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), optimisticMsg],
    }))

    try {
      await transport.sendMessage(conversationId, content)

      // Update conversations list
      setConversations((prev) => {
        const now = new Date()
        const existing = prev.find((c) => c.peerAddress.toLowerCase() === key)

        if (existing) {
          const updated = prev.map((c) =>
            c.peerAddress.toLowerCase() === key
              ? { ...c, lastMessage: content, timestamp: now }
              : c
          )
          return updated.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0
            if (!a.timestamp) return 1
            if (!b.timestamp) return -1
            return b.timestamp.getTime() - a.timestamp.getTime()
          })
        } else {
          const newChat: ChatListItem = {
            id: conversationId,
            peerAddress,
            name: formatAddress(peerAddress),
            lastMessage: content,
            timestamp: now,
          }
          return [newChat, ...prev]
        }
      })
    } catch (error) {
      // Remove optimistic message on failure
      setMessagesMap((prev) => ({
        ...prev,
        [key]: (prev[key] || []).filter((m) => m.id !== optimisticMsg.id),
      }))

      const errorMsg: XMTPMessage = {
        id: `error-${Date.now()}`,
        content: 'Failed to send message. Please try again.',
        sender: 'other',
        timestamp: new Date(),
      }
      setMessagesMap((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), errorMsg],
      }))

      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Per-chat subscription (opens a chat view)
  // -------------------------------------------------------------------------

  const subscribeToMessages = (
    peerAddress: string,
    callback: (messages: XMTPMessage[]) => void
  ): (() => void) => {
    const key = peerAddress.toLowerCase()

    // Set this as the active chat
    setActiveChat(key)

    // Mark as read: update localStorage + clear blue dot
    markRead(peerAddress)
    setConversations((prev) =>
      prev.map((c) =>
        c.peerAddress.toLowerCase() === key ? { ...c, hasUnread: false } : c
      )
    )

    ;(async () => {
      try {
        if (!transport) return

        const conversationId = await getConversation(peerAddress)
        const myId = inboxId()
        if (!myId) return

        // Load existing messages
        const xmtpMsgs = await transport.loadMessages(conversationId)
        const localMsgs = xmtpMsgs.map((m) => toLocalMessage(m, myId))

        setMessagesMap((prev) => ({ ...prev, [key]: localMsgs }))
        callback(localMsgs)

        // Start streaming for this specific conversation
        const cleanup = transport.streamMessages(
          conversationId,
          (newMsg) => {
            upsertMessage(peerAddress, newMsg)

            // Keep read state fresh while viewing
            markRead(peerAddress)
            setConversations((prev) =>
              prev.map((c) =>
                c.peerAddress.toLowerCase() === key ? { ...c, hasUnread: false } : c
              )
            )

            callback(getMessagesForPeer(peerAddress))
          },
          (error) => {
            console.error('[XMTPProvider] Stream error for', peerAddress, error)
          }
        )

        streamCleanups.set(key, cleanup)
      } catch (error) {
        console.error('[XMTPProvider] Failed to subscribe to messages:', error)
      }
    })()

    return () => {
      // Clear active chat when leaving
      if (activeChat() === key) {
        setActiveChat(null)
      }

      const cleanup = streamCleanups.get(key)
      if (cleanup) {
        cleanup()
        streamCleanups.delete(key)
      }
    }
  }

  const value: XMTPContextValue = {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    inboxId,
    conversations,
    refreshConversations,
    getConversation,
    getMessages: getMessagesForPeer,
    sendMessage: sendMessageToPeer,
    subscribeToMessages,
  }

  return <XMTPContext.Provider value={value}>{props.children}</XMTPContext.Provider>
}

export function useXMTP() {
  const context = useContext(XMTPContext)
  if (!context) {
    throw new Error('useXMTP must be used within XMTPProvider')
  }
  return context
}
