import type { Track } from '@heaven/ui'
import { payloadToMbid } from './artist'

/**
 * Scrobble history — reads from Goldsky subgraph and resolves
 * track metadata from on-chain (V4 first, fallback to V3).
 *
 * The subgraph indexes:
 * - Track entities (from TrackRegistered events) — metadata on-chain
 * - Scrobble entities (from Scrobbled events) — linked to Track via trackId
 *
 * Each Scrobble has a `track` relation with the full metadata.
 */

const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/9.0.0/gn'

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
  durationSec: number       // track duration in seconds
  kind: number              // 1=MBID, 2=ipId, 3=meta
  payload: string           // raw derivation input (recording MBID hex for kind=1)
}

interface ScrobbleGQL {
  id: string
  user: string
  track: {
    id: string
    kind: number
    payload: string
    durationSec: number
  }
  timestamp: string
  blockTimestamp: string
  transactionHash: string
}

// ── Fetch ──────────────────────────────────────────────────────────

/**
 * Fetch scrobble history for a user from the activity subgraph.
 * Track metadata is resolved on-chain via getTrack() (V4, fallback V3).
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
        payload
        durationSec
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

  // Resolve track metadata from on-chain (V4 → V3 fallback)
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
      durationSec: s.track.durationSec ?? meta?.durationSec ?? 0,
      kind: s.track.kind,
      payload: s.track.payload ?? '',
    }
  })
}

/**
 * Convert ScrobbleEntry[] to Track[] for TrackList component.
 */
const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

/** Validate CID looks like an IPFS hash (Qm... or bafy...) */
function isValidCid(cid: string | undefined | null): cid is string {
  return !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'))
}

export function scrobblesToTracks(entries: ScrobbleEntry[]): Track[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    artist: e.artist,
    album: e.album,
    kind: e.kind,
    payload: e.payload,
    mbid: e.kind === 1 ? payloadToMbid(e.payload) ?? undefined : undefined,
    albumCover: isValidCid(e.coverCid)
      ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
    dateAdded: formatTimeAgo(e.playedAt),
    duration: formatDuration(e.durationSec),
    scrobbleStatus: (e.kind === 3 ? 'unidentified' : 'verified') as Track['scrobbleStatus'],
  }))
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Track metadata resolution (on-chain via MegaETH RPC) ──────────

const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'
const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0'
const SCROBBLE_V4 = '0x1D23Ad1c20ce54224fEffe8c2E112296C321451E'

interface TrackMeta {
  title: string
  artist: string
  album: string
  coverCid: string
  durationSec: number
  kind: number
  payload: string
}

