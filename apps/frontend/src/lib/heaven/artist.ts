/**
 * Artist data layer — fetches artist metadata from the heaven-resolver
 * (MusicBrainz proxy) and on-chain scrobble data from the Goldsky subgraph.
 */

import type { Track } from '@heaven/ui'
import { SUBGRAPH_ACTIVITY } from '@heaven/core'

// ── Config ──────────────────────────────────────────────────────────

const RESOLVER_URL =
  import.meta.env.VITE_RESOLVER_URL || 'https://heaven-resolver-production.deletion-backup782.workers.dev'

const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

/** Validate CID looks like an IPFS hash (Qm... or bafy...) */
function isValidCid(cid: string | undefined | null): cid is string {
  return !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'))
}

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
  kind: number
  payload: string
  durationSec: number
  scrobbleCount: number
  lastPlayed: number // unix seconds
}

export interface ArtistPageData {
  info: ArtistInfo
  tracks: ArtistTrack[]
  totalScrobbles: number
  uniqueListeners: number
  ranking: number       // 1-based rank among all artists by scrobble count
  totalArtists: number  // total number of artists with scrobbles
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
  // Use contains_nocase to catch both exact matches AND featuring credits
  // e.g. "Justice" will match "Justice" and "Justice starring RIMON"
  const results = await queryArtistTracks({
    where: `artist_contains_nocase: "${escapeGql(artistName)}"`,
    limit: Math.max(limit, 200),
  })

  // Filter client-side to ensure the artist name actually matches
  // (not just contains as a substring of another word)
  const target = normalizeArtistName(artistName)
  const filtered = results.filter((t) => artistMatchesTarget(t.artist, target))

  return mapArtistTracks(filtered)
}

/**
 * Fetch full artist page data: resolver info + subgraph scrobble stats.
 */
export async function fetchArtistPageData(mbid: string): Promise<ArtistPageData> {
  const info = await fetchArtistInfo(mbid)

  // Fetch artist tracks + ranking in parallel
  const [trackResult, rankResult] = await Promise.all([
    fetchArtistTracks(info.name),
    fetchArtistRanking(info.name),
  ])

  return {
    info,
    tracks: trackResult.tracks,
    totalScrobbles: trackResult.totalScrobbles,
    uniqueListeners: trackResult.uniqueListeners,
    ranking: rankResult.ranking,
    totalArtists: rankResult.totalArtists,
  }
}

/**
 * Compute the artist's ranking by total scrobble count among all artists.
 * Fetches all tracks with scrobbles and groups by primary artist name.
 */
async function fetchArtistRanking(artistName: string): Promise<{ ranking: number; totalArtists: number }> {
  // Paginate through all tracks that have at least 1 scrobble
  const allTracks: Array<{ artist: string; scrobbleCount: number }> = []
  let skip = 0
  const pageSize = 1000

  while (true) {
    const query = `{
      tracks(first: ${pageSize}, skip: ${skip}, orderBy: registeredAt, orderDirection: desc) {
        artist
        scrobbles { id }
      }
    }`
    const res = await fetch(SUBGRAPH_ACTIVITY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) break
    const json = await res.json()
    const tracks = json.data?.tracks ?? []
    if (tracks.length === 0) break
    for (const t of tracks) {
      if (t.scrobbles.length > 0) {
        allTracks.push({ artist: t.artist, scrobbleCount: t.scrobbles.length })
      }
    }
    if (tracks.length < pageSize) break
    skip += pageSize
  }

  // Group scrobbles by primary artist name (first part before feat/ft etc.)
  const artistScrobbles = new Map<string, number>()
  for (const t of allTracks) {
    const parts = splitArtistNames(t.artist)
    const primary = parts[0] || normalizeArtistName(t.artist)
    artistScrobbles.set(primary, (artistScrobbles.get(primary) ?? 0) + t.scrobbleCount)
  }

  // Sort descending by scrobble count
  const sorted = [...artistScrobbles.entries()].sort((a, b) => b[1] - a[1])

  // Find our artist's rank
  const targetVariants = normalizeArtistVariants(artistName)
  let ranking = 0
  for (let i = 0; i < sorted.length; i++) {
    if (targetVariants.has(sorted[i][0])) {
      ranking = i + 1
      break
    }
  }

  return { ranking: ranking || sorted.length + 1, totalArtists: sorted.length }
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
    kind: t.kind,
    payload: t.payload,
    mbid: t.kind === 1 ? payloadToMbid(t.payload) ?? undefined : undefined,
    albumCover: isValidCid(t.coverCid)
      ? `${FILEBASE_GATEWAY}/${t.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
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

// ── Helpers ──────────────────────────────────────────────────────────

function escapeGql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// ── Internal helpers ───────────────────────────────────────────────

type RawArtistTrack = {
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

async function queryArtistTracks(params: { where: string; limit: number }): Promise<RawArtistTrack[]> {
  const query = `{
    tracks(
      where: { ${params.where} }
      first: ${params.limit}
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

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`)
  const json = await res.json()
  return json.data?.tracks ?? []
}

function mapArtistTracks(rawTracks: RawArtistTrack[]): { tracks: ArtistTrack[]; totalScrobbles: number; uniqueListeners: number } {
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
      album: t.album ?? '',
      coverCid: t.coverCid ?? '',
      kind: t.kind,
      payload: t.payload ?? '',
      durationSec: t.durationSec ?? 0,
      scrobbleCount: t.scrobbles.length,
      lastPlayed,
    }
  })

  // Sort by scrobble count descending (most played first)
  tracks.sort((a, b) => b.scrobbleCount - a.scrobbleCount)

  return { tracks, totalScrobbles, uniqueListeners: listenerSet.size }
}

export function normalizeArtistName(name: string): string {
  const folded = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return folded
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/&/g, ' and ')
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, ' feat ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function splitArtistNames(name: string): string[] {
  const unified = name
    .toLowerCase()
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, '|')
    .replace(/\bstarring\b/g, '|')
    .replace(/&/g, '|')
    .replace(/\+/g, '|')
    .replace(/\bx\b/g, '|')
    .replace(/\band\b/g, '|')
    .replace(/\bwith\b/g, '|')
    .replace(/\//g, '|')
    .replace(/,/g, '|')
  return unified
    .split('|')
    .map((p) => normalizeArtistName(p))
    .filter(Boolean)
}

export function artistMatchesTarget(artistField: string, targetNorm: string): boolean {
  if (!targetNorm) return false
  const targetVariants = normalizeArtistVariants(targetNorm)
  const fieldVariants = normalizeArtistVariants(artistField)

  for (const fieldVariant of fieldVariants) {
    for (const targetVariant of targetVariants) {
      if (fieldVariant === targetVariant) return true
      if (wordContains(fieldVariant, targetVariant)) return true
      if (wordContains(targetVariant, fieldVariant)) return true
    }
  }
  for (const part of splitArtistNames(artistField)) {
    for (const targetVariant of targetVariants) {
      if (part === targetVariant) return true
      if (wordContains(part, targetVariant)) return true
    }
  }
  return false
}

export function normalizeArtistVariants(name: string): Set<string> {
  const base = normalizeArtistName(name)
  const variants = new Set<string>([base])

  const noParens = base.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (noParens && noParens !== base) variants.add(noParens)

  if (base.startsWith('the ')) {
    variants.add(base.slice(4))
  }

  if (base.endsWith(' the')) {
    const noTrail = base.slice(0, -4)
    variants.add(noTrail)
    variants.add(`the ${noTrail}`)
  }

  return variants
}

function wordContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}
