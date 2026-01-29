import { createEffect, type Component } from 'solid-js'
import { cn } from '@heaven/ui'
import { VideoPlayer } from './VideoPlayer'
import { VideoActions } from './VideoActions'
import { useVideoPlayback } from './useVideoPlayback'
import type { VideoPostData } from './types'

export interface VideoPostProps extends VideoPostData {
  onLikeClick?: () => void
  onCommentClick?: () => void
  onShareClick?: () => void
  onProfileClick?: () => void
  onTrackClick?: () => void
  autoplay?: boolean
  priorityLoad?: boolean
  class?: string
  /** Called when video has been watched for 3+ seconds */
  onViewed?: (postId: string) => void
}

/**
 * VideoPost - TikTok-style video post component
 * Mobile: Full-screen with overlays
 * Desktop: Centered 9:16 card with actions
 */
export const VideoPost: Component<VideoPostProps> = (props) => {
  // Pass autoplay as getter for reactivity - critical for scroll behavior
  const {
    isPlaying,
    isMuted,
    currentTime,
    setIsMuted,
    handleTogglePlay,
    handlePlayFailed,
    handleTimeUpdate,
  } = useVideoPlayback({
    autoplay: () => props.autoplay ?? true
  })

  // Track view: call onViewed after 3 seconds of watch time
  let hasMarkedViewed = false
  let watchTime = 0
  let lastTime = 0
  let trackedPostId = ''

  createEffect(() => {
    // Reset when post changes
    if (props.id !== trackedPostId) {
      hasMarkedViewed = false
      watchTime = 0
      lastTime = 0
      trackedPostId = props.id
    }
  })

  createEffect(() => {
    if (hasMarkedViewed || !isPlaying() || !props.onViewed) return

    const time = currentTime()
    const delta = time - lastTime

    // Only count small forward progress (normal playback, not seeks)
    if (delta > 0 && delta < 1) {
      watchTime += delta
    }
    lastTime = time

    if (watchTime >= 3) {
      hasMarkedViewed = true
      props.onViewed(props.id)
    }
  })

  return (
    <div class={cn(
      'relative h-full w-full bg-[var(--bg-surface)] rounded-lg snap-start flex items-center justify-center py-4',
      props.class
    )}>
      {/* Video Container - responsive sizing for 9:16 */}
      <div class="relative w-full md:w-auto md:h-full md:aspect-[9/16] md:max-w-[450px] bg-black md:rounded-lg overflow-hidden">
        {/* Video Player */}
        <VideoPlayer
          videoUrl={props.videoUrl}
          thumbnailUrl={props.thumbnailUrl}
          isPlaying={isPlaying()}
          isMuted={isMuted()}
          onTogglePlay={handleTogglePlay}
          onPlayFailed={handlePlayFailed}
          onTimeUpdate={handleTimeUpdate}
          priorityLoad={props.priorityLoad}
        />

      </div>

      {/* Mobile: Actions overlay on right side */}
      <div class="md:hidden absolute right-4 bottom-20 z-40">
        <VideoActions
          username={props.username}
          userAvatar={props.userAvatar}
          onProfileClick={() => props.onProfileClick?.()}
          isLiked={props.isLiked ?? false}
          likeCount={props.likes}
          onLikeClick={() => props.onLikeClick?.()}
          commentCount={props.comments}
          onCommentClick={props.onCommentClick ? () => props.onCommentClick?.() : undefined}
          onShareClick={() => props.onShareClick?.()}
          trackTitle={props.trackTitle}
          trackArtist={props.trackArtist}
          trackCoverUrl={props.trackCoverUrl}
          onTrackClick={() => props.onTrackClick?.()}
          isMuted={isMuted()}
          onToggleMute={() => setIsMuted(!isMuted())}
        />
      </div>

    </div>
  )
}
