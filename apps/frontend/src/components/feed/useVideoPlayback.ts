import { createSignal, createEffect, type Accessor } from 'solid-js'
import { useVideoPlaybackContext } from './VideoPlaybackContext'

export interface UseVideoPlaybackOptions {
  /** Reactive getter for autoplay state - use () => props.autoplay */
  autoplay?: Accessor<boolean>
  forceAutoplay?: boolean
}

export interface UseVideoPlaybackReturn {
  isPlaying: Accessor<boolean>
  isMuted: Accessor<boolean>
  currentTime: Accessor<number>
  setIsPlaying: (playing: boolean) => void
  setIsMuted: (muted: boolean) => void
  setCurrentTime: (time: number) => void
  handleTogglePlay: () => void
  handlePlayFailed: () => void
  handleTimeUpdate: (time: number) => void
}

/**
 * useVideoPlayback - Shared video playback state logic for SolidJS
 *
 * IMPORTANT: Pass autoplay as a getter function for reactivity:
 * useVideoPlayback({ autoplay: () => props.autoplay })
 */
export function useVideoPlayback(options: UseVideoPlaybackOptions = {}): UseVideoPlaybackReturn {
  const { autoplay = () => true, forceAutoplay = false } = options
  const { hasUserInteracted, setUserInteracted } = useVideoPlaybackContext()

  const [isPlaying, setIsPlaying] = createSignal(false)
  const [isMuted, setIsMuted] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  // Track if user has manually controlled this video (to prevent effect from overriding)
  const [_userControlled, setUserControlled] = createSignal(false)

  // Sync playing state with autoplay prop - only when autoplay changes, not on user interaction
  // This effect handles: scroll to new video (autoplay changes), initial load
  // It should NOT override user's manual play/pause
  createEffect((prevAutoplay: boolean | undefined) => {
    const shouldAutoplay = autoplay()
    const userInteracted = hasUserInteracted()

    // Only sync when autoplay prop actually changes (scroll to different video)
    // Don't sync just because hasUserInteracted changed
    if (prevAutoplay !== undefined && prevAutoplay === shouldAutoplay) {
      return shouldAutoplay
    }

    // Reset user control when switching videos (autoplay changed)
    if (prevAutoplay !== undefined && prevAutoplay !== shouldAutoplay) {
      setUserControlled(false)
    }

    if ((forceAutoplay || userInteracted) && shouldAutoplay) {
      setIsPlaying(true)
    } else if (!shouldAutoplay) {
      setIsPlaying(false)
    }

    return shouldAutoplay
  }, undefined)

  const handleTogglePlay = () => {
    setUserInteracted()
    setUserControlled(true)

    // If playing but muted, unmute instead of pausing
    if (isPlaying() && isMuted()) {
      setIsMuted(false)
      return
    }

    const newPlayingState = !isPlaying()
    setIsPlaying(newPlayingState)

    // Unmute when starting to play
    if (newPlayingState && isMuted()) {
      setIsMuted(false)
    }
  }

  const handlePlayFailed = () => {
    setIsPlaying(false)
  }

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time)
  }

  return {
    isPlaying,
    isMuted,
    currentTime,
    setIsPlaying,
    setIsMuted,
    setCurrentTime,
    handleTogglePlay,
    handlePlayFailed,
    handleTimeUpdate,
  }
}
