/**
 * PlaylistService — calls the playlist-v1 Lit Action for on-chain playlist CRUD.
 *
 * Follows the same pattern as scrobble-service.ts:
 * 1. Compute trackIds (same algorithm as Lit Action)
 * 2. Sign EIP-191 message with user PKP
 * 3. Execute Lit Action (IPFS CID) with signature + params
 * 4. Return result
 */

import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'
import { PLAYLIST_V1_CID } from './lit/action-cids'
import { getUserNonce } from './heaven/playlists'

type EncryptedKey = {
  ciphertext: string
  dataToEncryptHash: string
  accessControlConditions: unknown[]
}

/** Encrypted Filebase covers key — bound to the playlist-v1 action CID (update after redeploy). */
const FILEBASE_COVERS_ENCRYPTED_KEY: EncryptedKey | null = {
  ciphertext: 'kmcO4LYNJN2N7qNXh3hlNeKJJRsyan3GH35TRzbkGAMZ6ohbujG+QenMouzYam4ByOsrPW0R+FLG/tBQ2jEv0gvsuIgbJA0NJgGkeK5TAD6GAcbBWuR9DndB61X8QyNdhrRvwiLE2jAmgmqRHSu0P4ozXj4hRUjmDMsr7RS/yvtT0/CaJG9rODkDPA2UJpCFNLfx47k7ghqPNztx8rE0xY7kOTTYPF4A3dO5zZfmLkd+horBfentydzBIGI+qHlx8O+OwZzR40SvWUD7XoV8VCo3Ckf28pWQAg==',
  dataToEncryptHash: '1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: PLAYLIST_V1_CID },
  }],
}

// ── Types ──────────────────────────────────────────────────────────

export interface TrackInput {
  artist: string
  title: string
  album?: string
  mbid?: string
  ipId?: string
  coverCid?: string
  coverImage?: { base64: string; contentType: string }
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

// ── Core Execution ─────────────────────────────────────────────────

async function executePlaylistAction(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
  getPkpAddress: () => string | null,
  params: Record<string, unknown>,
): Promise<PlaylistResult> {
  const pkpPublicKey = getPkpPublicKey()
  const pkpAddress = getPkpAddress()
  console.log(`[Playlist] pkpPublicKey: ${pkpPublicKey?.slice(0, 16)}..., pkpAddress: ${pkpAddress}`)
  if (!pkpPublicKey || !pkpAddress) {
    console.error('[Playlist] Not authenticated — missing pkpPublicKey or pkpAddress')
    return { success: false, error: 'Not authenticated' }
  }

  const operation = params.operation as string
  const timestamp = Date.now()
  console.log(`[Playlist] ${operation} — fetching nonce for ${pkpAddress}...`)
  const nonce = await getUserNonce(pkpAddress)
  console.log(`[Playlist] ${operation} — nonce: ${nonce}, timestamp: ${timestamp}`)

  console.log(`[Playlist] ${operation} — getting Lit client...`)
  const litClient = await getLitClient()
  console.log(`[Playlist] ${operation} — getting auth context...`)
  const authContext = await getAuthContext()
  console.log(`[Playlist] ${operation} — executing Lit Action (CID: ${PLAYLIST_V1_CID})...`)

  // Single executeJs: action signs with user's PKP + sponsor PKP broadcasts
  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpPublicKey,
    operation,
    timestamp,
    nonce,
    ...params,
  }

  const tracks = params.tracks as TrackInput[] | undefined
  const hasCoverImage = Array.isArray(tracks) && tracks.some((t) => t.coverImage)
  if (hasCoverImage && FILEBASE_COVERS_ENCRYPTED_KEY) {
    jsParams.filebaseEncryptedKey = FILEBASE_COVERS_ENCRYPTED_KEY
  }

  const result = await litClient.executeJs({
    ipfsId: PLAYLIST_V1_CID,
    authContext,
    jsParams,
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