async function batchGetTracks(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>()
  // cast sig "getTrack(bytes32)" → 0x82368a6b
  const selector = '0x82368a6b'

  const fetchFrom = async (contract: string, ids: string[]) => {
    const promises = ids.map(async (trackId) => {
      if (results.has(trackId)) return
      try {
        const data = selector + trackId.slice(2).padStart(64, '0')
        const result = await rpcCall('eth_call', [
          { to: contract, data },
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
  }

  await fetchFrom(SCROBBLE_V4, trackIds)
  const missing = trackIds.filter((id) => !results.has(id))
  if (missing.length > 0) {
    await fetchFrom(SCROBBLE_V3, missing)
  }

  return results
}

function decodeGetTrackResult(hex: string): TrackMeta | null {
  try {
    const data = hex.slice(2)
    // 8-tuple: (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid, uint32 durationSec)
    // Slots 0,1,2 = offsets for title/artist/album; 3 = kind (uint8); 4 = payload (bytes32); 5 = registeredAt; 6 = offset for coverCid; 7 = durationSec (uint32)
    const titleOffset = parseInt(data.slice(0, 64), 16) * 2
    const artistOffset = parseInt(data.slice(64, 128), 16) * 2
    const albumOffset = parseInt(data.slice(128, 192), 16) * 2
    const kind = parseInt(data.slice(192, 256), 16)           // slot 3: uint8
    const payload = '0x' + data.slice(256, 320)               // slot 4: bytes32
    const coverCidOffset = parseInt(data.slice(384, 448), 16) * 2 // slot 6
    const durationSec = parseInt(data.slice(448, 512), 16)    // slot 7: uint32
    return {
      title: decodeString(data, titleOffset),
      artist: decodeString(data, artistOffset),
      album: decodeString(data, albumOffset),
      coverCid: decodeString(data, coverCidOffset),
      durationSec,
      kind,
      payload,
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

export interface UploadedContentEntry {
  contentId: string
  trackId: string
  pieceCid: string
  datasetOwner: string
  title: string
  artist: string
  coverCid: string   // IPFS CID for album art (empty if none)
  uploadedAt: number // unix seconds
  algo: number       // 0 = plaintext, 1 = AES-GCM-256
  kind?: number
  payload?: string
  mbid?: string
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
      algo
      createdAt
    }
  }`

  const contentRes = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: contentQuery }),
  })
  if (!contentRes.ok) throw new Error(`Activity subgraph query failed: ${contentRes.status}`)
  const contentJson = await contentRes.json()
  const entries: Array<{
    id: string
    trackId: string
    pieceCid: string
    datasetOwner: string
    algo: number
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
      coverCid
      kind
      payload
    }
  }`

  const trackRes = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackQuery }),
  })

  const trackMap = new Map<string, { title: string; artist: string; coverCid: string; kind?: number; payload?: string }>()
  if (trackRes.ok) {
    const trackJson = await trackRes.json()
    for (const t of trackJson.data?.tracks ?? []) {
      trackMap.set(t.id, {
        title: t.title,
        artist: t.artist,
        coverCid: t.coverCid ?? '',
        kind: t.kind ?? undefined,
        payload: t.payload ?? undefined,
      })
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
    const mbid = meta?.kind === 1 && meta?.payload ? payloadToMbid(meta.payload) ?? undefined : undefined
    return {
      contentId: e.id,
      trackId: e.trackId,
      pieceCid,
      datasetOwner: e.datasetOwner,
      title: meta?.title || `Track ${e.trackId.slice(0, 10)}...`,
      artist: meta?.artist || 'Unknown',
      coverCid: meta?.coverCid ?? '',
      uploadedAt: parseInt(e.createdAt),
      algo: e.algo ?? 1, // default encrypted for legacy entries
      kind: meta?.kind,
      payload: meta?.payload,
      mbid,
    }
  })
}

// ── Shared content (content others granted me access to) ──────────

export interface SharedContentEntry extends UploadedContentEntry {
  sharedBy: string // content owner address
}

/**
 * Fetch content shared with a user (where they have an active access grant but aren't the owner).
 * Queries content-feed subgraph for AccessGrant entities.
 */
export async function fetchSharedContent(
  userAddress: string,
): Promise<SharedContentEntry[]> {
  const addr = userAddress.toLowerCase()

  // Query access grants where this user is the grantee
  const grantQuery = `{
    accessGrants(
      where: { grantee: "${addr}", granted: true }
      orderBy: updatedAt
      orderDirection: desc
      first: 100
    ) {
      content {
        id
        trackId
        pieceCid
        datasetOwner
        owner
        algo
        active
        createdAt
      }
    }
  }`

  const grantRes = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: grantQuery }),
  })
  if (!grantRes.ok) throw new Error(`Activity subgraph query failed: ${grantRes.status}`)
  const grantJson = await grantRes.json()
  const grants: Array<{
    content: {
      id: string
      trackId: string
      pieceCid: string
      datasetOwner: string
      owner: string
      algo: number
      active: boolean
      createdAt: string
    }
  }> = grantJson.data?.accessGrants ?? []

  // Filter out own content and inactive entries
  const entries = grants
    .map((g) => g.content)
    .filter((c) => c.active && c.owner.toLowerCase() !== addr)

  if (entries.length === 0) return []

  // Get track metadata from activity-feed subgraph
  const trackIds = [...new Set(entries.map((e) => e.trackId))]
  const trackQuery = `{
    tracks(where: { id_in: [${trackIds.map((id) => `"${id}"`).join(',')}] }) {
      id
      title
      artist
      coverCid
      kind
      payload
    }
  }`

  const trackRes = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackQuery }),
  })

  const trackMap = new Map<string, { title: string; artist: string; coverCid: string; kind?: number; payload?: string }>()
  if (trackRes.ok) {
    const trackJson = await trackRes.json()
    for (const t of trackJson.data?.tracks ?? []) {
      trackMap.set(t.id, {
        title: t.title,
        artist: t.artist,
        coverCid: t.coverCid ?? '',
        kind: t.kind ?? undefined,
        payload: t.payload ?? undefined,
      })
    }
  }

  return entries.map((e) => {
    const meta = trackMap.get(e.trackId)
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
    const mbid = meta?.kind === 1 && meta?.payload ? payloadToMbid(meta.payload) ?? undefined : undefined
    return {
      contentId: e.id,
      trackId: e.trackId,
      pieceCid,
      datasetOwner: e.datasetOwner,
      title: meta?.title || `Track ${e.trackId.slice(0, 10)}...`,
      artist: meta?.artist || 'Unknown',
      coverCid: meta?.coverCid ?? '',
      uploadedAt: parseInt(e.createdAt),
      algo: e.algo ?? 1,
      kind: meta?.kind,
      payload: meta?.payload,
      mbid,
      sharedBy: e.owner,
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
