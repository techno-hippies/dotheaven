/**
 * Local cover art cache — maps (artist, title, album) → albumCover URL.
 *
 * Used to preserve cover art for playlist tracks that haven't been scrobbled yet
 * (no on-chain coverCid). Only works for the local user who added the track.
 */

const cache = new Map<string, string>()
const idCache = new Map<string, string>()

function normalizeKeyPart(value: string | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function makeKey(artist: string, title: string, album?: string): string {
  const a = normalizeKeyPart(artist)
  const t = normalizeKeyPart(title)
  const al = normalizeKeyPart(album)
  return `${a}\0${t}\0${al}`
}

export function setCoverCache(artist: string, title: string, album: string | undefined, coverUrl: string) {
  if (!coverUrl) return
  const key = makeKey(artist, title, album)
  cache.set(key, coverUrl)
  const albumKey = makeKey(artist, title, '')
  cache.set(albumKey, coverUrl)
}

export function getCoverCache(artist: string, title: string, album?: string): string | undefined {
  const key = makeKey(artist, title, album)
  return cache.get(key) ?? cache.get(makeKey(artist, title, ''))
}

export function setCoverCacheById(trackId: string | undefined, coverUrl: string | undefined) {
  if (!trackId || !coverUrl) return
  idCache.set(trackId.toLowerCase(), coverUrl)
}

export function getCoverCacheById(trackId: string | undefined): string | undefined {
  if (!trackId) return undefined
  return idCache.get(trackId.toLowerCase())
}
