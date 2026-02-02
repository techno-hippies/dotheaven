import { Show, type Component } from 'solid-js'
import { cn } from '@heaven/ui'
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
              <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 256 256" fill="currentColor">
                <path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L73.55,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V175.09l42.08,46.29a8,8,0,1,0,11.84-10.76ZM32,96H72v64H32ZM144,207.64,88,164.09V95.89l56,61.6Zm42-63.77a24,24,0,0,0,0-31.72,8,8,0,1,1,12-10.57,40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.59Zm-80.16-76a8,8,0,0,1,1.4-11.23l39.85-31A8,8,0,0,1,160,32v74.83a8,8,0,0,1-16,0V48.36l-26.94,21A8,8,0,0,1,105.84,67.91ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z" />
              </svg>
            }
          >
            <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 256 256" fill="currentColor">
              <path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z" />
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
            viewBox="0 0 256 256"
            fill="currentColor"
          >
            <path d="M240,94c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,220.66,16,164,16,94A62.07,62.07,0,0,1,78,32c20.65,0,38.73,8.88,50,23.89C139.27,40.88,157.35,32,178,32A62.07,62.07,0,0,1,240,94Z" />
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
            <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 256 256" fill="currentColor">
              <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
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
          <svg class="w-7 h-7 md:w-6 md:h-6 text-white" viewBox="0 0 256 256" fill="currentColor">
            <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
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
          <div class="w-12 h-12 rounded-md bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center overflow-hidden">
            <Show
              when={props.trackCoverUrl}
              fallback={
                <svg class="w-6 h-6 text-white" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M210.3,56.34l-80-24A8,8,0,0,0,120,40V148.26A48,48,0,1,0,136,184V98.75l69.7,20.91A8,8,0,0,0,216,112V64A8,8,0,0,0,210.3,56.34ZM88,216a32,32,0,1,1,32-32A32,32,0,0,1,88,216ZM200,101.25l-64-19.2V50.75L200,70Z" />
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
