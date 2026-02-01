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
  ciphertext: 'qxpLzowVxe4MX3/jxS8k42JhPEXhS4ScIwQf61bg1UjFbnXAJ4WFIXufSJY1v2a8pKfStJ/npn4ZUuoq+EKZwN3zHWRRLAuszzok+Z29lK5tDBIXanoPXz2ynTrB4B84CudO4SAmG3rwPKJMLqlvMu7fRJYvjsJlM+89/IHcG0n1dXlNsOPAomtr5+YG0hzUfPYlTw5MNdw9Fw7SPSUVvFd8jZ/ftgCwq5jJPUyKQ5Ez0Y2wZvDLDwXu3xZ+CAI=',
  dataToEncryptHash: 'c90b8bc304ece7f65c9af66ee9ca10472888cf1c0c324eaccead9f7edf6e1856',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: 'QmYvozSnyUb3QCmsDLWQ1caYecokqeHpc8Cck5uqnuNf9R' },
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
