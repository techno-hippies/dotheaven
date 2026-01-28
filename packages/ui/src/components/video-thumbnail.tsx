import type { Component } from 'solid-js'
import { cn } from '../lib/utils'

export interface VideoThumbnailProps {
  class?: string
  thumbnailUrl: string
  viewCount: string
  onClick?: () => void
}

/**
 * VideoThumbnail - Individual video thumbnail card for grids
 *
 * Features:
 * - 9:16 aspect ratio thumbnail
 * - Play icon overlay (bottom-left)
 * - View count display
 * - Hover state with scale effect
 */
export const VideoThumbnail: Component<VideoThumbnailProps> = (props) => {
  return (
    <button
      onClick={() => props.onClick?.()}
      class={cn(
        'group relative w-full rounded-lg overflow-hidden bg-[var(--bg-elevated)]',
        'transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]',
        'cursor-pointer',
        props.class
      )}
    >
      {/* 9:16 aspect ratio container */}
      <div class="relative w-full" style={{ 'aspect-ratio': '9/16' }}>
        {/* Thumbnail image */}
        <img
          src={props.thumbnailUrl}
          alt="Video thumbnail"
          class="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradient overlay for better text visibility */}
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Play icon and view count - bottom left */}
        <div class="absolute bottom-2 left-2 flex items-center gap-1.5 text-white drop-shadow-lg">
          {/* Play icon */}
          <svg
            class="w-4 h-4 fill-current"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 5v14l11-7z" />
          </svg>

          {/* View count */}
          <span class="text-sm font-semibold">
            {props.viewCount}
          </span>
        </div>
      </div>
    </button>
  )
}
