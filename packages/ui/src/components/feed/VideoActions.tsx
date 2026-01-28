import { Show, type Component } from 'solid-js'
import { cn } from '../../lib/utils'
import type { VideoActionsProps } from './types'

/** Format count with K/M suffix (e.g., 12400 → "12.4K") */
function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }
  return count.toString()
}

/**
 * VideoActions - Vertical action buttons column
 * Profile avatar, mute, like, comment, share, audio source
 */
export const VideoActions: Component<VideoActionsProps> = (props) => {
  return (
    <div class={cn('flex flex-col items-center gap-2 md:gap-5', props.class)}>
      {/* Mute/Unmute Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          props.onToggleMute()
        }}
        class="flex flex-col items-center cursor-pointer"
      >
        <div class="rounded-full p-3 max-md:bg-transparent md:bg-black/30 md:backdrop-blur-sm md:hover:bg-black/40 transition-colors">
          <Show
            when={!props.isMuted}
            fallback={
              <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            }
          >
            <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </Show>
        </div>
      </button>

      {/* Profile Avatar */}
      <div class="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            props.onProfileClick()
          }}
          class="cursor-pointer"
        >
          <Show
            when={props.userAvatar}
            fallback={
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white font-bold text-lg">
                {props.username.charAt(0).toUpperCase()}
              </div>
            }
          >
            <img
              src={props.userAvatar}
              alt={props.username}
              class="w-12 h-12 rounded-full object-cover bg-[var(--bg-elevated)]"
            />
          </Show>
        </button>
      </div>

      {/* Like Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          props.onLikeClick()
        }}
        class="flex flex-col items-center cursor-pointer"
      >
        <div
          class={cn(
            'rounded-full p-3 transition-colors',
            'max-md:bg-transparent',
            props.isLiked
              ? 'md:bg-red-500/15 md:hover:bg-red-500/20'
              : 'md:bg-black/30 md:backdrop-blur-sm md:hover:bg-black/40'
          )}
        >
          <svg
            class={cn(
              'w-7 h-7 md:w-6 md:h-6 transition-colors',
              props.isLiked ? 'text-red-500' : 'text-white'
            )}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
        <Show when={props.likeCount !== undefined}>
          <span class="text-xs font-semibold text-white">{formatCount(props.likeCount!)}</span>
        </Show>
      </button>

      {/* Comment Button */}
      <Show when={props.onCommentClick}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            props.onCommentClick?.()
          }}
          class="flex flex-col items-center cursor-pointer"
        >
          <div class="rounded-full p-3 max-md:bg-transparent md:bg-black/30 md:backdrop-blur-sm md:hover:bg-black/40 transition-colors">
            <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
            </svg>
          </div>
          <Show when={props.commentCount !== undefined}>
            <span class="text-xs font-semibold text-white">{formatCount(props.commentCount!)}</span>
          </Show>
        </button>
      </Show>

      {/* Share Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          props.onShareClick()
        }}
        class="flex flex-col items-center cursor-pointer"
      >
        <div class="rounded-full p-3 max-md:bg-transparent md:bg-black/30 md:backdrop-blur-sm md:hover:bg-black/40 transition-colors">
          <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
          </svg>
        </div>
      </button>

      {/* Track/Audio Source Button */}
      <Show when={props.trackTitle || props.trackArtist}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            props.onTrackClick?.()
          }}
          class="cursor-pointer group"
        >
          <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center overflow-hidden">
            <Show
              when={props.trackCoverUrl}
              fallback={
                <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              }
            >
              <img
                src={props.trackCoverUrl}
                alt={props.trackTitle}
                class="w-full h-full object-cover"
              />
            </Show>
          </div>
        </button>
      </Show>
    </div>
  )
}
