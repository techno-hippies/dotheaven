import type { Track } from '@heaven/ui'
import { resolveCoverUrl } from './heaven/cover-ref'

export interface LocalTrack extends Track {
  filePath: string
  /** MusicBrainz Recording ID from ID3 tags */
  mbid?: string
  /** MusicBrainz Artist ID (first/primary artist) from ID3 tags */
  artistMbid?: string
  /** MusicBrainz Release Artist ID from ID3 tags */
  albumArtistMbid?: string
  /** IPFS CID for album cover art (set after uploading to Filebase) */
  coverCid?: string
  /** Absolute path to local cover image (legacy desktop metadata) */
  coverPath?: string
}

function desktopFeaturesRemoved(): Error {
  return new Error('Local desktop music features were removed.')
}

// =============================================================================
// Legacy native wrappers (disabled)
// =============================================================================

export async function scanFolderNative(_folder: string): Promise<number> {
  throw desktopFeaturesRemoved()
}

export async function getTracksNative(_folder: string, _limit: number, _offset: number): Promise<LocalTrack[]> {
  throw desktopFeaturesRemoved()
}

export async function getTrackCountNative(_folder: string): Promise<number> {
  throw desktopFeaturesRemoved()
}

export async function getFolderNative(): Promise<string | null> {
  return null
}

export async function setFolderNative(_folder: string): Promise<void> {
  throw desktopFeaturesRemoved()
}

export async function setCoverCidNative(_filePath: string, _coverCid: string): Promise<void> {
  // no-op on web
}

// =============================================================================
// Folder picker
// =============================================================================

export async function pickFolder(): Promise<string | null> {
  // Web builds do not have direct folder path access.
  return null
}

// =============================================================================
// Playback helpers
// =============================================================================

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.substring(dot).toLowerCase() : ''
}

function guessMime(name: string): string {
  return MIME_MAP[getExtension(name)] || 'audio/mpeg'
}

export function getMimeForPath(path: string): string {
  return guessMime(path)
}

export function getExtensionForPath(path: string): string {
  return getExtension(path)
}

export type PlaybackSource = {
  url: string
  mime: string
  mode: 'stream' | 'blob'
  revoke?: () => void
}

export async function createPlaybackSource(
  filePath: string,
  mode: 'stream' | 'blob' = 'stream'
): Promise<PlaybackSource> {
  const mime = guessMime(filePath)
  if (mode === 'stream') {
    return { url: filePath, mime, mode }
  }

  const response = await fetch(filePath)
  if (!response.ok) {
    throw new Error(`Failed to read audio source: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const blob = new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  return { url, mime, mode, revoke: () => URL.revokeObjectURL(url) }
}

// =============================================================================
// Migration: remove old localStorage data
// =============================================================================

const OLD_STORAGE_KEY = 'heaven:local-music'

/** Returns old folder path if migration is needed, then clears localStorage */
export function migrateFromLocalStorage(): string | null {
  const raw = localStorage.getItem(OLD_STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { folderPath: string }
    localStorage.removeItem(OLD_STORAGE_KEY)
    return data.folderPath || null
  } catch {
    localStorage.removeItem(OLD_STORAGE_KEY)
    return null
  }
}

// Keep a tiny helper for legacy call sites that expect albumCover fallback behavior.
export function applyCoverFallback(track: LocalTrack): LocalTrack {
  if (!track.albumCover) {
    const coverUrl = resolveCoverUrl(track.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 })
    if (coverUrl) track.albumCover = coverUrl
  }
  if (!track.scrobbleStatus) {
    track.scrobbleStatus = track.mbid ? 'verified' : 'unidentified'
  }
  return track
}
