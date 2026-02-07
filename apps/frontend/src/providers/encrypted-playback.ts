import type { LocalTrack } from '../lib/local-music'
import type { EncryptedContentInfo } from './PlayerProvider'
import { fetchAndDecrypt, fetchPlaintext } from '../lib/content-service'
import { sniffAudioMime, decodeDuration } from './player-utils'

export interface EncryptedPlaybackDeps {
  getAudio: () => HTMLAudioElement | undefined
  getPlayId: () => number
  incrementPlayId: () => number
  getDecryptingPlayId: () => number
  setDecryptingPlayId: (id: number) => void
  getCurrentRevoke: () => (() => void) | undefined
  setCurrentRevoke: (fn: (() => void) | undefined) => void
  setCurrentMode: (mode: 'stream' | 'blob') => void
  setFallbackTried: (v: boolean) => void

  // Signals
  setDecrypting: (v: boolean) => void
  setPlaybackError: (v: string | null) => void
  setIsPlaying: (v: boolean) => void
  setDuration: (v: number) => void
  duration: () => number
  setCurrentTime: (v: number) => void
  setCurrentIndex: (v: number) => void
  setTracks: (v: LocalTrack[]) => void
  setSelectedTrackId: (v: string | null) => void

  // Auth
  getAuthContext: () => Promise<any>
}

// In-memory cache for decrypted audio blob URLs (keyed by contentId)
const decryptedCache = new Map<string, string>()
const decryptedDurationCache = new Map<string, number>()

export async function playEncryptedContent(
  content: EncryptedContentInfo,
  deps: EncryptedPlaybackDeps,
): Promise<void> {
  const audio = deps.getAudio()
  console.log('[Player] playEncryptedContent called:', {
    contentId: content.contentId,
    pieceCid: content.pieceCid,
    datasetOwner: content.datasetOwner,
    algo: content.algo,
    title: content.title,
  })
  if (!audio) {
    console.error('[Player] No audio element')
    return
  }
  const thisPlay = deps.incrementPlayId()
  if (deps.getDecryptingPlayId()) {
    deps.setDecryptingPlayId(0)
    deps.setDecrypting(false)
  }
  deps.setPlaybackError(null)

  // Create a synthetic track so NowPlaying displays correctly
  const syntheticTrack: LocalTrack = {
    id: content.contentId,
    title: content.title,
    artist: content.artist,
    album: '',
    filePath: '', // no local file
    albumCover: content.coverUrl,
  }

  // Set as current track immediately (shows title while decrypting)
  deps.setTracks([syntheticTrack])
  deps.setCurrentIndex(0)
  deps.setSelectedTrackId(content.contentId)
  deps.setCurrentTime(0)
  deps.setDuration(0)
  deps.setIsPlaying(false)

  // Check cache first
  const cached = decryptedCache.get(content.contentId)
  if (cached) {
    if (thisPlay !== deps.getPlayId()) return
    deps.getCurrentRevoke()?.()
    deps.setCurrentRevoke(undefined)
    deps.setCurrentMode('blob')
    deps.setFallbackTried(true)
    const cachedDuration = decryptedDurationCache.get(content.contentId)
    if (cachedDuration) deps.setDuration(cachedDuration)
    audio.src = cached
    audio.currentTime = 0
    audio.load()
    try {
      await audio.play()
      if (thisPlay === deps.getPlayId()) deps.setIsPlaying(true)
    } catch {
      if (thisPlay === deps.getPlayId()) {
        deps.setPlaybackError('Audio playback failed.')
        deps.setIsPlaying(false)
      }
    }
    return
  }

  // Fetch + decrypt (or fetch plaintext if algo=0)
  try {
    deps.setDecryptingPlayId(thisPlay)
    deps.setDecrypting(true)
    console.log('[Player] Starting fetch, algo:', content.algo)
    let result: { audio: Uint8Array }
    if (content.algo === 0) {
      console.log('[Player] Fetching plaintext from Beam...')
      result = await fetchPlaintext(content.datasetOwner, content.pieceCid)
    } else {
      console.log('[Player] Fetching encrypted + decrypting via Lit...')
      const authContext = await deps.getAuthContext()
      result = await fetchAndDecrypt(
        content.datasetOwner,
        content.pieceCid,
        content.contentId,
        authContext,
      )
    }
    console.log('[Player] Got audio bytes:', result.audio.length)
    if (thisPlay !== deps.getPlayId()) return

    // Create blob URL from decrypted audio bytes
    const detectedMime = sniffAudioMime(result.audio)
    const canPlay = detectedMime ? audio.canPlayType(detectedMime) : ''
    console.log('[Player] Cloud mime:', { detectedMime, canPlay })
    if (detectedMime && !canPlay) {
      deps.setPlaybackError('Unsupported audio format for this device.')
      deps.setIsPlaying(false)
      return
    }
    if (detectedMime === 'audio/flac' && canPlay !== 'probably') {
      deps.setPlaybackError('Unsupported audio format for this device.')
      deps.setIsPlaying(false)
      return
    }
    const blob = detectedMime
      ? new Blob([result.audio as BlobPart], { type: detectedMime })
      : new Blob([result.audio as BlobPart])
    const url = URL.createObjectURL(blob)
    decryptedCache.set(content.contentId, url)
    const cachedDuration = decryptedDurationCache.get(content.contentId)
    if (cachedDuration) deps.setDuration(cachedDuration)

    // Stop current playback
    audio.pause()
    deps.getCurrentRevoke()?.()
    deps.setCurrentRevoke(() => {
      // Don't revoke cached URLs — they'll be GC'd with the page
    })

    deps.setCurrentMode('blob')
    deps.setFallbackTried(true)
    audio.src = url
    audio.currentTime = 0
    audio.load()
    try {
      await audio.play()
      if (thisPlay === deps.getPlayId()) deps.setIsPlaying(true)
    } catch {
      if (thisPlay === deps.getPlayId()) {
        deps.setPlaybackError('Audio playback failed.')
        deps.setIsPlaying(false)
      }
    }
    if (thisPlay === deps.getPlayId() && !deps.duration()) {
      setTimeout(() => {
        if (thisPlay !== deps.getPlayId() || deps.duration()) return
        void decodeDuration(result.audio).then((decodedDuration) => {
          if (!decodedDuration) return
          if (thisPlay !== deps.getPlayId() || deps.duration()) return
          decryptedDurationCache.set(content.contentId, decodedDuration)
          deps.setDuration(decodedDuration)
        })
      }, 250)
    }
  } catch (e: any) {
    console.error('[Player] Failed to decrypt content:', e)
    if (thisPlay === deps.getPlayId()) {
      deps.setPlaybackError(e?.message || 'Failed to decrypt content')
      deps.setIsPlaying(false)
    }
  } finally {
    if (deps.getDecryptingPlayId() === thisPlay) {
      deps.setDecryptingPlayId(0)
      deps.setDecrypting(false)
    }
  }
}
