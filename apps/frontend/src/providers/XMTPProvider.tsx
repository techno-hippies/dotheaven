import {
  createContext,
  useContext,
  type ParentComponent,
  createSignal,
  createEffect,
  onCleanup,
} from 'solid-js'
import {
  initXMTPClient,
  getOrCreateDM,
  listDMs,
  loadMessages,
  sendMessage,
  streamMessages,
  updateConsentState,
  disconnect as disconnectXMTP,
  ConsentState,
  type Dm,
  type DecodedMessage,
} from '../lib/xmtp'
import { useAuth } from './AuthContext'
import { SortDirection, GroupMessageKind } from '@xmtp/browser-sdk'

const IS_DEV = import.meta.env.DEV

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
}

interface ConversationCache {
  conversation: Dm
  peerAddress: string
  createdAt: Date
  lastMessage?: string
  lastMessageTime?: Date
}

// Module-level cache for conversations - survives component re-mounts
// Keyed by both peerAddress (lowercase) AND conversation ID
const conversationCache = new Map<string, ConversationCache>()

interface XMTPContextValue {
  isConnected: () => boolean
  isConnecting: () => boolean
  connect: () => Promise<void>
  disconnect: () => void
  inboxId: () => string | null
  // Conversation list
  conversations: () => ChatListItem[]
  refreshConversations: () => Promise<void>
  // Conversation methods
  getConversation: (peerAddress: string) => Promise<Dm>
  getMessages: (peerAddress: string) => XMTPMessage[]
  sendMessage: (peerAddress: string, content: string) => Promise<void>
  subscribeToMessages: (peerAddress: string, callback: (messages: XMTPMessage[]) => void) => () => void
}

const XMTPContext = createContext<XMTPContextValue>()

/**
 * Get displayable content from XMTP message
 */
function getDisplayableXMTPContent(msg: DecodedMessage): string | null {
  // Only show application messages (filter membership updates, etc.)
  const kind = msg.kind as GroupMessageKind | string
  const isApplication = kind === GroupMessageKind.Application || kind === 'application'
  if (!isApplication) return null

  const typeId = msg.contentType?.typeId
  if (typeId !== 'text' && typeId !== 'markdown') return null

  if (typeof msg.content === 'string') return msg.content
  if (typeof msg.fallback === 'string' && msg.fallback.length > 0) return msg.fallback
  return null
}

/**
 * Convert XMTP message to local format
 */
function xmtpToLocalMessage(msg: DecodedMessage, myInboxId: string): XMTPMessage | null {
  const content = getDisplayableXMTPContent(msg)
  if (!content) return null

  return {
    id: msg.id,
    content,
    sender: msg.senderInboxId === myInboxId ? 'user' : 'other',
    timestamp: msg.sentAt,
  }
}

