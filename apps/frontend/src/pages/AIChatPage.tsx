/**
 * AIChatPage - Chat page for AI personalities
 *
 * Features:
 * - Text chat with AI via Cloudflare Worker
 * - Voice call integrated in chat header (shows duration when active)
 * - Message history stored locally
 */

const IS_DEV = import.meta.env.DEV

import { Component, createSignal, createMemo, For, createEffect, Show, onCleanup } from 'solid-js'
import { useParams, useSearchParams, useNavigate } from '@solidjs/router'
import {
  IconButton,
  MessageBubble,
  MessageList,
  MessageInput,
  Avatar,
  useIsMobile,
} from '@heaven/ui'
import { CHAT } from '@heaven/core'
import { useAuth } from '../providers'
import { useVoice, type VoiceState } from '../lib/voice'
import { getWorkerToken } from '../lib/worker-auth'

// Cloudflare Worker URL (Heaven voice worker)
const CHAT_WORKER_URL =
  import.meta.env.VITE_CHAT_WORKER_URL || 'https://neodate-voice.deletion-backup782.workers.dev'

// AI Personalities
const AI_PERSONALITIES: Record<string, { id: string; name: string; avatarUrl: string }> = {
  scarlett: {
    id: 'scarlett',
    name: 'Scarlett',
    avatarUrl: '/scarlett-avatar.png',
  },
}

// =============================================================================
// Message Types
// =============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// =============================================================================
// Icons
// =============================================================================

const PhoneIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06l0-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46Z" />
  </svg>
)

const MicIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.6V240a8,8,0,0,1-16,0V207.6A80.11,80.11,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.11,80.11,0,0,1,136,207.6Z" />
  </svg>
)

const MicOffIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M213.92,210.62l-160-176A8,8,0,1,0,42.08,45.38L80,87.09V128a48,48,0,0,0,73.91,40.4l10.88,12A64,64,0,0,1,64,128a8,8,0,0,0-16,0,80.11,80.11,0,0,0,72,79.6V240a8,8,0,0,0,16,0V207.6a79.84,79.84,0,0,0,39.63-15.31l26.45,29.09a8,8,0,1,0,11.84-10.76ZM128,160a32,32,0,0,1-32-32V104.69l46.92,51.62A32,32,0,0,1,128,160Zm32-32a8,8,0,0,1-1.59,4.78,8,8,0,0,1-11.48,1.64,8,8,0,0,1-1.64-11.48A8,8,0,0,1,160,128Zm8,0a8,8,0,0,0,16,0,64.07,64.07,0,0,0-56-63.49V40a8,8,0,0,0-16,0V64.51a64.33,64.33,0,0,0-22.19,6.57,8,8,0,0,0,7.88,13.92A48.2,48.2,0,0,1,128,80a48.05,48.05,0,0,1,48,48Z" />
  </svg>
)

const EndCallIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M231.59,90.13C175.44,34,80.56,34,24.41,90.13c-13,13-20.41,34.15-20.41,58.14,0,20.57,7.71,38.93,21.74,51.74a8,8,0,0,0,5.54,2.23,8,8,0,0,0,5.53-2.23L80,156.83a8,8,0,0,0,0-11.31A120.23,120.23,0,0,1,63,123.05a8,8,0,0,0,4-6.91V88.86a135.75,135.75,0,0,1,122,0v27.28a8,8,0,0,0,4,6.91,120.23,120.23,0,0,1-17,22.47,8,8,0,0,0,0,11.31l43.17,43.18a8,8,0,0,0,5.53,2.23,8,8,0,0,0,5.54-2.23c14-12.81,21.74-31.17,21.74-51.74C252,124.28,244.59,103.13,231.59,90.13Z" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
  </svg>
)

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// =============================================================================
// Component
// =============================================================================

