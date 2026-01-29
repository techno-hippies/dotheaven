import { type Component, createSignal, onCleanup, Show, onMount } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
  MediaHeader,
  TrackList,
  IconButton,
  PlayButton,
} from '@heaven/ui'
import { usePlatform } from 'virtual:heaven-platform'
import { AppSidebar, HeaderActions } from '../components/shell'
import {
  pickFolder,
  scanFolder,
  saveState,
  loadState,
  type LocalTrack,
} from '../lib/local-music'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const LibraryPage: Component = () => {
  const platform = usePlatform()

  const [tracks, setTracks] = createSignal<LocalTrack[]>([])
  const [folderPath, setFolderPath] = createSignal<string | null>(null)
  const [scanning, setScanning] = createSignal(false)

  // Playback state
  const [currentIndex, setCurrentIndex] = createSignal(-1)
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(75)

  let audio: HTMLAudioElement | undefined

  const currentTrack = () => {
    const idx = currentIndex()
    const t = tracks()
    return idx >= 0 && idx < t.length ? t[idx] : null
  }

  // Load persisted state on mount
  onMount(() => {
    const saved = loadState()
    if (saved) {
      setFolderPath(saved.folderPath)
      setTracks(saved.tracks as LocalTrack[])
    }
  })

  // Audio element setup
  onMount(() => {
    audio = new Audio()
    audio.volume = volume() / 100

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio!.currentTime)
    })
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio!.duration)
    })
    audio.addEventListener('ended', () => {
      playNext()
    })
  })

  onCleanup(() => {
    if (audio) {
      audio.pause()
      audio.src = ''
    }
  })

  async function handlePickFolder() {
    const path = await pickFolder()
    if (!path) return
    setFolderPath(path)
    await rescan(path)
  }

  async function rescan(path?: string) {
    const folder = path || folderPath()
    if (!folder) return
    setScanning(true)
    try {
      const scanned = await scanFolder(folder)
      setTracks(scanned)
      saveState({ folderPath: folder, tracks: scanned })
    } finally {
      setScanning(false)
    }
  }

  function playTrack(index: number) {
    const t = tracks()
    if (index < 0 || index >= t.length || !audio) return
    setCurrentIndex(index)
    audio.src = t[index].fileUrl
    audio.play()
    setIsPlaying(true)
  }

  function togglePlay() {
    if (!audio) return
    if (audio.paused) {
      if (currentIndex() < 0 && tracks().length > 0) {
        playTrack(0)
      } else {
        audio.play()
        setIsPlaying(true)
      }
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  function playNext() {
    const t = tracks()
    if (t.length === 0) return
    const next = (currentIndex() + 1) % t.length
    playTrack(next)
  }

  function playPrev() {
    const t = tracks()
    if (t.length === 0) return
    // If more than 3 seconds in, restart current track
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const prev = currentIndex() <= 0 ? t.length - 1 : currentIndex() - 1
    playTrack(prev)
  }

  function handleSeek(value: number) {
    if (!audio || !duration()) return
    audio.currentTime = (value / 100) * duration()
  }

  function handleVolumeChange(value: number) {
    setVolume(value)
    if (audio) audio.volume = value / 100
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)

  return (
    <AppShell
      header={
        <Header rightSlot={<HeaderActions />} />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">
              {currentTrack()?.title || 'Nothing playing'}
            </p>
            <p class="text-base text-[var(--text-secondary)]">
              {currentTrack()?.artist || ''}
            </p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title={currentTrack()?.title}
          artist={currentTrack()?.artist}
          currentTime={formatTime(currentTime())}
          duration={formatTime(duration())}
          progress={progress()}
          volume={volume()}
          isPlaying={isPlaying()}
          onPlayPause={togglePlay}
          onNext={playNext}
          onPrev={playPrev}
          onProgressChange={handleSeek}
          onVolumeChange={handleVolumeChange}
        />
      }
    >
      <div class="h-full overflow-y-auto bg-gradient-to-b from-[#4a3a6a] via-[#2a2040] to-[var(--bg-page)] rounded-t-lg">
        <MediaHeader
          type="playlist"
          title="Library"
          creator={folderPath() || 'No folder selected'}
          stats={{
            songCount: tracks().length,
          }}
          actionsSlot={
            <div class="flex items-center gap-4">
              <PlayButton
                variant="primary"
                size="lg"
                onClick={() => {
                  if (tracks().length > 0) playTrack(0)
                }}
                aria-label="Play library"
              />

              {/* Shuffle Button */}
              <IconButton
                variant="soft"
                size="lg"
                onClick={() => {
                  const t = [...tracks()]
                  for (let i = t.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [t[i], t[j]] = [t[j], t[i]]
                  }
                  setTracks(t)
                  if (t.length > 0) playTrack(0)
                }}
                aria-label="Shuffle"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </IconButton>

              {/* Folder Picker (Tauri only) */}
              <Show when={platform.isTauri}>
                <IconButton
                  variant="soft"
                  size="lg"
                  onClick={handlePickFolder}
                  aria-label="Select music folder"
                >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </IconButton>
              </Show>

              {/* Re-sync Button (Tauri only, when folder is set) */}
              <Show when={platform.isTauri && folderPath()}>
                <IconButton
                  variant="soft"
                  size="lg"
                  onClick={() => rescan()}
                  aria-label="Re-sync folder"
                  disabled={scanning()}
                >
                  <svg
                    class={`w-6 h-6 ${scanning() ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </IconButton>
              </Show>
            </div>
          }
        />
        <Show
          when={tracks().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
              <Show
                when={platform.isTauri}
                fallback={<p>Local music playback is available in the desktop app.</p>}
              >
                <p class="text-lg mb-2">No music loaded</p>
                <p>Click the folder icon above to select your music folder.</p>
              </Show>
            </div>
          }
        >
          <TrackList
            tracks={tracks()}
            onTrackClick={(track) => {
              const idx = tracks().findIndex((t) => t.id === track.id)
              if (idx >= 0) playTrack(idx)
            }}
            onTrackPlay={(track) => {
              const idx = tracks().findIndex((t) => t.id === track.id)
              if (idx >= 0) playTrack(idx)
            }}
            menuActions={{
              onAddToQueue: (track) => console.log('Add to queue:', track),
            }}
          />
        </Show>
      </div>
    </AppShell>
  )
}
