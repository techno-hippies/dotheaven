import { createSignal, createEffect, onMount, onCleanup, Show, type Component } from 'solid-js'
import { cn } from '@heaven/ui'
import type { VideoPlayerProps } from './types'

/**
 * VideoPlayer - Simple video player with play/pause and mute controls
 * Handles browser autoplay policy compliance
 */
export const VideoPlayer: Component<VideoPlayerProps> = (props) => {
  let videoRef: HTMLVideoElement | undefined

  const [isLoaded, setIsLoaded] = createSignal(false)
  const [hasStartedPlaying, setHasStartedPlaying] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)

  // Handle play/pause toggle - play directly in click handler for browser autoplay policy
  const handlePlayPause = () => {
    if (!videoRef || !props.videoUrl) return

    // Play/pause directly in click handler for browser autoplay policy compliance
    if (videoRef.paused) {
      videoRef.play().catch((e) => {
        if (e.name === 'NotAllowedError') {
          props.onPlayFailed?.()
        }
      })
    } else {
      videoRef.pause()
    }

    props.onTogglePlay()
  }

  // Load video when URL changes
  createEffect(() => {
    const url = props.videoUrl
    if (!url || !videoRef) return

    setIsLoading(true)
    setError(null)
    videoRef.src = url
    videoRef.load()
  })

  // Setup video element and event listeners
  onMount(() => {
    if (!videoRef) return

    const handleLoadedMetadata = () => {
      setIsLoaded(true)
      setIsLoading(false)
    }

    const handleError = () => {
      if (videoRef?.error) {
        const errorMsg = `Code ${videoRef.error.code}: ${videoRef.error.message || 'Unknown error'}`
        setError(errorMsg)
        setIsLoading(false)
      }
    }

    const handlePlaying = () => {
      setHasStartedPlaying(true)
    }

    const handleTimeUpdate = () => {
      props.onTimeUpdate?.(videoRef!.currentTime)
    }

    videoRef.addEventListener('loadedmetadata', handleLoadedMetadata)
    videoRef.addEventListener('error', handleError)
    videoRef.addEventListener('playing', handlePlaying)
    videoRef.addEventListener('timeupdate', handleTimeUpdate)

    onCleanup(() => {
      videoRef?.removeEventListener('loadedmetadata', handleLoadedMetadata)
      videoRef?.removeEventListener('error', handleError)
      videoRef?.removeEventListener('playing', handlePlaying)
      videoRef?.removeEventListener('timeupdate', handleTimeUpdate)
    })
  })

  // Sync isPlaying prop with video element
  createEffect(() => {
    if (!videoRef || !isLoaded()) return

    if (props.isPlaying && videoRef.paused) {
      videoRef.play().catch((e) => {
        if (e.name === 'NotAllowedError') {
          props.onPlayFailed?.()
        }
      })
    } else if (!props.isPlaying && !videoRef.paused) {
      videoRef.pause()
    }
  })

  // Sync isMuted prop with video element
  createEffect(() => {
    if (!videoRef) return
    videoRef.muted = props.isMuted
  })

  const showThumbnail = () => !!props.thumbnailUrl
  const showVideo = () => !!props.videoUrl
  // Show play button when paused (either before first play, or after user pauses)
  const showPlayButton = () => !props.isPlaying
  const showSpinner = () => isLoading() && (props.isPlaying || hasStartedPlaying()) && !showThumbnail()

  return (
    <div class={cn('relative w-full h-full bg-black', props.class)}>
      {/* Thumbnail */}
      <Show when={showThumbnail()}>
        <img
          src={props.thumbnailUrl}
          alt="Video thumbnail"
          class="absolute inset-0 w-full h-full object-cover z-10"
          loading={props.priorityLoad ? 'eager' : 'lazy'}
        />
      </Show>

      {/* Video element */}
      <Show when={showVideo()}>
        <video
          ref={videoRef}
          class={cn(
            'absolute inset-0 w-full h-full object-cover cursor-pointer',
            hasStartedPlaying() ? 'z-20' : 'z-0'
          )}
          style={{ 'background-color': 'black' }}
          loop
          playsinline
          preload={props.priorityLoad ? 'auto' : 'metadata'}
          muted={props.isMuted}
          onClick={(e) => {
            e.stopPropagation()
            handlePlayPause()
          }}
        />
      </Show>

      {/* Fallback for no media */}
      <Show when={!props.videoUrl && !props.thumbnailUrl}>
        <div class="absolute inset-0 w-full h-full bg-[var(--bg-elevated)] flex items-center justify-center z-0">
          <span class="text-[var(--text-muted)]">No media</span>
        </div>
      </Show>

      {/* Error state */}
      <Show when={error()}>
        <div class="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
          <div class="text-red-500 text-center p-4">
            <p class="font-semibold">Playback Error</p>
            <p class="text-sm mt-2">{error()}</p>
          </div>
        </div>
      </Show>

      {/* Loading Spinner */}
      <Show when={showSpinner()}>
        <div class="absolute inset-0 flex items-center justify-center z-30">
          <div class="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </Show>

      {/* Play/Pause Overlay */}
      <Show when={showPlayButton()}>
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 cursor-pointer transition-colors group z-30"
          onClick={(e) => {
            e.stopPropagation()
            handlePlayPause()
          }}
        >
          <div class="w-20 h-20 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:bg-black/50 transition-colors">
            <svg class="w-10 h-10 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </Show>
    </div>
  )
}