export const AIChatPage: Component = () => {
  const params = useParams<{ personality: string }>()
  const [searchParams, setSearchParams] = useSearchParams<{ call?: string }>()
  const auth = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // Messages state
  const [messages, setMessages] = createSignal<Message[]>([])
  const [isSending, setIsSending] = createSignal(false)

  // Voice call state
  const [isBotSpeaking, setIsBotSpeaking] = createSignal(false)
  const [hasStartedCall, setHasStartedCall] = createSignal(false)

  // Scroll container ref
  let messagesContainer: HTMLDivElement | undefined

  // Get personality info
  const personality = createMemo(() => {
    const id = params.personality
    return AI_PERSONALITIES[id] || null
  })

  // Is voice call active (from URL param)
  const isCallActive = () => searchParams.call === '1'

  // Voice hook setup
  const voice = createMemo(() => {
    const pkpInfo = auth.pkpInfo()
    if (!pkpInfo) return null

    return useVoice({
      pkpInfo: {
        tokenId: pkpInfo.tokenId,
        publicKey: pkpInfo.publicKey,
        ethAddress: pkpInfo.ethAddress,
      },
      signMessage: auth.signMessage,
      onBotSpeaking: () => setIsBotSpeaking(true),
      onBotSilent: () => setIsBotSpeaking(false),
      onError: (error) => {
        console.error('[AIChatPage] Voice error:', error)
      },
    })
  })

  // Voice state accessors
  const voiceState = (): VoiceState => voice()?.state() ?? 'idle'
  const voiceMuted = () => voice()?.isMuted() ?? false
  const voiceDuration = () => voice()?.duration() ?? 0

  // Auto-start call when call param is set
  createEffect(() => {
    if (isCallActive() && voice() && !hasStartedCall() && auth.isAuthenticated()) {
      if (IS_DEV) console.log('[AIChatPage] Starting voice call...')
      setHasStartedCall(true)
      // Delay to let hook initialize
      const timer = window.setTimeout(() => voice()?.startCall(), 100)
      onCleanup(() => clearTimeout(timer))
    }
  })

  // End call when navigating away from call mode
  createEffect(() => {
    if (!isCallActive() && hasStartedCall()) {
      if (IS_DEV) console.log('[AIChatPage] Ending voice call...')
      voice()?.endCall()
      setHasStartedCall(false)
    }
  })

  // Scroll to bottom when messages change
  createEffect(() => {
    messages() // Track dependency
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  })

  // Load messages from localStorage on mount
  createEffect(() => {
    const id = params.personality
    if (id) {
      const stored = localStorage.getItem(`ai-chat-${id}`)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setMessages(
            parsed.map((m: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }))
          )
        } catch (e) {
          console.error('[AIChatPage] Failed to load messages:', e)
        }
      }
    }
  })

  // Save messages to localStorage when they change
  createEffect(() => {
    const id = params.personality
    const msgs = messages()
    if (id && msgs.length > 0) {
      localStorage.setItem(`ai-chat-${id}`, JSON.stringify(msgs))
    }
  })

  // Toggle voice call
  const handleStartCall = () => {
    if (!auth.isAuthenticated()) {
      auth.loginWithPasskey()
      return
    }
    setSearchParams({ call: '1' })
  }

  const handleEndCall = () => {
    voice()?.endCall()
    setSearchParams({ call: undefined })
    setHasStartedCall(false)
  }

  const handleToggleMute = () => {
    voice()?.toggleMute()
  }

  // Send message
  const handleSendMessage = async (content: string) => {
    const pkpInfo = auth.pkpInfo()
    const p = personality()

    if (!pkpInfo || !p) {
      if (!auth.isAuthenticated()) {
        auth.loginWithPasskey()
      }
      return
    }

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsSending(true)

    try {
      // Get auth token
      const token = await getWorkerToken({
        workerUrl: CHAT_WORKER_URL,
        wallet: pkpInfo.ethAddress,
        signMessage: auth.signMessage,
        logPrefix: 'AIChatPage',
      })

      // Build history for context
      const history = messages()
        .slice(-20) // Last 20 messages for context
        .map((m) => ({ role: m.role, content: m.content }))

      // Send to worker
      const response = await fetch(`${CHAT_WORKER_URL}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content,
          history,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error((error as { error?: string }).error || 'Failed to get response')
      }

      const data = (await response.json()) as { message?: string }
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || "Sorry, I couldn't generate a response.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('[AIChatPage] Failed to send message:', error)
      // Add error message
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsSending(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // If personality not found
  const p = personality()
  if (!p) {
    return (
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-secondary)]">AI personality not found</p>
      </div>
    )
  }

  return (
    <div class="h-full flex flex-col">
      {/* Chat header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <div class="flex items-center gap-3">
              {/* Back button on mobile */}
              <Show when={isMobile()}>
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="Back to messages"
                  onClick={() => navigate(CHAT)}
                >
                  <ChevronLeftIcon />
                </IconButton>
              </Show>
              <div class="relative">
                <Avatar size="md" src={p.avatarUrl} alt={p.name} />
                <Show when={isCallActive() && voiceState() === 'connected'}>
                  <div
                    class="absolute inset-0 rounded-full bg-[var(--accent-purple)]/30"
                    classList={{ 'animate-pulse': isBotSpeaking() }}
                  />
                </Show>
              </div>
              <div>
                <h2 class="text-lg font-semibold text-[var(--text-primary)]">{p.name}</h2>
                <Show
                  when={isCallActive()}
                  fallback={<p class="text-base text-[var(--text-muted)]">AI Assistant</p>}
                >
                  <p class="text-base text-[var(--accent-purple)]">
                    {voiceState() === 'connecting' && 'Connecting...'}
                    {voiceState() === 'connected' && formatDuration(voiceDuration())}
                    {voiceState() === 'error' && 'Connection failed'}
                    {voiceState() === 'idle' && 'Starting call...'}
                  </p>
                </Show>
              </div>
            </div>

            {/* Call controls */}
            <Show
              when={isCallActive()}
              fallback={
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="Start voice call"
                  onClick={handleStartCall}
                >
                  <PhoneIcon />
                </IconButton>
              }
            >
              <div class="flex items-center gap-2">
                <Show when={voiceState() === 'connected'}>
                  <IconButton
                    variant={voiceMuted() ? 'soft' : 'ghost'}
                    size="md"
                    aria-label={voiceMuted() ? 'Unmute' : 'Mute'}
                    onClick={handleToggleMute}
                    class={voiceMuted() ? 'text-[var(--accent-coral)]' : ''}
                  >
                    <Show when={voiceMuted()} fallback={<MicIcon />}>
                      <MicOffIcon />
                    </Show>
                  </IconButton>
                </Show>
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="End call"
                  onClick={handleEndCall}
                  class="bg-[var(--accent-coral)]/20 text-[var(--accent-coral)] hover:bg-[var(--accent-coral)]/30"
                >
                  <EndCallIcon />
                </IconButton>
              </div>
            </Show>
          </div>

          {/* Messages */}
          <div ref={messagesContainer} class="flex-1 overflow-y-auto">
            <MessageList>
              <Show when={messages().length === 0}>
                <MessageBubble
                  message={`Hey, I'm ${p.name}. I will match you with other users who like your music and meet your preferences to make new friends or date!\n\nThen one of you can book a karaoke room and sing with each other. A great way to break the ice and make new friends in the metaverse.`}
                  username={p.name}
                  avatarUrl={p.avatarUrl}
                  isOwn={false}
                  isFirstInGroup={true}
                />
              </Show>
              <For each={messages()}>
                {(message, index) => {
                  const isOwn = message.role === 'user'
                  const prev = messages()[index() - 1]
                  const isFirstInGroup = !prev || prev.role !== message.role

                  return (
                    <MessageBubble
                      message={message.content}
                      username={isFirstInGroup ? (isOwn ? 'You' : p.name) : undefined}
                      avatarUrl={isFirstInGroup && !isOwn ? p.avatarUrl : undefined}
                      timestamp={isFirstInGroup ? formatTime(message.timestamp) : undefined}
                      isOwn={isOwn}
                      isFirstInGroup={isFirstInGroup}
                    />
                  )
                }}
              </For>
            </MessageList>
          </div>

          {/* Input */}
      <MessageInput
        placeholder={`Message ${p.name}...`}
        onSubmit={handleSendMessage}
        disabled={isSending()}
      />
    </div>
  )
}
