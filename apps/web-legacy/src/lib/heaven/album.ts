/**
 * Album data layer — fetches album metadata from the metadata-resolver
 * (MusicBrainz release-group proxy) and on-chain scrobble data from Goldsky.
 */

import type { Track } from '@heaven/ui'
import { SUBGRAPH_MUSIC_SOCIAL } from '@heaven/core'
import { normalizeArtistName, normalizeArtistVariants, splitArtistNames, artistMatchesTarget, payloadToMbid } from './artist'
import { resolveCoverUrl } from './cover-ref'

// ── Config ──────────────────────────────────────────────────────────

const RESOLVER_URL =
  (() => {
    const url = (import.meta.env.VITE_RESOLVER_URL || '').trim()
    if (!url) throw new Error('Missing VITE_RESOLVER_URL')
    return url.replace(/\/+$/, '')
  })()

// ── Types ───────────────────────────────────────────────────────────

export interface AlbumInfo {
  mbid: string
  title: string
  type: string | null
  secondaryTypes: string[]
  releaseDate: string | null
  disambiguation: string | null
  artists: Array<{ mbid: string; name: string; joinphrase: string }>
  genres: string[]
  coverArtUrl: string
  trackCount: number | null
  links: Record<string, string>
}

export interface AlbumTrack {
  trackId: string
  title: string
  artist: string
  album: string
  coverCid: string
  kind: number
  payload: string
  durationSec: number
  scrobbleCount: number
  lastPlayed: number
}

export interface AlbumPageData {
  info: AlbumInfo
  tracks: AlbumTrack[]
  totalScrobbles: number
  uniqueListeners: number
  ranking: number
  totalAlbums: number
}

// ── Resolver API ────────────────────────────────────────────────────

export async function fetchAlbumInfo(mbid: string): Promise<AlbumInfo> {
  const res = await fetch(`${RESOLVER_URL}/release-group/${mbid}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Album not found')
    throw new Error(`Resolver error: ${res.status}`)
  }
  return res.json()
}

/**
 * Resolve a recording MBID to its release-group (album) MBID.
 * Returns null if no release-group found.
 */
export async function fetchRecordingReleaseGroup(
  recordingMbid: string,
): Promise<{ mbid: string; title: string; type: string | null } | null> {
  const url = `${RESOLVER_URL}/recording/${recordingMbid}`
  console.log('[fetchRecordingReleaseGroup] GET', url)
  const res = await fetch(url)
  console.log('[fetchRecordingReleaseGroup] status:', res.status)
  if (!res.ok) {
    console.log('[fetchRecordingReleaseGroup] not ok, returning null')
    return null
  }
  const data = await res.json() as {
    releaseGroup?: { mbid: string; title: string; type: string | null } | null
  }
  console.log('[fetchRecordingReleaseGroup] data:', JSON.stringify(data))
  return data.releaseGroup ?? null
}

// ── Subgraph: find tracks by album name ─────────────────────────────

/**
 * Normalize an album name for fuzzy matching.
 * Strips edition suffixes, parentheticals, accents, etc.
 */
export function normalizeAlbumName(name: string): string {
  const folded = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Generate match variants for an album name (handles edition suffixes).
 */
function normalizeAlbumVariants(name: string): Set<string> {
  const base = normalizeAlbumName(name)
  const variants = new Set<string>([base])

  // Strip parenthetical suffixes: "Album (Deluxe Edition)" → "Album"
  const noParens = base.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (noParens && noParens !== base) variants.add(noParens)

  // Strip bracket suffixes: "Album [Remaster]" → "Album"
  const noBrackets = base.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (noBrackets && noBrackets !== base) variants.add(noBrackets)

  // Strip common suffixes: "deluxe edition", "remastered", etc.
  const noSuffix = base
    .replace(/\b(deluxe|expanded|remastered?|anniversary|special|bonus track)\b.*$/g, '')
    .trim()
  if (noSuffix && noSuffix !== base) variants.add(noSuffix)

  return variants
}

function albumMatchesTarget(trackAlbum: string, targetVariants: Set<string>): boolean {
  const trackVariants = normalizeAlbumVariants(trackAlbum)
  for (const tv of trackVariants) {
    if (targetVariants.has(tv)) return true
  }
  return false
}

type RawAlbumTrack = {
  id: string
  title: string
  artist: string
  album: string
  kind: number
  payload: string
  coverCid: string | null
  durationSec: number | null
  scrobbles: Array<{ id: string; user: string; timestamp: string }>
}

/**
 * Query tracks from the subgraph that match a given album + artist.
 * Uses album_contains_nocase for the initial query, then filters client-side.
 */
export async function fetchAlbumTracks(
  albumTitle: string,
  artistName: string,
  limit = 200,
): Promise<{ tracks: AlbumTrack[]; totalScrobbles: number; uniqueListeners: number }> {
  const escapedAlbum = escapeGql(albumTitle)

  const query = `{
    tracks(
      where: { album_contains_nocase: "${escapedAlbum}" }
      first: ${limit}
      orderBy: registeredAt
      orderDirection: desc
    ) {
      id
      title
      artist
      album
      kind
      payload
      coverCid
      durationSec
      scrobbles(first: 1000) {
        id
        user
        timestamp
      }
    }
  }`

  const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`)
  const json = await res.json() as { data?: { tracks?: RawAlbumTrack[] } }
  const rawTracks = json.data?.tracks ?? []

  // Client-side filter: album must match AND artist must match
  const albumVariants = normalizeAlbumVariants(albumTitle)
  const artistNorm = normalizeArtistName(artistName)

  const filtered = rawTracks.filter(
    (t) => albumMatchesTarget(t.album, albumVariants) && artistMatchesTarget(t.artist, artistNorm),
  )

  return mapAlbumTracks(filtered)
}

