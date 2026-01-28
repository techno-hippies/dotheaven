import { createContext, useContext, createSignal, type ParentComponent, type Accessor } from 'solid-js'

interface VideoPlaybackContextType {
  currentlyPlayingId: Accessor<string | null>
  setCurrentlyPlayingId: (id: string | null) => void
  hasUserInteracted: Accessor<boolean>
  setUserInteracted: () => void
}

const VideoPlaybackContext = createContext<VideoPlaybackContextType>()

export const VideoPlaybackProvider: ParentComponent = (props) => {
  const [currentlyPlayingId, setCurrentlyPlayingId] = createSignal<string | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = createSignal(false)

  const setUserInteracted = () => {
    if (!hasUserInteracted()) {
      setHasUserInteracted(true)
    }
  }

  return (
    <VideoPlaybackContext.Provider
      value={{
        currentlyPlayingId,
        setCurrentlyPlayingId,
        hasUserInteracted,
        setUserInteracted,
      }}
    >
      {props.children}
    </VideoPlaybackContext.Provider>
  )
}

export function useVideoPlaybackContext() {
  const context = useContext(VideoPlaybackContext)
  if (!context) {
    throw new Error('useVideoPlaybackContext must be used within VideoPlaybackProvider')
  }
  return context
}
