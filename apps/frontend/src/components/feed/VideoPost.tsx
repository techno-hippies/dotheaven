import { Show, createEffect, type Component } from 'solid-js'
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
      'relative h-[var(--vh-screen,100vh)] md:h-screen w-full bg-[var(--bg-page)] snap-start flex items-center justify-center',
      props.class
    )}>
      {/* Video Container - responsive sizing for 9:16 */}
      <div class="relative w-full h-full md:w-[50.625vh] md:h-[90vh] md:max-w-[450px] md:max-h-[800px] bg-black md:rounded-lg overflow-hidden">
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

        {/* Desktop: Video Info Overlay - bottom left (inside video container) */}
        <div class="absolute bottom-4 left-6 right-20 z-20 pointer-events-none max-md:hidden">
          <button
            onClick={() => props.onProfileClick?.()}
            class="text-lg font-semibold text-white drop-shadow-lg hover:underline cursor-pointer pointer-events-auto"
          >
            @{props.username}
          </button>
          <Show when={props.caption}>
            <p class="text-sm text-white/90 mt-1 line-clamp-2">{props.caption}</p>
          </Show>
          <Show when={props.trackTitle}>
            <button
              onClick={() => props.onTrackClick?.()}
              class="block text-sm text-white/70 mt-1 hover:underline cursor-pointer pointer-events-auto"
            >
              {props.trackTitle} {props.trackArtist && `- ${props.trackArtist}`}
            </button>
          </Show>
        </div>
      </div>

      {/* Mobile: Video Info - absolute positioned outside container */}
      <div class="md:hidden absolute left-0 right-0 bottom-4 p-6 pr-20 pointer-events-none z-40">
        <button
          onClick={() => props.onProfileClick?.()}
          class="text-lg font-semibold text-white drop-shadow-lg hover:underline cursor-pointer pointer-events-auto"
        >
          @{props.username}
        </button>
        <Show when={props.caption}>
          <p class="text-sm text-white/90 mt-1 line-clamp-2 drop-shadow-md">{props.caption}</p>
        </Show>
        <Show when={props.trackTitle}>
          <button
            onClick={() => props.onTrackClick?.()}
            class="block text-sm text-white/70 mt-1 hover:underline cursor-pointer pointer-events-auto"
          >
            {props.trackTitle} {props.trackArtist && `- ${props.trackArtist}`}
          </button>
        </Show>
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

      {/* Desktop: Actions column to the right of video */}
      <div class="max-md:hidden absolute left-[calc(50%+25vh+20px)] top-1/2 transform -translate-y-1/2 z-20">
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