function mapAlbumTracks(rawTracks: RawAlbumTrack[]): { tracks: AlbumTrack[]; totalScrobbles: number; uniqueListeners: number } {
  let totalScrobbles = 0
  const listenerSet = new Set<string>()

  const tracks: AlbumTrack[] = rawTracks.map((t) => {
    totalScrobbles += t.scrobbles.length
    for (const s of t.scrobbles) listenerSet.add(s.user)

    const lastPlayed = t.scrobbles.length > 0
      ? Math.max(...t.scrobbles.map((s) => parseInt(s.timestamp)))
      : 0

    return {
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverCid: t.coverCid ?? '',
      kind: t.kind,
      payload: t.payload ?? '',
      durationSec: t.durationSec ?? 0,
      scrobbleCount: t.scrobbles.length,
      lastPlayed,
    }
  })

  // Sort by scrobble count descending
  tracks.sort((a, b) => b.scrobbleCount - a.scrobbleCount)

  return { tracks, totalScrobbles, uniqueListeners: listenerSet.size }
}

/**
 * Compute album ranking by total scrobble count among all albums.
 */
async function fetchAlbumRanking(
  albumTitle: string,
  artistName: string,
): Promise<{ ranking: number; totalAlbums: number }> {
  const allTracks: Array<{ artist: string; album: string; scrobbleCount: number }> = []
  let skip = 0
  const pageSize = 1000

  while (true) {
    const query = `{
      tracks(first: ${pageSize}, skip: ${skip}, where: { album_not: "" }, orderBy: registeredAt, orderDirection: desc) {
        artist
        album
        scrobbles { id }
      }
    }`
    const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) break
    const json = await res.json() as { data?: { tracks?: Array<{ artist: string; album: string; scrobbles: Array<{ id: string }> }> } }
    const tracks = json.data?.tracks ?? []
    if (tracks.length === 0) break
    for (const t of tracks) {
      if (t.scrobbles.length > 0) {
        allTracks.push({ artist: t.artist, album: t.album, scrobbleCount: t.scrobbles.length })
      }
    }
    if (tracks.length < pageSize) break
    skip += pageSize
  }

  // Group by normalized album+artist key
  const albumScrobbles = new Map<string, number>()
  for (const t of allTracks) {
    const primary = splitArtistNames(t.artist)[0] || normalizeArtistName(t.artist)
    const albumKey = `${normalizeAlbumName(t.album)}::${primary}`
    albumScrobbles.set(albumKey, (albumScrobbles.get(albumKey) ?? 0) + t.scrobbleCount)
  }

  const sorted = [...albumScrobbles.entries()].sort((a, b) => b[1] - a[1])

  // Find our album's rank
  const targetAlbumVariants = normalizeAlbumVariants(albumTitle)
  const targetArtistVariants = normalizeArtistVariants(artistName)
  let ranking = 0
  for (let i = 0; i < sorted.length; i++) {
    const [key] = sorted[i]
    const [albumPart, artistPart] = key.split('::')
    if (targetAlbumVariants.has(albumPart) && targetArtistVariants.has(artistPart)) {
      ranking = i + 1
      break
    }
  }

  return { ranking: ranking || sorted.length + 1, totalAlbums: sorted.length }
}

/**
 * Fetch full album page data: resolver info + subgraph scrobble stats.
 */
export async function fetchAlbumPageData(mbid: string): Promise<AlbumPageData> {
  const info = await fetchAlbumInfo(mbid)

  const primaryArtist = info.artists[0]?.name ?? ''

  const [trackResult, rankResult] = await Promise.all([
    fetchAlbumTracks(info.title, primaryArtist),
    fetchAlbumRanking(info.title, primaryArtist),
  ])

  return {
    info,
    tracks: trackResult.tracks,
    totalScrobbles: trackResult.totalScrobbles,
    uniqueListeners: trackResult.uniqueListeners,
    ranking: rankResult.ranking,
    totalAlbums: rankResult.totalAlbums,
  }
}

// ── Track conversion ────────────────────────────────────────────────

export function albumTracksToTracks(albumTracks: AlbumTrack[]): Track[] {
  return albumTracks.map((t) => ({
    id: t.trackId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    kind: t.kind,
    payload: t.payload,
    mbid: t.kind === 1 ? payloadToMbid(t.payload) ?? undefined : undefined,
    albumCover: resolveCoverUrl(t.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 }),
    scrobbleCount: t.scrobbleCount,
    dateAdded: t.scrobbleCount > 0 ? `${t.scrobbleCount} plays` : '',
    duration: formatDuration(t.durationSec),
    scrobbleStatus: 'verified' as const,
  }))
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function escapeGql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
