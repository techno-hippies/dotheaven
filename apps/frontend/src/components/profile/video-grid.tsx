import { For, type Component } from 'solid-js'
import { cn } from '@heaven/ui'
import { VideoThumbnail } from './video-thumbnail'

export interface VideoGridItem {
  id: string
  thumbnailUrl: string
  viewCount: string
}

export interface VideoGridProps {
  class?: string
  videos: VideoGridItem[]
  onVideoClick?: (videoId: string) => void
}

/**
 * VideoGrid - Responsive grid of video thumbnails
 *
 * Features:
 * - Responsive grid (5 cols on desktop, 3 on tablet, 2 on mobile)
 * - Uses VideoThumbnail component for each item
 * - Click handler passes video ID
 */
export const VideoGrid: Component<VideoGridProps> = (props) => {
  return (
    <div
      class={cn(
        'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3',
        props.class
      )}
    >
      <For each={props.videos}>
        {(video) => (
          <VideoThumbnail
            thumbnailUrl={video.thumbnailUrl}
            viewCount={video.viewCount}
            onClick={() => props.onVideoClick?.(video.id)}
          />
        )}
      </For>
    </div>
  )
}
