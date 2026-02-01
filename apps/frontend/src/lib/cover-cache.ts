/**
 * Local cover art cache — maps (artist, title, album) → albumCover URL.
 *
 * Used to preserve cover art for playlist tracks that haven't been scrobbled yet
 * (no on-chain coverCid). Only works for the local user who added the track.
 */

const cache = new Map<string, string>()

function makeKey(artist: string, title: string, album?: string): string {
  return `${artist}\0${title}\0${album ?? ''}`
}

export function setCoverCache(artist: string, title: string, album: string | undefined, coverUrl: string) {
  if (!coverUrl) return
  cache.set(makeKey(artist, title, album), coverUrl)
}

export function getCoverCache(artist: string, title: string, album?: string): string | undefined {
  return cache.get(makeKey(artist, title, album))
}
