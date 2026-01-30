import { type Component, createSignal, createMemo, onCleanup, Show, onMount, createEffect, on } from 'solid-js'
import {
  MediaHeader,
  TrackList,
  IconButton,
  PlayButton,
  type SortField,
  type SortState,
} from '@heaven/ui'
import { usePlatform } from 'virtual:heaven-platform'
import {
  pickFolder,
  createPlaybackSource,
  getMimeForPath,
  getExtensionForPath,
  scanFolderNative,
  getTracksNative,
  getTrackCountNative,
  getFolderNative,
  setFolderNative,
  type LocalTrack,
} from '../lib/local-music'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAuth } from '../providers'
import { createScrobbleService, type ScrobbleService } from '../lib/scrobble-service'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseDuration(value?: string | null): number {
  if (!value) return 0
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

export const LibraryPage: Component = () => {
  const platform = usePlatform()
  const auth = useAuth()

  // Scrobble service — tracks play time and submits to chain via Lit Action
  let scrobbleService: ScrobbleService | null = null

  onMount(() => {
    scrobbleService = createScrobbleService(
      () => auth.getAuthContext(),
      () => auth.pkpInfo()?.publicKey ?? null,
    )
    scrobbleService!.start()
  })

  onCleanup(() => {
    scrobbleService?.stop()
  })

  const [tracks, setTracks] = createSignal<LocalTrack[]>([])
  const [folderPath, setFolderPath] = createSignal<string | null>(null)
  const [scanning, setScanning] = createSignal(false)
  const [scanProgress, setScanProgress] = createSignal<{ done: number; total: number } | null>(null)

  // Sort state
  const [sort, setSort] = createSignal<SortState | undefined>(undefined)
  const sortedTracks = createMemo(() => {
    const s = sort()
    const t = tracks()
    if (!s) return t
    return [...t].sort((a, b) => {
      const aVal = ((a as any)[s.field] ?? '') as string
      const bVal = ((b as any)[s.field] ?? '') as string
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true })
      return s.direction === 'asc' ? cmp : -cmp
    })
  })
  const handleSort = (field: SortField) => {
    const current = sort()
    if (current?.field === field) {
      setSort({ field, direction: current.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      setSort({ field, direction: 'asc' })
    }
  }

  // Playback state
  const [currentIndex, setCurrentIndex] = createSignal(-1)
  const [selectedTrackId, setSelectedTrackId] = createSignal<string | null>(null)
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(75)
  const [playbackError, setPlaybackError] = createSignal<string | null>(null)

  // Notify scrobble engine of play/pause changes
  createEffect(on(isPlaying, (playing) => {
    scrobbleService?.onPlaybackChange(playing)
  }))

  let audio: HTMLAudioElement | undefined
  let currentRevoke: (() => void) | undefined
  let currentMode: 'stream' | 'blob' = 'stream'
  let fallbackTried = false
  let playId = 0 // guard against concurrent play calls
  let seekWasPlaying = false
  let lastSeekValue = 0
  let pendingSeek: number | null = null
  const audioDebug = () => localStorage.getItem('heaven:debug-audio') === '1'
  let lastTimeLog = 0
  let lastTime = 0
  let isSeeking = false
  let isScrubbing = false
  const isNative = platform.isTauri
  let unlistenPosition: (() => void) | undefined
  let unlistenEnded: (() => void) | undefined
  let unlistenState: (() => void) | undefined
  let unlistenLoaded: (() => void) | undefined
  let unlistenError: (() => void) | undefined

  const logAudio = (event: string, extra?: Record<string, unknown>) => {
    if (!audioDebug()) return
    const state = audio
      ? {
          time: Number.isFinite(audio.currentTime) ? audio.currentTime.toFixed(2) : audio.currentTime,
          dur: Number.isFinite(audio.duration) ? audio.duration.toFixed(2) : audio.duration,
          paused: audio.paused,
          ready: audio.readyState,
          net: audio.networkState,
          src: audio.currentSrc || audio.src,
        }
      : {}
    console.log('[Audio]', event, { ...state, ...extra })
  }

  const currentTrack = () => {
    const idx = currentIndex()
    const t = tracks()
    return idx >= 0 && idx < t.length ? t[idx] : null
  }

  const currentTrackDuration = () => {
    const track = currentTrack()
    return track ? parseDuration(track.duration) : 0
  }

  // Load persisted folder + tracks from native SQLite on mount
  onMount(async () => {
    if (!isNative) return
    try {
      const folder = await getFolderNative()
      if (!folder) return
      setFolderPath(folder)
      await loadAllTracks(folder)
    } catch (e) {
      console.error('[Library] Failed to load persisted folder:', e)
    }
  })

  // Audio setup
  onMount(() => {
    if (isNative) {
      listen('audio:position', (event) => {
        const payload = event.payload as { position?: number }
        if (typeof payload?.position === 'number') {
          setCurrentTime(payload.position)
          if (audioDebug()) {
            console.log('[Audio] native position', payload.position)
          }
        }
      }).then((unlisten) => {
        unlistenPosition = unlisten
      })
      listen('audio:loaded', (event) => {
        const payload = event.payload as { duration?: number }
        if (audioDebug()) {
          console.log('[Audio] native loaded', payload)
        }
        if (typeof payload?.duration === 'number') {
          setDuration(payload.duration)
        } else {
          const fallback = currentTrackDuration()
          if (fallback > 0) setDuration(fallback)
        }
      }).then((unlisten) => {
        unlistenLoaded = unlisten
      })
      listen('audio:ended', () => {
        if (audioDebug()) {
          console.log('[Audio] native ended')
        }
        playNext()
      }).then((unlisten) => {
        unlistenEnded = unlisten
      })
      listen('audio:state', (event) => {
        const payload = event.payload as { state?: string }
        if (audioDebug()) {
          console.log('[Audio] native state', payload)
        }
        if (payload?.state === 'playing') setIsPlaying(true)
        if (payload?.state === 'paused' || payload?.state === 'stopped') setIsPlaying(false)
      }).then((unlisten) => {
        unlistenState = unlisten
      })
      listen('audio:error', (event) => {
        const payload = event.payload as { message?: string }
        const message = payload?.message || 'Audio playback failed.'
        console.error('[Audio] native error:', message)
        setPlaybackError(message)
        setIsPlaying(false)
      }).then((unlisten) => {
        unlistenError = unlisten
      })
      return
    }

    audio = new Audio()
    audio.volume = volume() / 100

    const onTimeUpdate = () => {
      const current = audio!.currentTime
      setCurrentTime(current)
      if (!isSeeking) {
        const delta = Math.abs(current - lastTime)
        if (delta > 5 && Number.isFinite(lastTime)) {
          console.warn('[Audio] jump', { from: lastTime, to: current, delta })
        }
      }
      lastTime = current
      const now = Date.now()
      if (audioDebug() && now - lastTimeLog > 1500) {
        lastTimeLog = now
        logAudio('timeupdate')
      }
    }
    const onLoaded = () => {
      setDuration(audio!.duration)
      if (pendingSeek !== null) {
        const value = pendingSeek
        pendingSeek = null
        handleSeek(value)
      }
      logAudio('loadedmetadata')
    }
    const onEnded = () => playNext()
    const onError = () => {
      const code = audio?.error?.code
      const src = audio?.currentSrc || audio?.src
      const details = {
        code,
        mode: currentMode,
        src,
        time: audio?.currentTime,
        dur: audio?.duration,
        ready: audio?.readyState,
        net: audio?.networkState,
      }
      if (currentMode === 'stream' && !fallbackTried) {
        // Fallback to blob if asset protocol fails (network/abort) or src unsupported.
        if (
          code === MediaError.MEDIA_ERR_NETWORK ||
          code === MediaError.MEDIA_ERR_ABORTED ||
          code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ) {
          fallbackTried = true
          logAudio('error->fallback', details)
          playTrack(currentIndex(), 'blob', true)
          return
        }
      }
      console.error('Audio playback error:', audio?.error, details)
      logAudio('error', details)
      setIsPlaying(false)
    }
    const onLoadStart = () => logAudio('loadstart')
    const onLoadedData = () => logAudio('loadeddata')
    const onCanPlay = () => logAudio('canplay')
    const onCanPlayThrough = () => logAudio('canplaythrough')
    const onSeeking = () => {
      isSeeking = true
      logAudio('seeking')
    }
    const onSeeked = () => {
      isSeeking = false
      logAudio('seeked')
    }
    const onStalled = () => logAudio('stalled')
    const onWaiting = () => logAudio('waiting')
    const onDurationChange = () => logAudio('durationchange')
    const onProgress = () => logAudio('progress')

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('loadstart', onLoadStart)
    audio.addEventListener('loadeddata', onLoadedData)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('canplaythrough', onCanPlayThrough)
    audio.addEventListener('seeking', onSeeking)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('progress', onProgress)

    onCleanup(() => {
      audio!.removeEventListener('timeupdate', onTimeUpdate)
      audio!.removeEventListener('loadedmetadata', onLoaded)
      audio!.removeEventListener('ended', onEnded)
      audio!.removeEventListener('error', onError)
      audio!.removeEventListener('loadstart', onLoadStart)
      audio!.removeEventListener('loadeddata', onLoadedData)
      audio!.removeEventListener('canplay', onCanPlay)
      audio!.removeEventListener('canplaythrough', onCanPlayThrough)
      audio!.removeEventListener('seeking', onSeeking)
      audio!.removeEventListener('seeked', onSeeked)
      audio!.removeEventListener('stalled', onStalled)
      audio!.removeEventListener('waiting', onWaiting)
      audio!.removeEventListener('durationchange', onDurationChange)
      audio!.removeEventListener('progress', onProgress)
      audio!.pause()
      audio!.src = ''
      currentRevoke?.()
    })
  })

  onCleanup(() => {
    if (isNative) {
      unlistenPosition?.()
      unlistenEnded?.()
      unlistenState?.()
      unlistenLoaded?.()
      unlistenError?.()
      invoke('audio_stop')
    }
  })

  async function handlePickFolder() {
    const path = await pickFolder()
    if (!path) return
    setFolderPath(path)
    await setFolderNative(path)
    await rescan(path)
  }

  async function rescan(path?: string) {
    const folder = path || folderPath()
    if (!folder) return
    setScanning(true)
    setScanProgress(null)

    // Listen for scan progress events
    let unlistenProgress: (() => void) | undefined
    try {
      unlistenProgress = await listen('music://scan-progress', (event) => {
        const payload = event.payload as { done: number; total: number }
        setScanProgress(payload)
      })
    } catch {
      // listen may fail on web
    }

    try {
      await scanFolderNative(folder)
      await loadAllTracks(folder)
    } catch (e) {
      console.error('[Library] Scan failed:', e)
    } finally {
      unlistenProgress?.()
      setScanning(false)
      setScanProgress(null)
    }
  }

  const PAGE_SIZE = 500
  async function loadAllTracks(folder: string) {
    const count = await getTrackCountNative(folder)
    if (count === 0) {
      setTracks([])
      return
    }
    const all: LocalTrack[] = []
    for (let offset = 0; offset < count; offset += PAGE_SIZE) {
      const page = await getTracksNative(folder, PAGE_SIZE, offset)
      all.push(...page)
    }
    setTracks(all)
  }

  async function playTrack(index: number, mode: 'stream' | 'blob' = 'stream', isFallback = false) {
    const t = tracks()
    if (index < 0 || index >= t.length) return
    const thisPlay = ++playId
    if (!isFallback) fallbackTried = false
    setCurrentIndex(index)
    setSelectedTrackId(t[index].id)
    setPlaybackError(null)

    // Notify scrobble engine of new track
    const track = t[index] as LocalTrack
    scrobbleService?.onTrackStart({
      artist: track.artist,
      title: track.title,
      album: track.album || null,
      durationMs: parseDuration(track.duration) * 1000 || null,
      mbid: track.mbid || null,
      ipId: null,
    })
    setCurrentTime(0)
    const fallbackDuration = parseDuration(t[index].duration)
    if (fallbackDuration > 0) setDuration(fallbackDuration)

    if (isNative) {
      try {
        if (audioDebug()) {
          console.log('[Audio] native play', { index, path: t[index].filePath })
        }
        await invoke('audio_play', { path: t[index].filePath, seek: 0 })
        setIsPlaying(true)
      } catch (e) {
        console.error('Failed to play track:', e)
        setPlaybackError('Unable to play this track.')
        setIsPlaying(false)
      }
      return
    }

    if (!audio) return
    const mime = getMimeForPath(t[index].filePath)
    const ext = getExtensionForPath(t[index].filePath)
    const canPlay = audio.canPlayType(mime)
    logAudio('play', { index, mode, mime, ext, canPlay, filePath: t[index].filePath })
    if (!canPlay) {
      setIsPlaying(false)
      setPlaybackError(`Unsupported audio format: ${ext || mime}`)
      return
    }
    // Stop current playback immediately
    audio.pause()
    currentRevoke?.()
    currentRevoke = undefined
    try {
      const source = await createPlaybackSource(t[index].filePath, mode)
      // Another play was triggered while we were loading
      if (thisPlay !== playId) {
        source.revoke?.()
        return
      }
      currentMode = source.mode
      currentRevoke = source.revoke
      audio.src = source.url
      audio.currentTime = 0
      setCurrentTime(0)
      setDuration(0)
      audio.load()
      logAudio('src-set', { mode: source.mode, src: source.url })
      await audio.play()
      setIsPlaying(true)
    } catch (e) {
      if (thisPlay === playId) {
        if (mode === 'stream' && !fallbackTried) {
          fallbackTried = true
          await playTrack(index, 'blob', true)
          return
        }
        console.error('Failed to play track:', e)
        setPlaybackError('Unable to play this track.')
        setIsPlaying(false)
      }
    }
  }

  async function togglePlay() {
    if (isNative) {
      if (isPlaying()) {
        await invoke('audio_pause')
        setIsPlaying(false)
        return
      }
      if (currentIndex() < 0 && tracks().length > 0) {
        await playTrack(0)
        return
      }
      await invoke('audio_resume')
      setIsPlaying(true)
      return
    }

    if (!audio) return
    if (audio.paused) {
      if (currentIndex() < 0 && tracks().length > 0) {
        await playTrack(0)
      } else {
        try {
          await audio.play()
          setIsPlaying(true)
        } catch (e) {
          console.error('Failed to resume:', e)
          setIsPlaying(false)
        }
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
    if (isNative) {
      if (currentTime() > 3) {
        invoke('audio_seek', { position: 0, play: isPlaying() })
        setCurrentTime(0)
        return
      }
    } else if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const prev = currentIndex() <= 0 ? t.length - 1 : currentIndex() - 1
    playTrack(prev)
  }

  function handleSeek(value: number) {
    if (isNative) {
      lastSeekValue = value
      if (isScrubbing) return
      const activeDuration = duration() || currentTrackDuration()
      if (!activeDuration) {
        pendingSeek = value
        return
      }
      const nextPos = (value / 100) * activeDuration
      setCurrentTime(nextPos)
      invoke('audio_seek', { position: nextPos, play: isPlaying() })
      return
    }

    if (!audio) return
    lastSeekValue = value
    if (!duration()) {
      pendingSeek = value
      return
    }
    audio.currentTime = (value / 100) * duration()
  }

  function handleSeekStart() {
    if (isNative) {
      seekWasPlaying = isPlaying()
      isScrubbing = true
      return
    }
    if (!audio) return
    seekWasPlaying = !audio.paused
    audio.pause()
  }

  async function handleSeekEnd() {
    if (isNative) {
      isScrubbing = false
      const activeDuration = duration() || currentTrackDuration()
      if (!activeDuration) {
        pendingSeek = lastSeekValue
      }
      if (activeDuration) {
        const nextPos = (lastSeekValue / 100) * activeDuration
        setCurrentTime(nextPos)
        await invoke('audio_seek', { position: nextPos, play: seekWasPlaying })
      }
      if (seekWasPlaying) {
        setIsPlaying(true)
      } else {
        setIsPlaying(false)
      }
      return
    }

    if (!audio) return
    if (duration()) {
      audio.currentTime = (lastSeekValue / 100) * duration()
    } else {
      pendingSeek = lastSeekValue
    }
    if (seekWasPlaying) {
      try {
        await audio.play()
      } catch {
        // ignore resume errors
      }
    }
  }

  function handleVolumeChange(value: number) {
    setVolume(value)
    if (isNative) {
      invoke('audio_set_volume', { volume: value / 100 })
      return
    }
    if (audio) audio.volume = value / 100
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)

  return (
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
                <Show when={scanning() && scanProgress()}>
                  {(p) => (
                    <span class="text-sm text-[var(--text-muted)] tabular-nums">
                      {p().done === 0
                        ? `Finding files... ${p().total.toLocaleString()}`
                        : `${p().done.toLocaleString()}/${p().total.toLocaleString()}`}
                    </span>
                  )}
                </Show>
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
            tracks={sortedTracks()}
            showDateAdded={false}
            activeTrackId={currentTrack()?.id}
            selectedTrackId={selectedTrackId() || undefined}
            sort={sort()}
            onSort={handleSort}
            onTrackClick={(track) => setSelectedTrackId(track.id)}
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
  )
}
