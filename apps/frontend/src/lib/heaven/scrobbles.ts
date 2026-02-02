import type { Track } from '@heaven/ui'

/**
 * ScrobbleV3 — reads scrobble history from Goldsky subgraph.
 *
 * The subgraph indexes:
 * - Track entities (from TrackRegistered events) — metadata on-chain
 * - Scrobble entities (from Scrobbled events) — linked to Track via trackId
 *
 * Each Scrobble has a `track` relation with the full metadata.
 */

const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/5.0.0/gn'

// ── Types ──────────────────────────────────────────────────────────

export interface ScrobbleEntry {
  id: string
  trackId: string
  playedAt: number          // unix seconds
  txHash: string
  artist: string
  title: string
  album: string
  coverCid: string          // IPFS CID for album art (empty if none)
  kind: number              // 1=MBID, 2=ipId, 3=meta
}

interface ScrobbleGQL {
  id: string
  user: string
  track: {
    id: string
    kind: number
  }
  timestamp: string
  blockTimestamp: string
  transactionHash: string
}

// ── Fetch ──────────────────────────────────────────────────────────

/**
 * Fetch scrobble history for a user from the V3 subgraph.
 * Track metadata is resolved on-chain via getTrack() since the subgraph
 * only stores trackId/kind/payload (not the display strings).
 */
export async function fetchScrobbleEntries(
  userAddress: string,
  maxEntries = 100,
): Promise<ScrobbleEntry[]> {
  const addr = userAddress.toLowerCase()

  const query = `{
    scrobbles(
      where: { user: "${addr}" }
      orderBy: timestamp
      orderDirection: desc
      first: ${maxEntries}
    ) {
      id
      user
      track {
        id
        kind
      }
      timestamp
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

  const scrobbles: ScrobbleGQL[] = json.data?.scrobbles ?? []
  if (scrobbles.length === 0) return []

  // Resolve track metadata from on-chain (subgraph doesn't store display strings)
  const uniqueTrackIds = [...new Set(scrobbles.map((s) => s.track.id))]
  const trackMeta = await batchGetTracks(uniqueTrackIds)

  return scrobbles.map((s) => {
    const meta = trackMeta.get(s.track.id)
    return {
      id: s.id,
      trackId: s.track.id,
      playedAt: parseInt(s.timestamp),
      txHash: s.transactionHash,
      artist: meta?.artist ?? 'Unknown',
      title: meta?.title ?? `Track ${s.track.id.slice(0, 10)}...`,
      album: meta?.album ?? '',
      coverCid: meta?.coverCid ?? '',
      kind: s.track.kind,
    }
  })
}

/**
 * Convert ScrobbleEntry[] to Track[] for TrackList component.
 */
const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

export function scrobblesToTracks(entries: ScrobbleEntry[]): Track[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    artist: e.artist,
    album: e.album,
    albumCover: e.coverCid
      ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
    dateAdded: formatTimeAgo(e.playedAt),
    duration: '--:--',
    scrobbleStatus: 'verified' as const,
  }))
}

// ── Track metadata resolution (on-chain via MegaETH RPC) ──────────

const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'
const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0'

interface TrackMeta {
  title: string
  artist: string
  album: string
  coverCid: string
}

async function batchGetTracks(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>()
  // cast sig "getTrack(bytes32)" → 0x82368a6b
  const selector = '0x82368a6b'

  const promises = trackIds.map(async (trackId) => {
    try {
      const data = selector + trackId.slice(2).padStart(64, '0')
      const result = await rpcCall('eth_call', [
        { to: SCROBBLE_V3, data },
        'latest',
      ])
      if (result && result !== '0x' && result.length > 66) {
        const decoded = decodeGetTrackResult(result)
        if (decoded) results.set(trackId, decoded)
      }
    } catch {
      // Skip failed lookups
    }
  })

  await Promise.all(promises)
  return results
}

function decodeGetTrackResult(hex: string): TrackMeta | null {
  try {
    const data = hex.slice(2)
    // 7-tuple: (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid)
    // Slots 0,1,2 = offsets for title/artist/album; 3,4,5 = static; 6 = offset for coverCid
    const titleOffset = parseInt(data.slice(0, 64), 16) * 2
    const artistOffset = parseInt(data.slice(64, 128), 16) * 2
    const albumOffset = parseInt(data.slice(128, 192), 16) * 2
    const coverCidOffset = parseInt(data.slice(384, 448), 16) * 2 // slot 6
    return {
      title: decodeString(data, titleOffset),
      artist: decodeString(data, artistOffset),
      album: decodeString(data, albumOffset),
      coverCid: decodeString(data, coverCidOffset),
    }
  } catch {
    return null
  }
}

function decodeString(data: string, offset: number): string {
  const len = parseInt(data.slice(offset, offset + 64), 16)
  if (len === 0) return ''
  const hexStr = data.slice(offset + 64, offset + 64 + len * 2)
  const bytes = new Uint8Array(hexStr.length / 2)
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.slice(i, i + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(MEGAETH_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`RPC failed: ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`RPC error: ${json.error.message}`)
  return json.result
}

