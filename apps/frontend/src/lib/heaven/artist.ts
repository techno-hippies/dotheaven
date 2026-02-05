/**
 * Artist data layer — fetches artist metadata from the heaven-resolver
 * (MusicBrainz proxy) and on-chain scrobble data from the Goldsky subgraph.
 */

import type { Track } from '@heaven/ui'

// ── Config ──────────────────────────────────────────────────────────

// TODO: move to VITE_RESOLVER_URL env var when deployed
const RESOLVER_URL = 'https://heaven-resolver.theavenhouse.workers.dev'

const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/8.0.0/gn'

const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

// ── Types ───────────────────────────────────────────────────────────

export interface ArtistInfo {
  mbid: string
  name: string
  sortName: string
  type: string | null
  disambiguation: string | null
  country: string | null
  area: string | null
  lifeSpan: { begin?: string; end?: string; ended?: boolean } | null
  genres: string[]
  links: Record<string, string>
}

export interface ArtistTrack {
  trackId: string
  title: string
  artist: string
  album: string
  coverCid: string
  scrobbleCount: number
  lastPlayed: number // unix seconds
}

export interface ArtistPageData {
  info: ArtistInfo
  tracks: ArtistTrack[]
  totalScrobbles: number
  uniqueListeners: number
}

// ── MBID codec ──────────────────────────────────────────────────────

/**
 * Decode a bytes32 payload (from on-chain kind=1 tracks) back to a UUID string.
 * Encoding: UUID without dashes → 16 bytes → right-padded to 32 bytes.
 * So the first 32 hex chars (after 0x) hold the MBID.
 */
export function payloadToMbid(payload: string): string | null {
  const hex = payload.startsWith('0x') ? payload.slice(2) : payload
  // Take first 32 hex chars = 16 bytes = UUID without dashes
  const raw = hex.slice(0, 32)
  if (raw.length !== 32 || !/^[0-9a-f]+$/i.test(raw)) return null
  // Check it's not all zeros (empty payload)
  if (/^0+$/.test(raw)) return null
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`
}

/**
 * Convert a UUID string to the on-chain bytes32 payload format.
 */
export function mbidToPayload(mbid: string): string {
  const hex = mbid.replace(/-/g, '')
  return '0x' + hex.padEnd(64, '0')
}

// ── Resolver API ────────────────────────────────────────────────────

export async function fetchArtistInfo(mbid: string): Promise<ArtistInfo> {
  const res = await fetch(`${RESOLVER_URL}/artist/${mbid}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Artist not found')
    throw new Error(`Resolver error: ${res.status}`)
  }
  return res.json()
}

export async function fetchRecordingArtists(
  recordingMbid: string,
): Promise<{ recording: { mbid: string; title: string }; artists: Array<{ mbid: string; name: string }> }> {
  const res = await fetch(`${RESOLVER_URL}/recording/${recordingMbid}`)
  if (!res.ok) throw new Error(`Resolver error: ${res.status}`)
  return res.json()
}

// ── Subgraph: find tracks by artist name ────────────────────────────

/**
 * Query the activity subgraph for tracks matching an artist name,
 * along with scrobble counts and listener stats.
 */
export async function fetchArtistTracks(
  artistName: string,
  limit = 50,
): Promise<{ tracks: ArtistTrack[]; totalScrobbles: number; uniqueListeners: number }> {
  // The subgraph stores artist as a plain string — we search by exact match
  // (case-sensitive; MusicBrainz canonical name should match what's on-chain)
  const query = `{
    tracks(
      where: { artist: "${escapeGql(artistName)}" }
      first: ${limit}
      orderBy: registeredAt
      orderDirection: desc
    ) {
      id
      title
      artist
      coverCid
      scrobbles(first: 1000) {
        id
        user
        timestamp
      }
    }
  }`

  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`)
  const json = await res.json()

  const rawTracks: Array<{
    id: string
    title: string
    artist: string
    coverCid: string | null
    scrobbles: Array<{ id: string; user: string; timestamp: string }>
  }> = json.data?.tracks ?? []

  let totalScrobbles = 0
  const listenerSet = new Set<string>()

  const tracks: ArtistTrack[] = rawTracks.map((t) => {
    totalScrobbles += t.scrobbles.length
    for (const s of t.scrobbles) listenerSet.add(s.user)

    const lastPlayed = t.scrobbles.length > 0
      ? Math.max(...t.scrobbles.map((s) => parseInt(s.timestamp)))
      : 0

    return {
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      album: '', // subgraph doesn't index album separately
      coverCid: t.coverCid ?? '',
      scrobbleCount: t.scrobbles.length,
      lastPlayed,
    }
  })

  // Sort by scrobble count descending (most played first)
  tracks.sort((a, b) => b.scrobbleCount - a.scrobbleCount)

  return { tracks, totalScrobbles, uniqueListeners: listenerSet.size }
}

/**
 * Fetch full artist page data: resolver info + subgraph scrobble stats.
 */
export async function fetchArtistPageData(mbid: string): Promise<ArtistPageData> {
  const info = await fetchArtistInfo(mbid)

  // Fetch tracks from subgraph using the canonical artist name
  const { tracks, totalScrobbles, uniqueListeners } = await fetchArtistTracks(info.name)

  return { info, tracks, totalScrobbles, uniqueListeners }
}

/**
 * Convert ArtistTrack[] to Track[] for the TrackList component.
 */
export function artistTracksToTracks(artistTracks: ArtistTrack[]): Track[] {
  return artistTracks.map((t) => ({
    id: t.trackId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumCover: t.coverCid
      ? `${FILEBASE_GATEWAY}/${t.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
    dateAdded: t.scrobbleCount > 0 ? `${t.scrobbleCount} plays` : '',
    duration: '--:--',
    scrobbleStatus: 'verified' as const,
  }))
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeGql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
