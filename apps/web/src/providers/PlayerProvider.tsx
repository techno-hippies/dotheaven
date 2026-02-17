/**
 * PlayerProvider — owns audio playback state globally so music persists across navigation.
 *
 * Extracted from LibraryPage. The web audio element lives here and survives route changes.
 */

import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  on,
  type ParentComponent,
} from 'solid-js'
import { useAuth } from './AuthContext'

import {
  createPlaybackSource,
  getMimeForPath,
  getExtensionForPath,
  type LocalTrack,
} from '../lib/local-music'
import { createScrobbleService, type ScrobbleService } from '../lib/scrobble-service'
import {
  formatTime, parseDuration,
  LS_TRACK_ID, LS_POSITION, LS_DURATION, LS_VOLUME,
  savePlayerState, readPlayerState,
} from './player-utils'
import { playEncryptedContent as playEncryptedContentImpl, type EncryptedPlaybackDeps } from './encrypted-playback'

export interface EncryptedContentInfo {
  contentId: string
  trackId: string
  pieceCid: string
  datasetOwner: string
  title: string
  artist: string
  algo?: number // 0 = plaintext, 1 = AES-GCM-256 (default)
  coverUrl?: string // resolved album art URL for NowPlaying display
}

// ─── Context type ─────────────────────────────────────────────────────────────

export interface PlayerContextType {
  // State
  tracks: () => LocalTrack[]
  folderPath: () => string | null
  initialLoading: () => boolean
  scanning: () => boolean
  scanProgress: () => { done: number; total: number } | null
  libraryScrollTop: () => number
  currentIndex: () => number
  currentTrack: () => LocalTrack | null
  selectedTrackId: () => string | null
  isPlaying: () => boolean
  currentTime: () => number
  duration: () => number
  volume: () => number
  progress: () => number
  currentTimeFormatted: () => string
  durationFormatted: () => string
  playbackError: () => string | null
  decrypting: () => boolean

  // Actions
  setTracks: (tracks: LocalTrack[]) => void
  setLibraryFolder: (path: string) => Promise<void>
  rescanLibrary: (path?: string) => Promise<void>
  setLibraryScrollTop: (value: number) => void
  setSelectedTrackId: (id: string | null) => void
  playTrack: (index: number) => Promise<void>
  togglePlay: () => Promise<void>
  playNext: () => void
  playPrev: () => void
  handleSeek: (value: number) => void
  handleSeekStart: () => void
  handleSeekEnd: () => Promise<void>
  handleVolumeChange: (value: number) => void
  playEncryptedContent: (content: EncryptedContentInfo) => Promise<void>

  // Scrobble service
  scrobbleService: ScrobbleService | null
}

const PlayerContext = createContext<PlayerContextType>()

