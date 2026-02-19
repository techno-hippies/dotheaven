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
import {
  markRead,
  getLastReadAt,
  toLocalMessage,
  formatAddress,
} from './xmtp-utils'
import { recoverFromInstallationLimit } from './xmtp-recovery'

const IS_DEV = import.meta.env.DEV
const CONNECT_RETRY_COOLDOWN_MS = 30_000

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
