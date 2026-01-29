const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/1.0.0/gn'

const IPFS_GATEWAY = 'https://w3s.link/ipfs'

/** Raw batch as returned by Goldsky subgraph */
export interface ScrobbleBatchGQL {
  id: string
  user: string
  startTs: string
  endTs: string
  count: number
  cid: string
  batchHash: string
  blockNumber: string
  blockTimestamp: string
  transactionHash: string
}

/** Single track from a batch JSON pinned to IPFS */
export interface ScrobbleTrack {
  raw: {
    artist: string
    title: string
    album?: string
    duration_ms?: number
    playedAt: number
    source?: string
  }
  normalized: {
    artist_norm: string
    title_norm: string
    album_norm: string
    duration_s: number
  }
  isrc?: string
  ipId?: string
  track_key: string
}

/** Batch JSON as pinned to IPFS */
interface BatchJSON {
  version: number
  user: string
  startTs: string
  endTs: string
  count: number
  tracks: ScrobbleTrack[]
}

/** Flattened track for display */
export interface ScrobbleEntry {
  id: string
  artist: string
  title: string
  album: string
  duration: string
  playedAt: number
  cid: string
  txHash: string
  trackKey: string
  isrc?: string
  ipId?: string
}

/**
 * Fetch scrobble batches for a user from Goldsky subgraph.
 */
export async function fetchScrobbleBatches(
  userAddress: string,
  first = 50,
): Promise<ScrobbleBatchGQL[]> {
  const query = `{
    scrobbleBatches(
      where: { user: "${userAddress.toLowerCase()}" }
      orderBy: blockTimestamp
      orderDirection: desc
      first: ${first}
    ) {
      id
      user
      startTs
      endTs
      count
      cid
      batchHash
      blockNumber
      blockTimestamp
      transactionHash
    }
  }`

  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()
  return json.data?.scrobbleBatches ?? []
}

/**
 * Fetch batch JSON from IPFS and extract tracks.
 */
async function fetchBatchTracks(cid: string): Promise<ScrobbleTrack[]> {
  const res = await fetch(`${IPFS_GATEWAY}/${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`)
  const batch: BatchJSON = await res.json()
  return batch.tracks
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

/**
 * Fetch all scrobbles for a user, flattened into individual tracks.
 * Returns newest first.
 */
export async function fetchScrobbleEntries(
  userAddress: string,
  first = 50,
): Promise<ScrobbleEntry[]> {
  const batches = await fetchScrobbleBatches(userAddress, first)

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const tracks = await fetchBatchTracks(batch.cid)
      return tracks.map(
        (t, i): ScrobbleEntry => ({
          id: `${batch.id}-${i}`,
          artist: t.raw.artist,
          title: t.raw.title,
          album: t.raw.album ?? '',
          duration: t.normalized.duration_s
            ? formatDuration(t.normalized.duration_s)
            : '--:--',
          playedAt: t.raw.playedAt,
          cid: batch.cid,
          txHash: batch.transactionHash,
          trackKey: t.track_key,
          isrc: t.isrc,
          ipId: t.ipId,
        }),
      )
    }),
  )

  const entries: ScrobbleEntry[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') entries.push(...r.value)
  }

  // Sort by playedAt descending (newest first)
  entries.sort((a, b) => b.playedAt - a.playedAt)
  return entries
}

/**
 * Convert ScrobbleEntry[] to Track[] for TrackList component.
 */
export function scrobblesToTracks(
  entries: ScrobbleEntry[],
): Array<{
  id: string
  title: string
  artist: string
  album: string
  dateAdded: string
  duration: string
}> {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    artist: e.artist,
    album: e.album,
    dateAdded: formatTimeAgo(e.playedAt),
    duration: e.duration,
  }))
}