// ── Uploaded content (cross-device via subgraphs) ─────────────────

const CONTENT_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-content/1.0.0/gn'

export interface UploadedContentEntry {
  contentId: string
  trackId: string
  pieceCid: string
  datasetOwner: string
  title: string
  artist: string
  uploadedAt: number // unix seconds
}

/**
 * Fetch all content uploaded by a user, with track metadata.
 * Queries content-feed subgraph for ownership, activity-feed for title/artist.
 */
export async function fetchUploadedContent(
  userAddress: string,
): Promise<UploadedContentEntry[]> {
  const addr = userAddress.toLowerCase()

  // Step 1: Get content entries owned by this user
  const contentQuery = `{
    contentEntries(
      where: { owner: "${addr}", active: true }
      orderBy: createdAt
      orderDirection: desc
      first: 100
    ) {
      id
      trackId
      pieceCid
      datasetOwner
      createdAt
    }
  }`

  const contentRes = await fetch(CONTENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: contentQuery }),
  })
  if (!contentRes.ok) throw new Error(`Content subgraph query failed: ${contentRes.status}`)
  const contentJson = await contentRes.json()
  const entries: Array<{
    id: string
    trackId: string
    pieceCid: string
    datasetOwner: string
    createdAt: string
  }> = contentJson.data?.contentEntries ?? []

  if (entries.length === 0) return []

  // Step 2: Get track metadata from activity-feed subgraph
  const trackIds = [...new Set(entries.map((e) => e.trackId))]
  const trackQuery = `{
    tracks(where: { id_in: [${trackIds.map((id) => `"${id}"`).join(',')}] }) {
      id
      title
      artist
    }
  }`

  const trackRes = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackQuery }),
  })

  const trackMap = new Map<string, { title: string; artist: string }>()
  if (trackRes.ok) {
    const trackJson = await trackRes.json()
    for (const t of trackJson.data?.tracks ?? []) {
      trackMap.set(t.id, { title: t.title, artist: t.artist })
    }
  }

  // Step 3: Join
  return entries.map((e) => {
    const meta = trackMap.get(e.trackId)
    // pieceCid from subgraph is hex-encoded bytes (Bytes type) — decode to UTF-8 string.
    // If it's already a plain CID string (no 0x prefix, not valid hex), use as-is.
    let pieceCid = e.pieceCid
    if (e.pieceCid.startsWith('0x')) {
      try {
        const hex = e.pieceCid.slice(2)
        if (hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
          const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)))
          pieceCid = new TextDecoder().decode(bytes)
        }
      } catch {
        // Fall back to raw value
      }
    }
    return {
      contentId: e.id,
      trackId: e.trackId,
      pieceCid,
      datasetOwner: e.datasetOwner,
      title: meta?.title || `Track ${e.trackId.slice(0, 10)}...`,
      artist: meta?.artist || 'Unknown',
      uploadedAt: parseInt(e.createdAt),
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}
