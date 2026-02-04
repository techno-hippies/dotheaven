import type { Track } from '@heaven/ui'
import { getCoverCache } from '../cover-cache'

/**
 * PlaylistV1 — reads playlist data from Goldsky subgraph + on-chain track metadata.
 *
 * Subgraph indexes PlaylistCreated, PlaylistTracksSet, PlaylistMetaUpdated, PlaylistDeleted
 * from PlaylistV1 on MegaETH (chain 6343).
 *
 * Track display strings (title/artist/album) live on ScrobbleV3 (getTrack),
 * resolved via MegaETH RPC — same pattern as scrobbles.ts.
 */

const PLAYLIST_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn'

const CONTENT_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-content/1.0.0/gn'

const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'
const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0'
const PLAYLIST_V1 = '0xF0337C4A335cbB3B31c981945d3bE5B914F7B329'

// ── Types ──────────────────────────────────────────────────────────

export interface OnChainPlaylist {
  id: string               // bytes32 hex
  owner: string            // address
  name: string
  coverCid: string
  visibility: number       // 0=public, 1=unlisted, 2=private
  trackCount: number
  version: number
  exists: boolean
  tracksHash: string
  createdAt: number        // unix seconds
  updatedAt: number
}

export interface OnChainPlaylistTrack {
  trackId: string          // bytes32
  position: number
}

interface TrackMeta {
  title: string
  artist: string
  album: string
  coverCid: string
}

// ── Subgraph Queries ───────────────────────────────────────────────