export const usePlayer = () => {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const PlayerProvider: ParentComponent = (props) => {
  const auth = useAuth()

  // Scrobble service
  let scrobbleService: ScrobbleService | null = null

  onMount(() => {
    scrobbleService = createScrobbleService()
    scrobbleService!.start()
  })

  onCleanup(() => {
    scrobbleService?.stop()
  })

  // State
  const [tracks, setTracks] = createSignal<LocalTrack[]>([])
  const [folderPath, setFolderPath] = createSignal<string | null>(null)
  const [initialLoading] = createSignal(false)
  const [scanning, setScanning] = createSignal(false)
  const [scanProgress, setScanProgress] = createSignal<{ done: number; total: number } | null>(null)
  const [libraryScrollTop, setLibraryScrollTop] = createSignal(0)
  const [currentIndex, setCurrentIndex] = createSignal(-1)
  const [selectedTrackId, setSelectedTrackId] = createSignal<string | null>(null)
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(Number(readPlayerState(LS_VOLUME)) || 75)
  const [playbackError, setPlaybackError] = createSignal<string | null>(null)
  const [decrypting, setDecrypting] = createSignal(false)

  // Notify scrobble engine of play/pause changes
  createEffect(on(isPlaying, (playing) => {
    scrobbleService?.onPlaybackChange(playing)
  }))

  // ─── Persist playback state to localStorage ──────────────────────────────────

  // Save track id when it changes (skip the initial -1)
  createEffect(on(currentIndex, (idx) => {
    const t = tracks()
    if (idx >= 0 && idx < t.length) {
      savePlayerState(LS_TRACK_ID, t[idx].id)
    }
  }))

  // Save position debounced (~5s) — avoid thrashing localStorage on every timeupdate
  let positionSaveTimer: ReturnType<typeof setInterval> | undefined
  onMount(() => {
    positionSaveTimer = setInterval(() => {
      const time = currentTime()
      const dur = duration()
      if (currentIndex() >= 0 && time > 0) {
        savePlayerState(LS_POSITION, String(time))
        if (dur > 0) savePlayerState(LS_DURATION, String(dur))
      }
    }, 5000)
  })
  onCleanup(() => clearInterval(positionSaveTimer))

  // Save volume on change
  createEffect(on(volume, (v) => {
    savePlayerState(LS_VOLUME, String(v))
  }))

  // Restore last-played track after library loads (paused, at saved position)
  let restored = false
  let restoredSeek = 0 // position to seek to when user first hits play
  function restoreLastTrack() {
    if (restored) return
    const savedId = readPlayerState(LS_TRACK_ID)
    if (!savedId) return
    const t = tracks()
    const idx = t.findIndex((tr) => tr.id === savedId)
    if (idx < 0) return
    restored = true
    setCurrentIndex(idx)
    setSelectedTrackId(t[idx].id)
    const savedPos = Number(readPlayerState(LS_POSITION)) || 0
    const savedDur = Number(readPlayerState(LS_DURATION)) || parseDuration(t[idx].duration)
    if (savedPos > 0) setCurrentTime(savedPos)
    if (savedDur > 0) setDuration(savedDur)
    restoredSeek = savedPos
    // Don't auto-play — user hits play to resume
  }

  let audio: HTMLAudioElement | undefined
  let currentRevoke: (() => void) | undefined
  let currentMode: 'stream' | 'blob' = 'stream'
  let fallbackTried = false
  let playId = 0
  let decryptingPlayId = 0
  let seekWasPlaying = false
  let lastSeekValue = 0
  let pendingSeek: number | null = null
  const audioDebug = () => localStorage.getItem('heaven:debug-audio') === '1'
  let lastTimeLog = 0
  let lastTime = 0
  let isSeeking = false

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

  async function setLibraryFolder(path: string) {
    setFolderPath(path)
  }

  async function rescanLibrary(_path?: string) {
    setScanning(false)
    setScanProgress(null)
  }

  onMount(() => {
    restoreLastTrack()
  })

  // Audio setup
  onMount(() => {
    audio = new Audio()
    audio.volume = volume() / 100

    const onTimeUpdate = () => {
      const current = audio!.currentTime
      setCurrentTime(current)
      if (!duration()) {
        const audioDur = audio!.duration
        if (Number.isFinite(audioDur) && audioDur > 0) {
          setDuration(audioDur)
        }
      }
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
    const onEnded = () => {
      logAudio('ended')
      playNext()
    }
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
      if (currentMode === 'blob' && (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE)) {
        setPlaybackError('Unsupported audio format for this device.')
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

  async function playTrack(index: number, mode: 'stream' | 'blob' = 'stream', isFallback = false, seekTo = 0) {
    const t = tracks()
    if (index < 0 || index >= t.length) return
    if (decryptingPlayId) {
      decryptingPlayId = 0
      setDecrypting(false)
    }

    // Skip tracks without a local file (e.g. on-chain playlist tracks)
    const track = t[index] as LocalTrack
    if (!track.filePath) {
      console.log('[Player] No filePath for track:', index, track.id, track.title)
      setCurrentIndex(index)
      setSelectedTrackId(track.id)
      setPlaybackError('No local audio file for this track.')
      setIsPlaying(false)
      return
    }

    const thisPlay = ++playId
    if (!isFallback) fallbackTried = false
    if (!seekTo) restoredSeek = -1 // clear restore state on explicit play
    setCurrentIndex(index)
    setSelectedTrackId(t[index].id)
    setPlaybackError(null)
    scrobbleService?.onTrackStart({
      artist: track.artist,
      title: track.title,
      album: track.album || null,
      durationMs: parseDuration(track.duration) * 1000 || null,
      mbid: track.mbid || null,
      ipId: track.ipId || null,
      coverCid: track.coverCid || null,
      coverPath: track.coverPath || null,
      filePath: track.filePath || null,
    })
    setCurrentTime(0)
    const fallbackDuration = parseDuration(t[index].duration)
    if (fallbackDuration > 0) setDuration(fallbackDuration)

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
      logAudio('src-set', { mode: source.mode, src: source.url, seekTo })
      await audio.play()
      if (seekTo > 0) {
        audio.currentTime = seekTo
        setCurrentTime(seekTo)
      }
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
    // If we restored a track from localStorage but haven't loaded audio yet,
    // load it now and seek to the saved position
    if (restored && restoredSeek >= 0 && currentIndex() >= 0 && !isPlaying()) {
      const seekPos = restoredSeek
      restoredSeek = -1 // clear so we don't re-seek on next toggle
      await playTrack(currentIndex(), 'stream', false, seekPos)
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
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const prev = currentIndex() <= 0 ? t.length - 1 : currentIndex() - 1
    playTrack(prev)
  }

  function handleSeek(value: number) {
    if (!audio) return
    lastSeekValue = value
    if (!duration()) {
      pendingSeek = value
      return
    }
    audio.currentTime = (value / 100) * duration()
  }

  function handleSeekStart() {
    if (!audio) return
    seekWasPlaying = !audio.paused
    audio.pause()
  }

  async function handleSeekEnd() {
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
    if (audio) audio.volume = value / 100
  }

  // ─── Encrypted content playback (delegated) ─────────────────────────────────

  const encryptedDeps: EncryptedPlaybackDeps = {
    getAudio: () => audio,
    getPlayId: () => playId,
    incrementPlayId: () => ++playId,
    getDecryptingPlayId: () => decryptingPlayId,
    setDecryptingPlayId: (id) => { decryptingPlayId = id },
    getCurrentRevoke: () => currentRevoke,
    setCurrentRevoke: (fn) => { currentRevoke = fn },
    setCurrentMode: (mode) => { currentMode = mode },
    setFallbackTried: (v) => { fallbackTried = v },
    setDecrypting,
    setPlaybackError,
    setIsPlaying,
    setDuration,
    duration,
    setCurrentTime,
    setCurrentIndex,
    setTracks,
    setSelectedTrackId,
    getAuthContext: () => auth.getAuthContext(),
    getPkpPublicKey: () => auth.pkpInfo()?.publicKey,
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)

  const ctx: PlayerContextType = {
    tracks,
    folderPath,
    initialLoading,
    scanning,
    scanProgress,
    libraryScrollTop,
    currentIndex,
    currentTrack,
    selectedTrackId,
    isPlaying,
    currentTime,
    duration,
    volume,
    progress,
    currentTimeFormatted: () => formatTime(currentTime()),
    durationFormatted: () => formatTime(duration()),
    playbackError,
    decrypting,

    setTracks,
    setLibraryFolder,
    rescanLibrary,
    setLibraryScrollTop,
    setSelectedTrackId,
    playTrack: (index: number) => playTrack(index),
    togglePlay,
    playNext,
    playPrev,
    handleSeek,
    handleSeekStart,
    handleSeekEnd,
    handleVolumeChange,
    playEncryptedContent: (content) => playEncryptedContentImpl(content, encryptedDeps),

    scrobbleService,
  }

  return (
    <PlayerContext.Provider value={ctx}>
      {props.children}
    </PlayerContext.Provider>
  )
}
