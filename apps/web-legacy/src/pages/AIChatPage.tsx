/**
 * AIChatPage - Chat page for AI personalities
 *
 * Features:
 * - Text chat with AI via Cloudflare Worker
 * - Voice call integrated in chat header (shows duration when active)
 * - Message history stored locally
 */

const IS_DEV = import.meta.env.DEV

import { Component, createSignal, createMemo, For, createEffect, Show } from 'solid-js'
import { useParams, useSearchParams, useNavigate } from '@solidjs/router'
import {
  IconButton,
  MessageBubble,
  MessageList,
  MessageInput,
  Avatar,
  useIsMobile,
} from '@heaven/ui'
import { Phone, MicrophoneIcon, MicrophoneSlash, PhoneDisconnect, ChevronLeft } from '@heaven/ui/icons'
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

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

const stripThinkSections = (input: string): string => {
  const lower = input.toLowerCase()
  let output = ''
  let cursor = 0

  while (true) {
    const start = lower.indexOf(THINK_OPEN_TAG, cursor)
    if (start === -1) {
      output += input.slice(cursor)
      break
    }

    output += input.slice(cursor, start)
    const bodyStart = start + THINK_OPEN_TAG.length
    const end = lower.indexOf(THINK_CLOSE_TAG, bodyStart)
    if (end === -1) {
      break
    }
    cursor = end + THINK_CLOSE_TAG.length
  }

  return output
}

const sanitizeAssistantMessage = (raw: unknown): string => {
  const base = typeof raw === 'string' ? raw : ''
  const stripped = stripThinkSections(base)
  const cleaned = stripped.replace(/<\/?think>/gi, '').trim()
  return cleaned || "Sorry, I couldn't generate a response."
}


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
    const active = isCallActive()
    const v = voice()
    const started = hasStartedCall()
    const authed = auth.isAuthenticated()
    if (active && v && !started && authed) {
      if (IS_DEV) console.log('[AIChatPage] Starting voice call...')
      setHasStartedCall(true)
      // Use queueMicrotask to escape the reactive tracking scope
      queueMicrotask(() => v.startCall())
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
          activityWallet: pkpInfo.ethAddress,
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
        content: sanitizeAssistantMessage(data.message),
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
      {/* Chat header — full-width border, content constrained */}
      <div class="border-b border-[var(--border-subtle)] flex-shrink-0">
      <div class="flex items-center justify-between px-4 h-16 max-w-4xl mx-auto">
            <div class="flex items-center gap-3">
              {/* Back button on mobile */}
              <Show when={isMobile()}>
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="Back to messages"
                  onClick={() => navigate(CHAT)}
                >
                  <ChevronLeft class="w-5 h-5" />
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
                <Show
                  when={isCallActive()}
                  fallback={<span class="text-base font-semibold text-[var(--text-primary)]">{p.name}</span>}
                >
                  <span class="text-base font-semibold text-[var(--text-primary)]">{p.name}</span>
                  <p class="text-sm text-[var(--accent-purple)]">
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
                  <Phone class="w-5 h-5" />
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
                    <Show when={voiceMuted()} fallback={<MicrophoneIcon class="w-5 h-5" />}>
                      <MicrophoneSlash class="w-5 h-5" />
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
                  <PhoneDisconnect class="w-5 h-5" />
                </IconButton>
              </div>
            </Show>
          </div>
      </div>

      {/* Messages + Input — constrained */}
      <div class="flex-1 flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
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

          <MessageInput
            placeholder={`Message ${p.name}...`}
            onSubmit={handleSendMessage}
            disabled={isSending()}
          />
      </div>
    </div>
  )
}
