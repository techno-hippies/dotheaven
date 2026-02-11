/**
 * Playlist service — calls the playlist-v1 Lit Action for on-chain playlist CRUD.
 *
 * Follows the same pattern as follow.ts:
 * 1. Get nonce from PlaylistV1 contract
 * 2. Sign EIP-191 message via AuthProvider.signMessage()
 * 3. Execute Lit Action via LitBridge
 * 4. Return result
 */

import type { LitBridge } from '../services/LitBridge';
import { getUserNonce } from './playlists';

const PLAYLIST_V1_CID = 'QmUf2jSaquVXJZBaoq5WCjKZKJpW7zVZVWHKuGi68GYZqq';

const FILEBASE_COVERS_ENCRYPTED_KEY = {
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
};

// ── Types ──────────────────────────────────────────────────────────

export interface TrackInput {
  artist: string;
  title: string;
  album?: string;
  mbid?: string;
  ipId?: string;
  coverCid?: string;
  coverImage?: { base64: string; contentType: string };
}

export interface PlaylistResult {
  success: boolean;
  playlistId?: string;
  txHash?: string;
  version?: number;
  registered?: number;
  error?: string;
}

// ── Service Functions ──────────────────────────────────────────────

export async function createPlaylist(
  params: {
    name: string;
    coverCid?: string;
    visibility?: number;
    tracks: TrackInput[];
  },
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridge,
  pkpPublicKey: string,
  pkpAddress: string,
): Promise<PlaylistResult> {
  return executePlaylistAction({
    operation: 'create',
    name: params.name,
    coverCid: params.coverCid ?? '',
    visibility: params.visibility ?? 0,
    tracks: params.tracks,
  }, signMessage, bridge, pkpPublicKey, pkpAddress);
}

export async function setPlaylistTracks(
  params: {
    playlistId: string;
    tracks: TrackInput[];
    existingTrackIds?: string[];
  },
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridge,
  pkpPublicKey: string,
  pkpAddress: string,
): Promise<PlaylistResult> {
  return executePlaylistAction({
    operation: 'setTracks',
    playlistId: params.playlistId,
    tracks: params.tracks,
    existingTrackIds: params.existingTrackIds,
  }, signMessage, bridge, pkpPublicKey, pkpAddress);
}

export async function updatePlaylistMeta(
  params: {
    playlistId: string;
    name: string;
    coverCid?: string;
    visibility?: number;
  },
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridge,
  pkpPublicKey: string,
  pkpAddress: string,
): Promise<PlaylistResult> {
  return executePlaylistAction({
    operation: 'updateMeta',
    playlistId: params.playlistId,
    name: params.name,
    coverCid: params.coverCid ?? '',
    visibility: params.visibility ?? 0,
  }, signMessage, bridge, pkpPublicKey, pkpAddress);
}

export async function deletePlaylist(
  params: { playlistId: string },
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridge,
  pkpPublicKey: string,
  pkpAddress: string,
): Promise<PlaylistResult> {
  return executePlaylistAction({
    operation: 'delete',
    playlistId: params.playlistId,
  }, signMessage, bridge, pkpPublicKey, pkpAddress);
}

// ── Core Execution ─────────────────────────────────────────────────

async function executePlaylistAction(
  params: Record<string, unknown>,
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridge,
  pkpPublicKey: string,
  pkpAddress: string,
): Promise<PlaylistResult> {
  const operation = params.operation as string;
  const timestamp = Date.now();
  console.log(`[Playlist] ${operation} — fetching nonce for ${pkpAddress}...`);
  const nonce = await getUserNonce(pkpAddress);
  console.log(`[Playlist] ${operation} — nonce: ${nonce}, timestamp: ${timestamp}`);

  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpPublicKey,
    operation,
    timestamp,
    nonce,
    ...params,
  };

  // Include encrypted Filebase key for cover uploads
  const tracks = params.tracks as TrackInput[] | undefined;
  const hasCoverImage = Array.isArray(tracks) && tracks.some((t) => t.coverImage);
  if (hasCoverImage) {
    jsParams.filebaseEncryptedKey = FILEBASE_COVERS_ENCRYPTED_KEY;
  }

  console.log(`[Playlist] ${operation} — executing Lit Action (CID: ${PLAYLIST_V1_CID})...`);

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: PLAYLIST_V1_CID,
    jsParams,
  }, 120000);

  const response = typeof execResult.response === 'string'
    ? JSON.parse(execResult.response)
    : execResult.response;

  if (!response.success) {
    console.error(`[Playlist] ${operation} failed:`, response.error);
    return { success: false, error: response.error || 'Unknown error' };
  }

  console.log(`[Playlist] ${operation} success! tx: ${response.txHash}`);

  return {
    success: true,
    playlistId: response.playlistId,
    txHash: response.txHash,
    version: response.version,
    registered: response.registered,
  };
}
