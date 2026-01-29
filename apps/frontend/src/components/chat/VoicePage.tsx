/**
 * VoicePage - Voice call interface
 *
 * Shows the AI avatar with animated states for:
 * - Idle: waiting to start
 * - Connecting: establishing connection
 * - Connected: in a call with speaking/listening indicators
 */

import { Show, type Component } from 'solid-js'
import { Avatar, Button, IconButton } from '@heaven/ui'
import type { VoiceState } from '../../lib/voice'

const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' ')

export interface VoicePageProps {
  state: VoiceState
  isMuted: boolean
  duration: number
  isBotSpeaking?: boolean
  name: string
  avatarUrl?: string
  onToggleMute?: () => void
  onEndCall?: () => void
  onStartCall?: () => void
  onBack?: () => void
  class?: string
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const VoiceDots: Component<{ state: VoiceState; isSpeaking?: boolean }> = (props) => {
  return (
    <div class="flex items-center justify-center gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          class={cn(
            'w-3 h-3 rounded-full bg-primary transition-all duration-300',
            props.state === 'idle' && 'opacity-30',
            props.state === 'connecting' && 'animate-voice-connecting',
            props.state === 'connected' && !props.isSpeaking && 'animate-voice-idle',
            props.state === 'connected' && props.isSpeaking && 'animate-voice-speaking',
            props.state === 'error' && 'bg-destructive opacity-50'
          )}
          style={{ 'animation-delay': `${i * 0.1}s` }}
        />
      ))}
    </div>
  )
}

const getStatusText = (state: VoiceState, isSpeaking?: boolean): string => {
  switch (state) {
    case 'idle':
      return 'Tap to start call'
    case 'connecting':
      return 'Connecting...'
    case 'connected':
      return isSpeaking ? 'Speaking...' : 'Listening'
    case 'error':
      return 'Connection failed'
  }
}

export const VoicePage: Component<VoicePageProps> = (props) => {
  return (
    <div class={cn('flex flex-col h-full bg-background', props.class)}>
      {/* Header */}
      <header class="flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <IconButton variant="ghost" onClick={props.onBack} aria-label="Go back">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <div class="flex-1" />
        <Show when={props.state === 'connected'}>
          <span class="text-base text-[var(--text-muted)] font-mono">
            {formatDuration(props.duration)}
          </span>
        </Show>
      </header>

      {/* Avatar + Status */}
      <div class="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <div class="relative">
          <Show when={props.state === 'connected'}>
            <div
              class={cn(
                'absolute inset-0 rounded-full bg-primary/20',
                props.isBotSpeaking && 'animate-voice-pulse'
              )}
              style={{ transform: 'scale(1.3)' }}
            />
          </Show>
          <Avatar size="2xl" class="relative z-10" />
        </div>

        <div class="text-center">
          <h1 class="text-2xl font-semibold text-[var(--text-primary)]">{props.name}</h1>
          <p class="text-[var(--text-secondary)] mt-1">
            {getStatusText(props.state, props.isBotSpeaking)}
          </p>
        </div>

        <VoiceDots state={props.state} isSpeaking={props.isBotSpeaking} />
      </div>

      {/* Call Controls */}
      <div class="flex-shrink-0 px-6 pb-8 pt-4">
        <Show when={props.state === 'idle' || props.state === 'error'}>
          <div class="flex justify-center">
            <Button onClick={props.onStartCall} size="lg">
              Start Call
            </Button>
          </div>
        </Show>

        <Show when={props.state === 'connecting'}>
          <div class="flex justify-center">
            <Button onClick={props.onEndCall} variant="destructive" size="lg">
              Cancel
            </Button>
          </div>
        </Show>

        <Show when={props.state === 'connected'}>
          <div class="flex items-center justify-center gap-8">
            <Button
              onClick={props.onToggleMute}
              variant={props.isMuted ? 'destructive' : 'secondary'}
            >
              {props.isMuted ? 'Unmute' : 'Mute'}
            </Button>

            <Button onClick={props.onEndCall} variant="destructive">
              End Call
            </Button>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default VoicePage
