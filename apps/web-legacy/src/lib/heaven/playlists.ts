import type { Track } from '@heaven/ui'
import { MEGAETH_RPC, PLAYLIST_V1, SCROBBLE_V3, SCROBBLE_V4, SUBGRAPH_MUSIC_SOCIAL, SUBGRAPH_PLAYLISTS } from '@heaven/core'
import { encodeAbiParameters, keccak256 } from 'viem'
import { getCoverCache, getCoverCacheById } from '../cover-cache'
import { payloadToMbid } from './artist'
import { resolveCoverUrl } from './cover-ref'

/**
 * PlaylistV1 — reads playlist data from Goldsky subgraph + on-chain track metadata.
 *
 * Subgraph indexes PlaylistCreated, PlaylistTracksSet, PlaylistMetaUpdated, PlaylistDeleted
 * from PlaylistV1 on MegaETH (chain 6343).
 *
 * Track display strings (title/artist/album) live on ScrobbleV4 (getTrack),
 * resolved via MegaETH RPC — same pattern as scrobbles.ts.
 */

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

export interface PlaylistShareEntry {
  id: string
  playlistId: string       // bytes32 hex
  owner: string            // address
  grantee: string          // address
  granted: boolean
  playlistVersion: number
  trackCount: number
  tracksHash: string
  sharedAt: number         // unix seconds
  updatedAt: number        // unix seconds
  playlist: OnChainPlaylist
}

interface TrackMeta {
  title: string
  artist: string
  album: string
  coverCid: string
  metaHash?: string
  kind: number
  payload: string
  durationSec: number
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

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
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

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
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

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
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