export async function fetchUserPlaylists(
  ownerAddress: string,
  maxEntries = 50,
): Promise<OnChainPlaylist[]> {
  const addr = ownerAddress.toLowerCase()

  const query = `{
    playlists(
      where: { owner: "${addr}", exists: true }
      orderBy: updatedAt
      orderDirection: desc
      first: ${maxEntries}
    ) {
      id
      owner
      name
      coverCid
      visibility
      trackCount
      version
      exists
      tracksHash
      createdAt
      updatedAt
    }
  }`

  const res = await fetch(PLAYLIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()

  const playlists = json.data?.playlists ?? []
  return playlists.map(mapPlaylist)
}

export async function fetchPlaylist(playlistId: string): Promise<OnChainPlaylist | null> {
  const query = `{
    playlist(id: "${playlistId.toLowerCase()}") {
      id
      owner
      name
      coverCid
      visibility
      trackCount
      version
      exists
      tracksHash
      createdAt
      updatedAt
    }
  }`

  const res = await fetch(PLAYLIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()

  const p = json.data?.playlist
  if (!p) return null
  return mapPlaylist(p)
}

/** Fetch playlist metadata + resolved tracks in one shot (parallel). */
export async function fetchPlaylistWithTracks(
  playlistId: string,
): Promise<{ playlist: OnChainPlaylist; tracks: Track[] } | null> {
  // Single subgraph request for both playlist + tracks
  const id = playlistId.toLowerCase()
  const query = `{
    playlist(id: "${id}") {
      id owner name coverCid visibility trackCount version exists tracksHash createdAt updatedAt
    }
    playlistTracks(
      where: { playlist: "${id}" }
      orderBy: position
      orderDirection: asc
      first: 1000
    ) {
      trackId position
    }
  }`

  const res = await fetch(PLAYLIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()

  const p = json.data?.playlist
  if (!p) return null

  const rawTracks: OnChainPlaylistTrack[] = (json.data?.playlistTracks ?? []).map((t: any) => ({
    trackId: t.trackId,
    position: t.position,
  }))

  const tracks = await resolvePlaylistTracks(rawTracks)

  return { playlist: mapPlaylist(p), tracks }
}

export async function fetchPlaylistTracks(
  playlistId: string,
): Promise<OnChainPlaylistTrack[]> {
  const query = `{
    playlistTracks(
      where: { playlist: "${playlistId.toLowerCase()}" }
      orderBy: position
      orderDirection: asc
      first: 1000
    ) {
      trackId
      position
    }
  }`

  const res = await fetch(PLAYLIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()

  return (json.data?.playlistTracks ?? []).map((t: any) => ({
    trackId: t.trackId,
    position: t.position,
  }))
}

// ── Track Metadata Resolution (on-chain via ScrobbleV3) ────────────

export async function resolvePlaylistTracks(
  playlistTracks: OnChainPlaylistTrack[],
): Promise<Track[]> {
  if (playlistTracks.length === 0) return []

  const uniqueIds = [...new Set(playlistTracks.map((t) => t.trackId))]
  const [metaMap, contentMap] = await Promise.all([
    batchGetTracks(uniqueIds),
    batchGetContentMeta(uniqueIds),
  ])

  return playlistTracks.map((pt) => {
    const meta = metaMap.get(pt.trackId)
    const content = contentMap.get(pt.trackId)
    const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'
    const title = meta?.title ?? `Track ${pt.trackId.slice(0, 10)}...`
    const artist = meta?.artist ?? 'Unknown'
    const album = meta?.album ?? ''
    const onChainCover = meta?.coverCid
      ? `${FILEBASE_GATEWAY}/${meta.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined
    // Only try local cover cache if we have real metadata (not fallback strings)
    const localCover = meta ? getCoverCache(artist, title, album) : undefined
    return {
      id: pt.trackId,
      title,
      artist,
      album,
      albumCover: onChainCover ?? localCover,
      duration: '--:--',
      ...(content ? {
        contentId: content.contentId,
        pieceCid: content.pieceCid,
        datasetOwner: content.datasetOwner,
        algo: content.algo,
      } : {}),
    }
  })
}

// ── On-Chain Nonce (for write operations) ──────────────────────────

export async function getUserNonce(userAddress: string): Promise<number> {
  // cast sig "userNonces(address)" → 0x2f7801f4
  const selector = '0x2f7801f4'
  const data = selector + userAddress.slice(2).toLowerCase().padStart(64, '0')

  const result = await rpcCall('eth_call', [
    { to: PLAYLIST_V1, data },
    'latest',
  ])
  return parseInt(result, 16)
}

// ── Helpers ────────────────────────────────────────────────────────

function mapPlaylist(p: any): OnChainPlaylist {
  return {
    id: p.id,
    owner: p.owner,
    name: p.name,
    coverCid: p.coverCid,
    visibility: p.visibility,
    trackCount: Number(p.trackCount) || 0,
    version: Number(p.version) || 0,
    exists: p.exists,
    tracksHash: p.tracksHash,
    createdAt: parseInt(p.createdAt),
    updatedAt: parseInt(p.updatedAt),
  }
}

async function batchGetTracks(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>()
  // getTrack(bytes32) → 0x82368a6b
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

interface ContentMeta {
  contentId: string
  pieceCid: string
  datasetOwner: string
  algo: number
}

/** Batch-fetch cloud content metadata for a set of trackIds from the content-feed subgraph. */
async function batchGetContentMeta(trackIds: string[]): Promise<Map<string, ContentMeta>> {
  const results = new Map<string, ContentMeta>()
  if (trackIds.length === 0) return results

  const ids = trackIds.map((id) => `"${id.toLowerCase()}"`).join(',')
  const query = `{
    contentEntries(
      where: { trackId_in: [${ids}], active: true }
      first: 1000
    ) {
      id
      trackId
      pieceCid
      datasetOwner
      algo
    }
  }`

  try {
    const res = await fetch(CONTENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return results
    const json = await res.json()
    const entries: Array<{
      id: string
      trackId: string
      pieceCid: string
      datasetOwner: string
      algo: number
    }> = json.data?.contentEntries ?? []

    for (const e of entries) {
      // Only take the first content entry per trackId (in case of duplicates)
      if (results.has(e.trackId)) continue

      // pieceCid from subgraph is hex-encoded Bytes — decode to UTF-8 string
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

      results.set(e.trackId, {
        contentId: e.id,
        pieceCid,
        datasetOwner: e.datasetOwner,
        algo: e.algo ?? 1,
      })
    }
  } catch {
    // Content subgraph unavailable — degrade gracefully (no cloud playback)
  }

  return results
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
