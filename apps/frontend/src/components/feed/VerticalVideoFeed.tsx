import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js'
import { VideoPost } from './VideoPost'
import type { VerticalVideoFeedProps } from './types'

/**
 * VerticalVideoFeed - TikTok-style vertical scrolling video feed
 * Features snap scrolling and keyboard navigation
 */
export const VerticalVideoFeed: Component<VerticalVideoFeedProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  const [activeIndex, setActiveIndex] = createSignal(0)

  // Scroll to initial video on mount
  onMount(() => {
    if (props.initialVideoId && containerRef && props.videos.length > 0) {
      const index = props.videos.findIndex(v => v.id === props.initialVideoId)
      if (index >= 0) {
        containerRef.scrollTo({
          top: index * containerRef.clientHeight,
          behavior: 'auto'
        })
        setActiveIndex(index)
      }
    }
  })

  // Handle scroll to update active index
  const handleScroll = () => {
    if (!containerRef) return

    const scrollTop = containerRef.scrollTop
    const viewportHeight = containerRef.clientHeight
    const newIndex = Math.round(scrollTop / viewportHeight)

    if (newIndex !== activeIndex() && newIndex >= 0 && newIndex < props.videos.length) {
      setActiveIndex(newIndex)
    }

    // Load more when approaching the end
    if (props.hasMore && newIndex >= props.videos.length - 2) {
      props.onLoadMore?.()
    }
  }

  // Attach scroll listener
  onMount(() => {
    containerRef?.addEventListener('scroll', handleScroll)
    onCleanup(() => containerRef?.removeEventListener('scroll', handleScroll))
  })

  // Keyboard navigation
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef) return

      if (e.key === 'ArrowDown' && activeIndex() < props.videos.length - 1) {
        e.preventDefault()
        const nextIndex = activeIndex() + 1
        containerRef.scrollTo({
          top: nextIndex * containerRef.clientHeight,
          behavior: 'smooth'
        })
      } else if (e.key === 'ArrowUp' && activeIndex() > 0) {
        e.preventDefault()
        const prevIndex = activeIndex() - 1
        containerRef.scrollTo({
          top: prevIndex * containerRef.clientHeight,
          behavior: 'smooth'
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown))
  })

  return (
    <Show
      when={props.videos.length > 0 || props.isLoading}
      fallback={
        <div class="h-[var(--vh-screen,100vh)] md:h-screen w-full flex items-center justify-center bg-[var(--bg-page)]">
          <div class="text-[var(--text-secondary)] text-lg">No videos</div>
        </div>
      }
    >
      <div
        ref={containerRef}
        class="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ 'scrollbar-width': 'none', '-ms-overflow-style': 'none' }}
      >
        <For each={props.videos}>
          {(video, index) => {
            // Determine if this video should autoplay
            const isActive = () => index() === activeIndex()
            // Priority load for active video and adjacent ones (prev/next)
            const shouldPriorityLoad = () => {
              const current = activeIndex()
              const i = index()
              return i === current || i === current - 1 || i === current + 1
            }

            return (
              <div class="h-full w-full snap-start snap-always">
                <VideoPost
                  id={video.id}
                  videoUrl={video.videoUrl}
                  thumbnailUrl={video.thumbnailUrl}
                  username={video.username}
                  userAvatar={video.userAvatar}
                  caption={video.caption}
                  trackTitle={video.trackTitle}
                  trackArtist={video.trackArtist}
                  trackCoverUrl={video.trackCoverUrl}
                  likes={video.likes}
                  comments={video.comments}
                  shares={video.shares}
                  isLiked={video.isLiked}
                  canInteract={video.canInteract}
                  autoplay={isActive()}
                  priorityLoad={shouldPriorityLoad()}
                  onLikeClick={() => props.onLikeClick?.(video.id)}
                  onCommentClick={props.onCommentClick ? () => props.onCommentClick?.(video.id) : undefined}
                  onShareClick={() => props.onShareClick?.(video.id)}
                  onProfileClick={() => props.onProfileClick?.(video.username)}
                  onTrackClick={() => props.onTrackClick?.(video.id)}
                  onViewed={props.onVideoViewed}
                />
              </div>
            )
          }}
        </For>

        {/* Loading indicator at bottom */}
        <Show when={props.isLoading}>
          <div class="h-20 flex items-center justify-center">
            <div class="w-8 h-8 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        </Show>
      </div>
    </Show>
  )
}
