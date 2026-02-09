import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'

export interface RoomParticipant {
  id: string
  name: string
  avatarUrl?: string
  isOnStage: boolean
  isSpeaking?: boolean
}

export interface RoomParticipantsProps {
  participants: RoomParticipant[]
  /** Max visible audience avatars before showing +N overflow */
  maxVisibleAudience?: number
  onParticipantClick?: (id: string) => void
  class?: string
}

export const RoomParticipants: Component<RoomParticipantsProps> = (props) => {
  const maxVisible = () => props.maxVisibleAudience ?? 4

  const stage = () => props.participants.filter((p) => p.isOnStage)
  const audience = () => props.participants.filter((p) => !p.isOnStage)
  const visibleAudience = () => audience().slice(0, maxVisible())
  const overflowCount = () => Math.max(0, audience().length - maxVisible())

  return (
    <div class={cn('overflow-x-auto scrollbar-none', props.class)}>
      <div class="flex items-center justify-center gap-3 min-w-max mx-auto w-fit">
        {/* Stage participants — larger with purple ring */}
        <div class="flex items-center gap-2.5">
          <For each={stage()}>
            {(p) => (
              <button
                type="button"
                class="flex-shrink-0 cursor-pointer bg-transparent border-none p-0"
                onClick={() => props.onParticipantClick?.(p.id)}
              >
                <Avatar
                  src={p.avatarUrl}
                  size="lg"
                  alt={p.name}
                  class={cn(
                    'ring-2 ring-offset-2 ring-offset-[var(--bg-page)]',
                    p.isSpeaking
                      ? 'ring-[var(--accent-purple)] animate-pulse'
                      : 'ring-[var(--accent-purple)]/40',
                  )}
                />
              </button>
            )}
          </For>
        </div>

        {/* Divider — only show when both stage and audience exist */}
        <Show when={stage().length > 0 && audience().length > 0}>
          <div class="w-px h-7 bg-[var(--border-subtle)] flex-shrink-0" />
        </Show>

        {/* Audience — smaller, no ring */}
        <Show when={audience().length > 0}>
          <div class="flex items-center gap-2">
            <For each={visibleAudience()}>
              {(p) => (
                <button
                  type="button"
                  class="flex-shrink-0 cursor-pointer bg-transparent border-none p-0"
                  onClick={() => props.onParticipantClick?.(p.id)}
                >
                  <Avatar src={p.avatarUrl} size="md" alt={p.name} />
                </button>
              )}
            </For>
            <Show when={overflowCount() > 0}>
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--bg-highlight)] flex items-center justify-center">
                <span class="text-[13px] font-semibold text-[var(--text-secondary)]">
                  +{overflowCount()}
                </span>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
