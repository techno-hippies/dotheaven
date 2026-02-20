/**
 * Artist data layer — fetches artist metadata from the metadata-resolver
 * (MusicBrainz proxy) and on-chain scrobble data from the Goldsky subgraph.
 */

import type { Track } from '@heaven/ui'
import { SUBGRAPH_MUSIC_SOCIAL } from '@heaven/core'
import { resolveCoverUrl } from './cover-ref'

// ── Config ──────────────────────────────────────────────────────────

const RESOLVER_URL =
  import.meta.env.VITE_RESOLVER_URL?.trim().replace(/\/+$/, '') ||
  'https://metadata-resolver.deletion-backup782.workers.dev'

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

export interface ArtistLeaderboardEntry {
  user: string
  scrobbles: bigint
}

export interface ArtistPageData {
  info: ArtistInfo
  tracks: ArtistTrack[]
  totalScrobbles: number
  uniqueListeners: number
  leaderboard: ArtistLeaderboardEntry[]
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
 * Query the music-social subgraph for tracks matching an artist name,
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

  // Fetch artist tracks + leaderboard in parallel
  const [trackResult, leaderboard] = await Promise.all([
    fetchArtistTracks(info.name),
    fetchArtistLeaderboard(info.name),
  ])

  return {
    info,
    tracks: trackResult.tracks,
    totalScrobbles: trackResult.totalScrobbles,
    uniqueListeners: trackResult.uniqueListeners,
    leaderboard,
  }
}

/**
 * Fetch and aggregate user leaderboard rows for a given artist.
 */
async function fetchArtistLeaderboard(artistName: string, limit = 100): Promise<ArtistLeaderboardEntry[]> {
  const rows = await queryArtistLeaderboardRows(artistName, limit)
  return mapArtistLeaderboardRows(artistName, rows, limit)
}

type RawArtistLeaderboardRow = {
  id: string
  user: string
  artist: string
  scrobbleCount: string
  lastScrobbleAt: string
}

async function queryArtistLeaderboardRows(
  artistName: string,
  limit: number,
): Promise<RawArtistLeaderboardRow[]> {
  const rows: RawArtistLeaderboardRow[] = []
  let skip = 0
  const pageSize = Math.max(1, Math.min(100, limit))

  while (true) {
    const remaining = Math.max(0, limit - rows.length)
    const take = Math.max(1, Math.min(pageSize, remaining))
    const query = `{
      userArtistStats(
        where: { artist_contains_nocase: "${escapeGql(artistName)}" }
        orderBy: scrobbleCount
        orderDirection: desc
        first: ${take}
        skip: ${skip}
      ) {
        id
        user
        artist
        scrobbleCount
        lastScrobbleAt
      }
    }`

    const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`)
    const json = await res.json()
    const page = json.data?.userArtistStats ?? []
    rows.push(...page)

    if (!Array.isArray(page) || page.length < take) {
      break
    }

    skip += take

    if (rows.length >= limit) {
      break
    }
  }

  return rows
}

function mapArtistLeaderboardRows(
  artistName: string,
  rows: RawArtistLeaderboardRow[],
  limit: number,
): ArtistLeaderboardEntry[] {
  const userScrobbles = new Map<string, bigint>()

  for (const row of rows) {
    if (!row.artist || !artistMatchesTarget(row.artist, artistName)) {
      continue
    }

    const value = parseBigInt(row.scrobbleCount)
    if (value === null) continue

    const user = row.user.toLowerCase()
    userScrobbles.set(user, (userScrobbles.get(user) ?? 0n) + value)
  }

  const normalizedRows = [...userScrobbles.entries()].map(([user, scrobbles]) => ({
    user,
    scrobbles,
  }))

  const sorted = normalizedRows.sort((a, b) => {
    if (a.scrobbles === b.scrobbles) {
      return a.user.localeCompare(b.user)
    }
    return a.scrobbles > b.scrobbles ? -1 : 1
  })

  return sorted.slice(0, limit)
}

function parseBigInt(value: string | number | null | undefined): bigint | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    return BigInt(Math.floor(value))
  }

  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    return BigInt(value)
  } catch {
    return null
  }
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

  const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
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
