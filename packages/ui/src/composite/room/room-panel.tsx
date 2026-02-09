import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { IconButton } from '../../primitives/icon-button'
import { EmojiReactionPicker } from '../../primitives/emoji-reaction-picker'
import { AlbumCover } from '../media/album-cover'
import { RoomParticipants, type RoomParticipant } from './room-participants'
import { Gear, X, MicrophoneIcon, MusicNote, HandWaving } from '../../icons'

// ── Lyric line ──────────────────────────────────────────────────────

export interface LyricLine {
  text: string
  /** 'past' | 'current' | 'upcoming' */
  state: 'past' | 'current' | 'upcoming'
  /** Translation text for the current line */
  translation?: string
}

// ── Now Playing info ────────────────────────────────────────────────

export interface NowPlayingSong {
  title: string
  artist: string
  coverUrl?: string
  elapsed?: string
}

// ── Room Panel Props ────────────────────────────────────────────────

export interface RoomPanelProps {
  /** compact = mobile, full = desktop main area */
  size?: 'compact' | 'full'
  /** 'host' shows settings + song picker + mic. 'viewer' shows react + request stage. */
  role?: 'host' | 'viewer'
  /** Duration string shown in header for host (e.g. "12:34") */
  duration?: string
  /** Current song info */
  song?: NowPlayingSong
  /** Lyric lines to display */
  lyrics?: LyricLine[]
  /** Room participants */
  participants?: RoomParticipant[]
  /** Is mic muted (host/on-stage only) */
  isMuted?: boolean
  onSettingsClick?: () => void
  onClose?: () => void
  onSongPickerClick?: () => void
  onMicToggle?: () => void
  onParticipantClick?: (id: string) => void
  /** Viewer: emoji reaction */
  onReact?: (emoji: string) => void
  /** Viewer: request to join stage */
  onRequestStage?: () => void
  class?: string
}

export const RoomPanel: Component<RoomPanelProps> = (props) => {
  const size = () => props.size ?? 'compact'
  const isCompact = () => size() === 'compact'
  const role = () => props.role ?? 'host'
  const isHost = () => role() === 'host'

  return (
    <div class={cn('flex flex-col h-full bg-[var(--bg-page)]', props.class)}>
      {/* Header */}
      <div class={cn('flex items-center h-14 px-5 border-b border-[var(--border-subtle)]', isHost() ? 'justify-between' : 'justify-end')}>
        <Show when={isHost()}>
          <span class="text-base text-[var(--text-muted)]">
            {props.duration ?? '0:00'}
          </span>
        </Show>
        <div class="flex items-center gap-2">
          <Show when={isHost()}>
            <IconButton variant="soft" size="md" aria-label="Room settings" onClick={() => props.onSettingsClick?.()}>
              <Gear class="w-5 h-5" />
            </IconButton>
          </Show>
          <IconButton variant="soft" size="md" aria-label="Leave room" onClick={() => props.onClose?.()}>
            <X class="w-5 h-5" />
          </IconButton>
        </div>
      </div>

      {/* Now Playing bar */}
      <Show when={props.song}>
        {(song) => (
          <div class="flex items-center gap-3 px-5 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
            <AlbumCover src={song().coverUrl} size="sm" />
            <div class="flex-1 min-w-0">
              <p class="text-base font-semibold text-[var(--text-primary)] truncate">{song().title}</p>
              <p class="text-base text-[var(--text-muted)] truncate">{song().artist}</p>
            </div>
            <Show when={song().elapsed}>
              <span class="text-base text-[var(--text-muted)] flex-shrink-0">{song().elapsed}</span>
            </Show>
          </div>
        )}
      </Show>

      {/* Lyrics area */}
      <div class={cn(
        'flex-1 flex flex-col items-center justify-center gap-5 overflow-hidden',
        isCompact() ? 'px-6 py-8' : 'px-20 py-10',
      )}>
        <Show when={props.lyrics && props.lyrics.length > 0} fallback={
          <p class="text-base text-[var(--text-muted)]">Waiting for song...</p>
        }>
          <For each={props.lyrics}>
            {(line) => {
              const isCurrent = line.state === 'current'
              return (
                <div class="w-full flex flex-col items-center" style={{ gap: isCurrent && line.translation ? '4px' : '0' }}>
                  <p
                    class={cn(
                      'text-center w-full',
                      isCurrent
                        ? cn('font-bold text-[var(--text-primary)]', isCompact() ? 'text-3xl' : 'text-4xl')
                        : cn('text-[var(--text-muted)]', isCompact() ? 'text-lg' : 'text-xl'),
                    )}
                    style={{
                      opacity: isCurrent ? 1 : line.state === 'past' ? 0.35 : 0.5,
                    }}
                  >
                    {line.text}
                  </p>
                  <Show when={isCurrent && line.translation}>
                    <p class={cn(
                      'text-center w-full text-[var(--text-secondary)]',
                      isCompact() ? 'text-sm' : 'text-base',
                    )}>
                      {line.translation}
                    </p>
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </div>

      {/* Bottom section */}
      <div class="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {/* Participants */}
        <Show when={props.participants && props.participants.length > 0}>
          <RoomParticipants
            participants={props.participants!}
            onParticipantClick={props.onParticipantClick}
            class="py-3 px-5"
          />
        </Show>

        {/* Controls */}
        <Show when={isHost()} fallback={
          /* Viewer controls: react (popover) + request stage */
          <div class="flex items-center justify-center gap-8 px-10 pt-2 pb-5">
            <EmojiReactionPicker
              onReact={props.onReact}
            />
            <IconButton
              variant="soft"
              size="xl"
              aria-label="Request stage"
              onClick={() => props.onRequestStage?.()}
            >
              <HandWaving class="w-6 h-6" />
            </IconButton>
          </div>
        }>
          {/* Host controls: song picker + mic */}
          <div class="flex items-center justify-center gap-8 px-10 pt-2 pb-5">
            <IconButton
              variant="soft"
              size="xl"
              aria-label="Pick a song"
              onClick={() => props.onSongPickerClick?.()}
            >
              <MusicNote class="w-6 h-6" />
            </IconButton>
            <IconButton
              variant="soft"
              size="xl"
              aria-label={props.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              onClick={() => props.onMicToggle?.()}
              class={props.isMuted ? 'text-[var(--text-muted)]' : ''}
            >
              <MicrophoneIcon class="w-6 h-6" />
            </IconButton>
          </div>
        </Show>
      </div>
    </div>
  )
}
