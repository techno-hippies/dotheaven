/**
 * PlaylistService — calls the playlist-v1 Lit Action for on-chain playlist CRUD.
 *
 * Follows the same pattern as scrobble-service.ts:
 * 1. Compute trackIds (same algorithm as Lit Action)
 * 2. Sign EIP-191 message with user PKP
 * 3. Execute Lit Action (IPFS CID) with signature + params
 * 4. Return result
 */

import { keccak256, encodeAbiParameters, padHex } from 'viem'
import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'
import { getUserNonce } from './heaven/playlists'

const PLAYLIST_V1_CID = 'QmdpkcmCsStUM5nYz7ffxRoS2oStUY37bEsnkN7ebPunUt'

// ── Types ──────────────────────────────────────────────────────────

export interface TrackInput {
  artist: string
  title: string
  album?: string
  mbid?: string
  ipId?: string
}

export interface PlaylistResult {
  success: boolean
  playlistId?: string
  txHash?: string
  version?: number
  registered?: number
  error?: string
}

export interface PlaylistService {
  createPlaylist(params: {
    name: string
    coverCid: string
    visibility: number
    tracks: TrackInput[]
  }): Promise<PlaylistResult>

  setTracks(params: {
    playlistId: string
    tracks: TrackInput[]
    existingTrackIds?: string[]
  }): Promise<PlaylistResult>

  updateMeta(params: {
    playlistId: string
    name: string
    coverCid: string
    visibility: number
  }): Promise<PlaylistResult>

  deletePlaylist(params: {
    playlistId: string
  }): Promise<PlaylistResult>
}

// ── Factory ────────────────────────────────────────────────────────

export function createPlaylistService(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
  getPkpAddress: () => string | null,
): PlaylistService {
  return {
    async createPlaylist({ name, coverCid, visibility, tracks }) {
      return executePlaylistAction(getAuthContext, getPkpPublicKey, getPkpAddress, {
        operation: 'create',
        name,
        coverCid,
        visibility,
        tracks,
      })
    },

    async setTracks({ playlistId, tracks, existingTrackIds }) {
      return executePlaylistAction(getAuthContext, getPkpPublicKey, getPkpAddress, {
        operation: 'setTracks',
        playlistId,
        tracks,
        existingTrackIds,
      })
    },

    async updateMeta({ playlistId, name, coverCid, visibility }) {
      return executePlaylistAction(getAuthContext, getPkpPublicKey, getPkpAddress, {
        operation: 'updateMeta',
        playlistId,
        name,
        coverCid,
        visibility,
      })
    },

    async deletePlaylist({ playlistId }) {
      return executePlaylistAction(getAuthContext, getPkpPublicKey, getPkpAddress, {
        operation: 'delete',
        playlistId,
      })
    },
  }
}

// ── Track ID computation (mirrors Lit Action's computeTrackInfo) ───

function computeTrackId(track: TrackInput): `0x${string}` {
  if (track.mbid) {
    const hex = track.mbid.replace(/-/g, '').toLowerCase()
    const payload = ('0x' + hex + '0'.repeat(32)).slice(0, 66) as `0x${string}`
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [1, payload],
      ),
    )
  }

  if (track.ipId) {
    const payload = padHex(track.ipId.toLowerCase() as `0x${string}`, { size: 32 })
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [2, payload],
      ),
    )
  }

  // Kind 3: metadata hash
  const titleNorm = (track.title || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const artistNorm = (track.artist || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const albumNorm = (track.album || '').toLowerCase().trim().replace(/\s+/g, ' ')

  const metaPayload = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
      [titleNorm, artistNorm, albumNorm],
    ),
  )

  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }],
      [3, metaPayload],
    ),
  )
}

// ── Core Execution ─────────────────────────────────────────────────

async function executePlaylistAction(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
  getPkpAddress: () => string | null,
  params: Record<string, unknown>,
): Promise<PlaylistResult> {
  const pkpPublicKey = getPkpPublicKey()
  const pkpAddress = getPkpAddress()
  if (!pkpPublicKey || !pkpAddress) {
    return { success: false, error: 'Not authenticated' }
  }

  const operation = params.operation as string
  const timestamp = Date.now()
  const nonce = await getUserNonce(pkpAddress)

  // Compute trackIds for operations that have tracks
  let trackIds: string[] | undefined
  if ((operation === 'create' || operation === 'setTracks') && params.tracks) {
    const existingIds = (params.existingTrackIds as string[]) || []
    const newIds = (params.tracks as TrackInput[]).map((t) => computeTrackId(t))
    trackIds = [...existingIds, ...newIds]
  }

  // Build message for signing (uses trackIds, not raw tracks)
  const message = await buildMessage(operation, params, trackIds, timestamp, nonce)

  console.log(`[Playlist] ${operation} — signing + submitting via Lit Action...`)

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Sign with user's PKP
  const signResult = await litClient.executeJs({
    code: `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`,
    authContext,
    jsParams: {
      message,
      publicKey: pkpPublicKey,
    },
  })

  if (!signResult.signatures?.sig) {
    return { success: false, error: 'Failed to sign message' }
  }

  const sig = signResult.signatures.sig
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
  const signature = `0x${sigHex}${v}`

  // Execute Lit Action — pass raw tracks (Lit Action computes trackIds internally too)
  const result = await litClient.executeJs({
    ipfsId: PLAYLIST_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      operation,
      signature,
      timestamp,
      nonce,
      ...params,
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

  if (!response.success) {
    console.error(`[Playlist] ${operation} failed:`, response.error)
    return { success: false, error: response.error || 'Unknown error' }
  }

  console.log(`[Playlist] ${operation} success! tx: ${response.txHash}`)

  return {
    success: true,
    playlistId: response.playlistId,
    txHash: response.txHash,
    version: response.version,
    registered: response.registered,
  }
}

// ── Message Building ───────────────────────────────────────────────
// Payload hashes must match the Lit Action exactly:
// - create:    { name, coverCid, visibility, trackIds }
// - setTracks: { trackIds }
// - updateMeta: { name, coverCid, visibility }
// - delete:    (no payload)

async function buildMessage(
  operation: string,
  params: Record<string, unknown>,
  trackIds: string[] | undefined,
  timestamp: number,
  nonce: number,
): Promise<string> {
  switch (operation) {
    case 'create': {
      const payload = {
        name: params.name,
        coverCid: (params.coverCid as string) || '',
        visibility: params.visibility !== undefined ? Number(params.visibility) : 0,
        trackIds,
      }
      const hash = await sha256Hex(JSON.stringify(payload))
      return `heaven:playlist:create:${hash}:${timestamp}:${nonce}`
    }
    case 'setTracks': {
      const payload = { trackIds }
      const hash = await sha256Hex(JSON.stringify(payload))
      return `heaven:playlist:setTracks:${params.playlistId}:${hash}:${timestamp}:${nonce}`
    }
    case 'updateMeta': {
      const payload = {
        name: params.name,
        coverCid: (params.coverCid as string) || '',
        visibility: params.visibility !== undefined ? Number(params.visibility) : 0,
      }
      const hash = await sha256Hex(JSON.stringify(payload))
      return `heaven:playlist:updateMeta:${params.playlistId}:${hash}:${timestamp}:${nonce}`
    }
    case 'delete':
      return `heaven:playlist:delete:${params.playlistId}:${timestamp}:${nonce}`
    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