export const XMTPProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const [isConnected, setIsConnected] = createSignal(false)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [inboxId, setInboxId] = createSignal<string | null>(null)
  const [conversations, setConversations] = createSignal<ChatListItem[]>([])

  // Message state per peer address
  const [messagesMap, setMessagesMap] = createSignal<Record<string, XMTPMessage[]>>({})

  // Active stream cleanups
  const streamCleanups = new Map<string, () => void>()

  // Cleanup all streams on unmount
  onCleanup(() => {
    streamCleanups.forEach((cleanup) => cleanup())
    streamCleanups.clear()
  })

  // Auto-disconnect when auth logs out
  createEffect(() => {
    if (!auth.isAuthenticated() && isConnected()) {
      if (IS_DEV) console.log('[XMTPProvider] Auth logged out, disconnecting XMTP')
      disconnect()
    }
  })

  const connect = async () => {
    const address = auth.pkpAddress()
    if (!address) {
      throw new Error('Not authenticated - please sign in first')
    }

    if (isConnected() || isConnecting()) {
      if (IS_DEV) console.log('[XMTPProvider] Already connected or connecting')
      return
    }

    setIsConnecting(true)

    try {
      if (IS_DEV) console.log('[XMTPProvider] Connecting XMTP for:', address)

      // Use the auth context's signMessage function
      const client = await initXMTPClient(address, auth.signMessage)
      setInboxId(client.inboxId ?? null)
      setIsConnected(true)
      if (IS_DEV) console.log('[XMTPProvider] Connected, inbox:', client.inboxId)

      // Load conversations after connecting
      await refreshConversations()
    } catch (error) {
      console.error('[XMTPProvider] Failed to connect:', error)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    // Cleanup all streams
    streamCleanups.forEach((cleanup) => cleanup())
    streamCleanups.clear()

    // Clear message state
    setMessagesMap({})
    setConversations([])

    // Clear conversation cache
    conversationCache.clear()

    // Disconnect client
    disconnectXMTP()
    setIsConnected(false)
    setInboxId(null)

    if (IS_DEV) console.log('[XMTPProvider] Disconnected')
  }

  /**
   * Format address for display
   */
  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  /**
   * Refresh the list of conversations from XMTP
   */
  const refreshConversations = async () => {
    if (!isConnected()) return

    try {
      if (IS_DEV) console.log('[XMTPProvider] Refreshing conversations...')

      const dms = await listDMs()

      // Build chat list with details
      const chatList: ChatListItem[] = await Promise.all(
        dms.map(async (dm) => {
          try {
            // Get members to find peer address
            const members = await dm.members()
            const myId = inboxId()
            const peer = members.find((m) => m.inboxId !== myId)
            // @ts-expect-error - accountAddresses exists on GroupMember but types may be outdated
            const peerAddress = (peer?.accountAddresses?.[0] as string) || dm.id

            // Get last message
            const messages = await dm.messages({ limit: 1n, direction: SortDirection.Descending })
            const lastMsg = messages[0]
            const lastContent = lastMsg ? getDisplayableXMTPContent(lastMsg) : undefined

            const cacheEntry: ConversationCache = {
              conversation: dm,
              peerAddress,
              createdAt: new Date(),
              lastMessage: lastContent || undefined,
              lastMessageTime: lastMsg?.sentAt,
            }

            // Cache by both peerAddress AND conversation ID for lookup flexibility
            conversationCache.set(peerAddress.toLowerCase(), cacheEntry)
            conversationCache.set(dm.id.toLowerCase(), cacheEntry)

            return {
              id: dm.id,
              peerAddress,
              name: formatAddress(peerAddress),
              lastMessage: lastContent || undefined,
              timestamp: lastMsg?.sentAt,
            }
          } catch (err) {
            console.error('[XMTPProvider] Error loading conversation:', err)
            // Cache by dm.id so we can still look it up
            conversationCache.set(dm.id.toLowerCase(), {
              conversation: dm,
              peerAddress: dm.id,
              createdAt: new Date(),
            })
            return {
              id: dm.id,
              peerAddress: dm.id,
              name: formatAddress(dm.id),
            }
          }
        })
      )

      // Sort by timestamp (most recent first)
      chatList.sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0
        if (!a.timestamp) return 1
        if (!b.timestamp) return -1
        return b.timestamp.getTime() - a.timestamp.getTime()
      })

      setConversations(chatList)
      if (IS_DEV) console.log('[XMTPProvider] Loaded', chatList.length, 'conversations')
    } catch (error) {
      console.error('[XMTPProvider] Failed to refresh conversations:', error)
    }
  }

  /**
   * Validate if string is an Ethereum address
   */
  const isValidEthAddress = (addr: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const getConversation = async (peerAddressOrId: string): Promise<Dm> => {
    const key = peerAddressOrId.toLowerCase()

    // Check cache first (works for both addresses and conversation IDs)
    const cached = conversationCache.get(key)
    if (cached) {
      if (IS_DEV) console.log('[XMTPProvider] Returning cached conversation for:', peerAddressOrId)
      return cached.conversation
    }

    // Only create new DM if it's a valid Ethereum address
    if (!isValidEthAddress(peerAddressOrId)) {
      throw new Error(`Cannot create conversation: "${peerAddressOrId}" is not a valid Ethereum address`)
    }

    // Create new conversation
    const conversation = await getOrCreateDM(peerAddressOrId)

    // Update consent state to allowed
    const consentState = await conversation.consentState()
    if (consentState === ConsentState.Unknown) {
      await updateConsentState(conversation, ConsentState.Allowed)
    }

    // Cache by both address and conversation ID
    const cacheEntry: ConversationCache = {
      conversation,
      peerAddress: peerAddressOrId,
      createdAt: new Date(),
    }
    conversationCache.set(key, cacheEntry)
    conversationCache.set(conversation.id.toLowerCase(), cacheEntry)

    return conversation
  }

  const getMessagesForPeer = (peerAddress: string): XMTPMessage[] => {
    return messagesMap()[peerAddress.toLowerCase()] || []
  }

  const upsertMessage = (peerAddress: string, msg: DecodedMessage) => {
    const myId = inboxId()
    if (!myId) return

    const localMsg = xmtpToLocalMessage(msg, myId)
    if (!localMsg) return

    const key = peerAddress.toLowerCase()
    setMessagesMap((prev) => {
      const existing = prev[key] || []

      // Check if message already exists (by id)
      const existingIndex = existing.findIndex(
        (m) => m.id === localMsg.id || (m.optimistic && m.content === localMsg.content)
      )

      if (existingIndex >= 0) {
        // Replace optimistic or existing message
        const updated = [...existing]
        updated[existingIndex] = localMsg
        return { ...prev, [key]: updated }
      }

      // Add new message
      return { ...prev, [key]: [...existing, localMsg] }
    })
  }

  const sendMessageToPeer = async (peerAddress: string, content: string) => {
    const conversation = await getConversation(peerAddress)
    const key = peerAddress.toLowerCase()

    // Add optimistic message
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
      await sendMessage(conversation, content)

      // Update cache with last message
      const cached = conversationCache.get(key)
      if (cached) {
        cached.lastMessage = content
        cached.lastMessageTime = new Date()
      }

      // Update conversations list with new/updated conversation
      setConversations((prev) => {
        const existing = prev.find((c) => c.peerAddress.toLowerCase() === key)
        const now = new Date()

        if (existing) {
          // Update existing conversation and move to top
          const updated = prev.map((c) =>
            c.peerAddress.toLowerCase() === key
              ? { ...c, lastMessage: content, timestamp: now }
              : c
          )
          // Sort by timestamp (most recent first)
          return updated.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0
            if (!a.timestamp) return 1
            if (!b.timestamp) return -1
            return b.timestamp.getTime() - a.timestamp.getTime()
          })
        } else {
          // Add new conversation at top
          const newChat: ChatListItem = {
            id: conversation.id,
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

      // Add error message
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

  const subscribeToMessages = (
    peerAddress: string,
    callback: (messages: XMTPMessage[]) => void
  ): (() => void) => {
    const key = peerAddress.toLowerCase()

    // Load initial messages
    ;(async () => {
      try {
        const conversation = await getConversation(peerAddress)
        const myId = inboxId()
        if (!myId) return

        // Load existing messages
        const xmtpMsgs = await loadMessages(conversation, {
          direction: SortDirection.Ascending,
          kind: GroupMessageKind.Application,
        })

        const localMsgs = xmtpMsgs
          .map((m) => xmtpToLocalMessage(m, myId))
          .filter((m): m is XMTPMessage => m !== null)

        setMessagesMap((prev) => ({ ...prev, [key]: localMsgs }))
        callback(localMsgs)

        // Start streaming
        const cleanup = await streamMessages(
          conversation,
          (newMsg) => {
            upsertMessage(peerAddress, newMsg)
            callback(getMessagesForPeer(peerAddress))
          },
          (error) => {
            console.error('[XMTPProvider] Stream error for', peerAddress, error)
          }
        )

        // Store cleanup
        streamCleanups.set(key, cleanup)
      } catch (error) {
        console.error('[XMTPProvider] Failed to subscribe to messages:', error)
      }
    })()

    // Return unsubscribe function
    return () => {
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