  const tracks = await resolvePlaylistTracks(rawTracks, p.owner)

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

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
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

export async function fetchSharedPlaylists(
  granteeAddress: string,
  maxEntries = 50,
): Promise<PlaylistShareEntry[]> {
  const addr = granteeAddress.toLowerCase()

  const query = `{
    playlistShares(
      where: { grantee: "${addr}", granted: true }
      orderBy: updatedAt
      orderDirection: desc
      first: ${maxEntries}
    ) {
      id
      playlistId
      owner
      grantee
      granted
      playlistVersion
      trackCount
      tracksHash
      sharedAt
      updatedAt
      playlist {
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
    }
  }`

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()

  const shares = json.data?.playlistShares ?? []
  return shares
    .filter((s: any) => s?.playlist)
    .map((s: any) => ({
      id: s.id,
      playlistId: s.playlistId,
      owner: s.owner,
      grantee: s.grantee,
      granted: !!s.granted,
      playlistVersion: Number(s.playlistVersion) || 0,
      trackCount: Number(s.trackCount) || 0,
      tracksHash: s.tracksHash,
      sharedAt: parseInt(s.sharedAt),
      updatedAt: parseInt(s.updatedAt),
      playlist: mapPlaylist(s.playlist),
    }))
}

/** Fetch playlist metadata + resolved tracks for a specific tracksHash checkpoint. */
export async function fetchPlaylistWithTracksAtCheckpoint(
  playlistId: string,
  tracksHash: string,
  asOfVersion?: number,
): Promise<{ playlist: OnChainPlaylist; tracks: Track[] } | null> {
  const id = playlistId.toLowerCase()
  const h = tracksHash.toLowerCase()
  const versionFilter = Number.isFinite(asOfVersion as any) ? `, version_lte: ${asOfVersion}` : ''

  const query = `{
    playlist(id: "${id}") {
      id owner name coverCid visibility trackCount version exists tracksHash createdAt updatedAt
    }
    playlistTrackVersions(
      where: { playlist: "${id}", tracksHash: "${h}"${versionFilter} }
      orderBy: version
      orderDirection: desc
      first: 1000
    ) {
      version
      trackId
      position
    }
  }`

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`)
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'Goldsky query failed')
  }

  const p = json.data?.playlist
  if (!p) return null

  const versioned: Array<{ version: number; trackId: string; position: number }> =
    (json.data?.playlistTrackVersions ?? []).map((t: any) => ({
      version: Number(t.version) || 0,
      trackId: t.trackId,
      position: t.position,
    }))

  const selectedVersion = versioned.length > 0
    ? Math.max(...versioned.map((t) => t.version))
    : 0

  const rawTracks: OnChainPlaylistTrack[] = versioned
    .filter((t) => t.version === selectedVersion)
    .sort((a, b) => a.position - b.position)
    .map((t) => ({ trackId: t.trackId, position: t.position }))

  const tracks = await resolvePlaylistTracks(rawTracks, p.owner)

  return { playlist: mapPlaylist(p), tracks }
}

// ── Track Metadata Resolution (on-chain via ScrobbleV4) ────────────

export async function resolvePlaylistTracks(
  playlistTracks: OnChainPlaylistTrack[],
  contentOwner?: string,
): Promise<Track[]> {
  if (playlistTracks.length === 0) return []

  const uniqueIds = [...new Set(playlistTracks.map((t) => t.trackId.toLowerCase()))]
  const [metaMap, contentMap] = await Promise.all([
    batchGetTracks(uniqueIds),
    batchGetContentMeta(uniqueIds, contentOwner),
  ])

  // If the playlist references a trackId that has no active ContentEntry for this owner (common
  // when the same title/artist/album exists under multiple trackIds), try to find an alias
  // content entry by matching metaHash across tracks.
  if (contentOwner) {
    const missingContent = uniqueIds.filter((id) => metaMap.has(id) && !contentMap.has(id))
    if (missingContent.length > 0) {
      const alias = await backfillContentMetaByMetaHash(missingContent, metaMap, contentOwner)
      for (const [trackId, meta] of alias) {
        contentMap.set(trackId, meta)
      }
      if (import.meta.env.DEV && alias.size > 0) {
        console.log('[playlists] Backfilled content meta via metaHash', {
          owner: contentOwner.toLowerCase(),
          filled: alias.size,
          missingBefore: missingContent.length,
        })
      }
    }
  }

  return playlistTracks.map((pt) => {
    const id = pt.trackId.toLowerCase()
    const meta = metaMap.get(id)
    const content = contentMap.get(id)
    const title = meta?.title ?? `Track ${id.slice(0, 10)}...`
    const artist = meta?.artist ?? 'Unknown'
    const album = meta?.album ?? ''
    const kind = meta?.kind
    const payload = meta?.payload
    const mbid = kind === 1 && payload ? payloadToMbid(payload) ?? undefined : undefined
    const onChainCover = resolveCoverUrl(meta?.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 })
    const localCover = getCoverCacheById(id) ?? (meta ? getCoverCache(artist, title, album) : undefined)
    return {
      id,
      title,
      artist,
      album,
      kind,
      payload,
      mbid,
      albumCover: onChainCover ?? localCover,
      duration: formatDuration(meta?.durationSec ?? 0),
      ...(content ? {
        contentId: content.contentId,
        pieceCid: content.pieceCid,
        datasetOwner: content.datasetOwner,
        algo: content.algo,
      } : {}),
    }
  })
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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
    coverCid: decodeBytesUtf8(p.coverCid ?? ''),
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
  if (trackIds.length === 0) return results

  const normalizedIds = trackIds.map((id) => id.toLowerCase())
  const ids = normalizedIds.map((id) => `"${id}"`).join(',')
  const query = `{
    tracks(
      where: { id_in: [${ids}] }
      first: 1000
    ) {
      id
      title
      artist
      album
      kind
      payload
      coverCid
      metaHash
      durationSec
    }
  }`

  try {
    const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return results
    const json = await res.json()
    const tracks: Array<{
      id: string
      title: string
      artist: string
      album: string
      kind: number
      payload: string
      coverCid: string | null
      metaHash: string | null
      durationSec: number | null
    }> = json.data?.tracks ?? []

    for (const t of tracks) {
      const id = t.id.toLowerCase()
      results.set(id, {
        title: t.title,
        artist: t.artist,
        album: t.album ?? '',
        coverCid: decodeBytesUtf8(t.coverCid ?? ''),
        metaHash: t.metaHash?.toLowerCase() ?? undefined,
        kind: t.kind,
        payload: t.payload,
        durationSec: t.durationSec ?? 0,
      })
    }
  } catch {
    // Subgraph unavailable — degrade gracefully
  }

  // If the subgraph hasn't indexed yet, fall back to on-chain reads (same pattern as scrobbles.ts).
  const missing = normalizedIds.filter((id) => !results.has(id))
  if (missing.length > 0) {
    if (import.meta.env.DEV) {
      console.log('[playlists] Track meta missing from subgraph; falling back on-chain', {
        missing: missing.slice(0, 12),
        missingCount: missing.length,
      })
    }
    const onChain = await batchGetTracksOnChain(missing)
    for (const [id, meta] of onChain) {
      results.set(id, meta)
    }
    if (import.meta.env.DEV) {
      console.log('[playlists] On-chain track meta resolved', {
        resolved: onChain.size,
        stillMissing: missing.length - onChain.size,
      })
    }
  }

  // Backfill missing covers via metaHash (duplicate track IDs can carry the cover art).
  try {
    const missingCoverMeta = new Set<string>()
    for (const [, meta] of results) {
      if (meta.coverCid) continue
      const mh = (meta.metaHash ?? computeMetaHash(meta)).toLowerCase()
      meta.metaHash = mh
      if (mh) missingCoverMeta.add(mh)
    }

    if (missingCoverMeta.size > 0) {
      const quoted = [...missingCoverMeta].map((m) => `"${m}"`).join(',')
      const coverQuery = `{
        tracks(where: { metaHash_in: [${quoted}], coverCid_not: null }, first: 1000) {
          metaHash
          coverCid
        }
      }`
      const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: coverQuery }),
      })
      if (res.ok) {
        const json = await res.json()
        const coverTracks: Array<{ metaHash: string; coverCid: string | null }> = json.data?.tracks ?? []
        const coverByMetaHash = new Map<string, string>()
        for (const t of coverTracks) {
          const mh = (t.metaHash ?? '').toLowerCase()
          const cv = decodeBytesUtf8(t.coverCid ?? '').trim()
          if (!mh || !cv) continue
          if (!coverByMetaHash.has(mh)) coverByMetaHash.set(mh, cv)
        }

        if (coverByMetaHash.size > 0) {
          let filled = 0
          for (const [id, meta] of results) {
            if (meta.coverCid) continue
            const mh = meta.metaHash ?? ''
            const cv = coverByMetaHash.get(mh)
            if (!cv) continue
            meta.coverCid = cv
            results.set(id, meta)
            filled += 1
          }
          if (import.meta.env.DEV && filled > 0) {
            console.log('[playlists] Backfilled coverCid via metaHash', { filled })
          }
        }
      }
    }
  } catch {
    // ignore cover backfill errors
  }

  return results
}

function computeMetaHash(meta: Pick<TrackMeta, 'title' | 'artist' | 'album'>): string {
  // Must match the contract computation: keccak256(abi.encode(title, artist, album))
  // using the exact stored strings (no additional normalization here).
  return keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
      [meta.title ?? '', meta.artist ?? '', meta.album ?? ''],
    ),
  )
}

function decodeBytesUtf8(value: string): string {
  // Bytes fields from subgraph are often returned as 0x-hex encoded UTF-8.
  if (!value.startsWith('0x')) return value
  try {
    const hex = value.slice(2)
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return value
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return value
  }
}

function decodePieceCid(value: string): string {
  return decodeBytesUtf8(value)
}

async function backfillContentMetaByMetaHash(
  missingTrackIds: string[],
  metaMap: Map<string, TrackMeta>,
  contentOwner: string,
): Promise<Map<string, ContentMeta>> {
  const out = new Map<string, ContentMeta>()
  if (missingTrackIds.length === 0) return out

  const metaHashByTrackId = new Map<string, string>()

  for (const rawId of missingTrackIds) {
    const id = rawId.toLowerCase()
    const meta = metaMap.get(id)
    if (!meta || !meta.title || !meta.artist) continue
    const mh = (meta.metaHash ?? computeMetaHash(meta)).toLowerCase()
    meta.metaHash = mh
    metaHashByTrackId.set(id, mh)
  }

  const owner = contentOwner.toLowerCase()
  let byMetaHash = ownerContentByMetaHashCache.get(owner)
  if (!byMetaHash) {
    byMetaHash = await buildOwnerContentByMetaHash(owner)
    ownerContentByMetaHashCache.set(owner, byMetaHash)
  }

  for (const rawId of missingTrackIds) {
    const id = rawId.toLowerCase()
    const mh = metaHashByTrackId.get(id)
    if (!mh) continue
    const c = byMetaHash.get(mh)
    if (c) out.set(id, c)
  }

  return out
}

const ownerContentByMetaHashCache = new Map<string, Map<string, ContentMeta>>()

async function buildOwnerContentByMetaHash(ownerAddress: string): Promise<Map<string, ContentMeta>> {
  const owner = ownerAddress.toLowerCase()

  const query = `{
    contentEntries(
      where: { owner: "${owner}", active: true }
      orderBy: createdAt
      orderDirection: desc
      first: 1000
    ) {
      id
      trackId
      pieceCid
      datasetOwner
      algo
      createdAt
    }
  }`

  const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return new Map()
  const json = await res.json()

  const entries: Array<{
    id: string
    trackId: string
    pieceCid: string
    datasetOwner: string
    algo: number
    createdAt: string
  }> = json.data?.contentEntries ?? []

  if (entries.length === 0) return new Map()

  const byTrackId = new Map<string, ContentMeta>()
  for (const e of entries) {
    const trackId = e.trackId.toLowerCase()
    if (byTrackId.has(trackId)) continue
    byTrackId.set(trackId, {
      contentId: e.id,
      pieceCid: decodePieceCid(e.pieceCid),
      datasetOwner: e.datasetOwner,
      algo: e.algo ?? 1,
    })
  }

  const trackIds = [...byTrackId.keys()]
  const trackMeta = await batchGetTracks(trackIds)

  const out = new Map<string, ContentMeta>()
  const scores = new Map<string, number>()

  for (const trackId of trackIds) {
    const meta = trackMeta.get(trackId)
    const content = byTrackId.get(trackId)
    if (!meta || !content) continue

    const mh = (meta.metaHash ?? computeMetaHash(meta)).toLowerCase()
    meta.metaHash = mh
    const score = (meta.durationSec > 0 ? 1 : 0) + (meta.coverCid ? 1 : 0)
    const prevScore = scores.get(mh)

    // Entries are already ordered by createdAt desc; only replace when the candidate has better
    // track metadata (duration/cover) so UI looks consistent.
    if (prevScore === undefined || score > prevScore) {
      scores.set(mh, score)
      out.set(mh, content)
    }
  }

  return out
}

async function batchGetTracksOnChain(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>()
  if (trackIds.length === 0) return results

  // cast sig "getTrack(bytes32)" → 0x82368a6b
  const selector = '0x82368a6b'

  const fetchFrom = async (contract: string, ids: string[]) => {
    // Chunk to avoid 100s of concurrent fetches if the subgraph is down.
    const CHUNK = 20
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (trackId) => {
        const id = trackId.toLowerCase()
        if (results.has(id)) return
        if (!/^0x[0-9a-f]{64}$/.test(id)) return
        try {
          const data = selector + id.slice(2).padStart(64, '0')
          const result = await rpcCall('eth_call', [{ to: contract, data }, 'latest'])
          if (!result || result === '0x' || typeof result !== 'string' || result.length <= 66) return
          const decoded = decodeGetTrackResult(result)
          if (decoded) results.set(id, decoded)
        } catch {
          // Skip failed lookups
        }
      }))
    }
  }

  await fetchFrom(SCROBBLE_V4, trackIds)
  const missing = trackIds.map((id) => id.toLowerCase()).filter((id) => !results.has(id))
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
    const kind = parseInt(data.slice(192, 256), 16)               // slot 3: uint8
    const payload = '0x' + data.slice(256, 320)                   // slot 4: bytes32
    const coverCidOffset = parseInt(data.slice(384, 448), 16) * 2 // slot 6
    const durationSec = parseInt(data.slice(448, 512), 16)        // slot 7: uint32
    const meta: TrackMeta = {
      title: decodeAbiString(data, titleOffset),
      artist: decodeAbiString(data, artistOffset),
      album: decodeAbiString(data, albumOffset),
      coverCid: decodeAbiString(data, coverCidOffset),
      durationSec,
      kind,
      payload,
    }
    meta.metaHash = computeMetaHash(meta).toLowerCase()
    return meta
  } catch {
    return null
  }
}

function decodeAbiString(data: string, offset: number): string {
  const len = parseInt(data.slice(offset, offset + 64), 16)
  if (len === 0) return ''
  const hexStr = data.slice(offset + 64, offset + 64 + len * 2)
  const bytes = new Uint8Array(hexStr.length / 2)
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.slice(i, i + 2), 16)
  }
  return new TextDecoder().decode(bytes).replace(/\0/g, '')
}

interface ContentMeta {
  contentId: string
  pieceCid: string
  datasetOwner: string
  algo: number
}

/** Batch-fetch cloud content metadata for a set of trackIds from the content-feed subgraph. */
async function batchGetContentMeta(trackIds: string[], contentOwner?: string): Promise<Map<string, ContentMeta>> {
  const results = new Map<string, ContentMeta>()
  if (trackIds.length === 0) return results

  const ids = trackIds.map((id) => `"${id.toLowerCase()}"`).join(',')
  const ownerClause = contentOwner ? `owner: "${contentOwner.toLowerCase()}",` : ''
  const query = `{
    contentEntries(
      where: { ${ownerClause} trackId_in: [${ids}], active: true }
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
    const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
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
      const trackId = e.trackId.toLowerCase()
      // Only take the first content entry per trackId (in case of duplicates)
      if (results.has(trackId)) continue

      const pieceCid = decodePieceCid(e.pieceCid)

      results.set(trackId, {
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
