import type { Track, ScrobbleStatus } from '@heaven/ui'

// V2 subgraph endpoint
const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/2.0.0/gn'

// ── Types ──────────────────────────────────────────────────────────

/** V2 identified scrobble (MBID or ipId) from subgraph */
export interface ScrobbleGQL {
  id: string
  user: string
  scrobbleId: string
  identifier: string     // bytes20 hex
  kind: number           // 1 = MBID, 2 = ipId
  timestamp: string
  blockNumber: string
  blockTimestamp: string
  transactionHash: string
}

/** V2 metadata scrobble (unidentified) from subgraph */
export interface ScrobbleMetaGQL {
  id: string
  user: string
  scrobbleId: string
  metaHash: string       // keccak256(abi.encode(title, artist, album))
  timestamp: string
  blockNumber: string
  blockTimestamp: string
  transactionHash: string
}

/** Unified scrobble entry for display */
export interface ScrobbleEntry {
  id: string
  identifier: string     // MBID uuid, ipId address, or metaHash
  kind: 'mbid' | 'ipId' | 'meta'
  status: ScrobbleStatus
  playedAt: number       // unix seconds
  txHash: string
  // Resolved metadata (populated from MusicBrainz/contract/cache)
  artist?: string
  title?: string
  album?: string
  albumCover?: string
}

// ── Helpers ────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

/** Convert bytes20 hex to MBID uuid string (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) */
function bytes20ToMBID(hex: string): string {
  // bytes20 = 40 hex chars, MBID is first 32 (bytes16 left-aligned, last 8 are zeroes)
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const mbid = clean.slice(0, 32)
  return `${mbid.slice(0, 8)}-${mbid.slice(8, 12)}-${mbid.slice(12, 16)}-${mbid.slice(16, 20)}-${mbid.slice(20, 32)}`
}

/** Convert bytes20 hex to address (take first 40 hex chars) */
function bytes20ToAddress(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return '0x' + clean.slice(0, 40)
}

// ── Fetch ──────────────────────────────────────────────────────────

async function queryGoldsky(query: string): Promise<any> {
  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  return res.json()
}

/**
 * Fetch all V2 scrobbles for a user. Returns unified entries sorted newest first.
 */
export async function fetchScrobbleEntries(
  userAddress: string,
  first = 100,
): Promise<ScrobbleEntry[]> {
  const addr = userAddress.toLowerCase()

  const query = `{
    scrobbles(
      where: { user: "${addr}" }
      orderBy: timestamp
      orderDirection: desc
      first: ${first}
    ) {
      id
      user
      scrobbleId
      identifier
      kind
      timestamp
      blockNumber
      blockTimestamp
      transactionHash
    }
    scrobbleMetaEntries(
      where: { user: "${addr}" }
      orderBy: timestamp
      orderDirection: desc
      first: ${first}
    ) {
      id
      user
      scrobbleId
      metaHash
      timestamp
      blockNumber
      blockTimestamp
      transactionHash
    }
  }`

  const json = await queryGoldsky(query)
  console.log('[scrobbles] Goldsky response:', JSON.stringify(json, null, 2))
  const idScrobbles: ScrobbleGQL[] = json.data?.scrobbles ?? []
  const metaScrobbles: ScrobbleMetaGQL[] = json.data?.scrobbleMetaEntries ?? []
  console.log('[scrobbles] idScrobbles:', idScrobbles.length, 'metaScrobbles:', metaScrobbles.length)

  const entries: ScrobbleEntry[] = []

  for (const s of idScrobbles) {
    const isMBID = s.kind === 1
    entries.push({
      id: s.id,
      identifier: isMBID ? bytes20ToMBID(s.identifier) : bytes20ToAddress(s.identifier),
      kind: isMBID ? 'mbid' : 'ipId',
      status: 'verified',
      playedAt: parseInt(s.timestamp),
      txHash: s.transactionHash,
    })
  }

  for (const s of metaScrobbles) {
    entries.push({
      id: s.id,
      identifier: s.metaHash,
      kind: 'meta',
      status: 'unidentified',
      playedAt: parseInt(s.timestamp),
      txHash: s.transactionHash,
    })
  }

  // Sort newest first
  entries.sort((a, b) => b.playedAt - a.playedAt)
  return entries
}

/**
 * Convert ScrobbleEntry[] to Track[] for TrackList component.
 *
 * For identified tracks (MBID/ipId), metadata must be resolved separately
 * (MusicBrainz API, contract read, or local cache). Until resolved, we show
 * the identifier as the title.
 */
export function scrobblesToTracks(entries: ScrobbleEntry[]): Track[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title || (e.kind === 'mbid' ? `MBID: ${e.identifier.slice(0, 13)}...` : e.kind === 'ipId' ? `ipId: ${e.identifier.slice(0, 10)}...` : `Unidentified track`),
    artist: e.artist || (e.kind === 'meta' ? 'Unknown' : 'Resolving...'),
    album: e.album || '',
    albumCover: e.albumCover,
    dateAdded: formatTimeAgo(e.playedAt),
    duration: '--:--',
    scrobbleStatus: e.status,
  }))
}

// ── MusicBrainz resolution (TODO) ──────────────────────────────────
// export async function resolveMBID(mbid: string): Promise<{ artist: string; title: string; album?: string }> {
//   const res = await fetch(`https://musicbrainz.org/ws/2/recording/${mbid}?inc=artists+releases&fmt=json`)
//   const data = await res.json()
//   return {
//     title: data.title,
//     artist: data['artist-credit']?.[0]?.name ?? 'Unknown',
//     album: data.releases?.[0]?.title,
//   }
// }
