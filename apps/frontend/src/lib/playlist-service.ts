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
import { getUserNonce } from './heaven/playlists'

const PLAYLIST_V1_CID = 'QmZkySDfK5rg6Xs8JGhi8GTWKuTfZvzv6sHDhkZZaTncGs'

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

  console.log(`[Playlist] ${operation} — submitting via Lit Action (internal signing)...`)

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Single executeJs: action signs with user's PKP + sponsor PKP broadcasts
  const result = await litClient.executeJs({
    ipfsId: PLAYLIST_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      operation,
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

