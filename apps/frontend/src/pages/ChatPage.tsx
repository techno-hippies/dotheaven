/**
 * ChatPage - XMTP peer-to-peer messaging
 *
 * Uses XMTPProvider for real messaging with other wallets.
 */

import { type Component, createSignal, createEffect, For, Show, onCleanup } from 'solid-js'
import {
  Avatar,
  IconButton,
  MessageBubble,
  MessageList,
  MessageInput,
} from '@heaven/ui'
import { useAuth, useXMTP, type XMTPMessage } from '../providers'
import { useParams } from '@solidjs/router'

const MoreIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

export const ChatPage: Component = () => {
  const auth = useAuth()
  const xmtp = useXMTP()
  const params = useParams<{ username: string }>()

  // Messages state
  const [messages, setMessages] = createSignal<XMTPMessage[]>([])
  const [isSending, setIsSending] = createSignal(false)

  // Scroll container ref
  let messagesContainer: HTMLDivElement | undefined

  // Get peer address or conversation ID from URL
  const peerAddressOrId = () => decodeURIComponent(params.username || '')

  // Format address for display
  const formatAddress = (addr: string) => {
    if (!addr) return ''
    if (addr.length <= 12) return addr
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Auto-connect XMTP when authenticated AND authData is available.
  // Skip if authData is null (new signup) — signing would trigger WebAuthn without a user gesture.
  createEffect(() => {
    if (auth.isAuthenticated() && auth.authData() && !xmtp.isConnected() && !xmtp.isConnecting()) {
      xmtp.connect().catch((err) => {
        console.error('[ChatPage] Failed to connect XMTP:', err)
      })
    }
  })

  // Subscribe to messages when component mounts and XMTP is connected
  createEffect(() => {
    const addrOrId = peerAddressOrId()
    if (!addrOrId || !xmtp.isConnected()) return

    const unsubscribe = xmtp.subscribeToMessages(addrOrId, (msgs) => {
      setMessages(msgs)
    })

    onCleanup(unsubscribe)
  })

  // Scroll to bottom when messages change
  createEffect(() => {
    messages() // Track dependency
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  })

  // Send message via XMTP
  const handleSubmit = async (message: string) => {
    const addrOrId = peerAddressOrId()
    if (!addrOrId || !xmtp.isConnected()) return

    setIsSending(true)
    try {
      await xmtp.sendMessage(addrOrId, message)
    } catch (error) {
      console.error('[ChatPage] Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <>
      {/* Not authenticated */}
      <Show when={!auth.isAuthenticated()}>
        <div class="h-full flex flex-col items-center justify-center gap-4">
          <p class="text-[var(--text-secondary)]">Sign in to view messages</p>
        </div>
      </Show>

      {/* Chat content */}
      <Show when={auth.isAuthenticated()}>
        <div class="h-full overflow-y-auto">
          <div class="h-full flex flex-col">
            {/* Chat Header */}
            <div class="h-16 flex items-center justify-between px-6 border-b border-[var(--border-default)] flex-shrink-0">
              <div class="flex items-center gap-3">
                <Avatar size="md" />
                <div>
                  <span class="text-base font-medium text-[var(--text-primary)]">
                    {formatAddress(peerAddressOrId())}
                  </span>
                  <p class="text-sm text-[var(--text-muted)]">
                    <Show when={xmtp.isConnected()} fallback="Connecting...">
                      XMTP
                    </Show>
                  </p>
                </div>
              </div>
              <IconButton variant="ghost" size="md" aria-label="Open menu">
                <MoreIcon />
              </IconButton>
            </div>

            {/* Messages */}
            <div ref={messagesContainer} class="flex-1 overflow-y-auto">
              <Show when={xmtp.isConnecting()}>
                <div class="flex items-center justify-center h-full">
                  <p class="text-[var(--text-muted)]">Connecting to XMTP...</p>
                </div>
              </Show>
              <Show when={xmtp.isConnected()}>
                <MessageList>
                  <Show when={messages().length === 0}>
                    <div class="flex items-center justify-center py-12">
                      <p class="text-[var(--text-muted)]">No messages yet. Start a conversation!</p>
                    </div>
                  </Show>
                  <For each={messages()}>
                    {(msg, index) => {
                      const isOwn = msg.sender === 'user'
                      const prev = messages()[index() - 1]
                      const isFirstInGroup = !prev || prev.sender !== msg.sender

                      return (
                        <MessageBubble
                          message={msg.content}
                          username={isFirstInGroup ? (isOwn ? 'You' : formatAddress(peerAddressOrId())) : undefined}
                          timestamp={isFirstInGroup ? formatTime(msg.timestamp) : undefined}
                          isOwn={isOwn}
                          isFirstInGroup={isFirstInGroup}
                        />
                      )
                    }}
                  </For>
                </MessageList>
              </Show>
            </div>

            {/* Input */}
            <MessageInput
              onSubmit={handleSubmit}
              placeholder={`Message ${formatAddress(peerAddressOrId())}...`}
              disabled={isSending() || !xmtp.isConnected()}
            />
          </div>
        </div>
      </Show>
    </>
  )
}
