/**
 * Playlist data layer — reads playlist data from Goldsky subgraph + on-chain track metadata.
 *
 * Ported from apps/frontend/src/lib/heaven/playlists.ts (SolidJS/Tauri).
 * Same subgraph queries, same track resolution logic.
 */

import {
  MEGA_RPC,
  PLAYLIST_V1,
  SUBGRAPH_PLAYLISTS,
  SUBGRAPH_ACTIVITY,
  IPFS_GATEWAY,
} from './heaven-constants';

// ── Types ──────────────────────────────────────────────────────────

export interface OnChainPlaylist {
  id: string;              // bytes32 hex
  owner: string;           // address
  name: string;
  coverCid: string;
  visibility: number;      // 0=public, 1=unlisted, 2=private
  trackCount: number;
  version: number;
  exists: boolean;
  tracksHash: string;
  createdAt: number;       // unix seconds
  updatedAt: number;
}

export interface OnChainPlaylistTrack {
  trackId: string;         // bytes32
  position: number;
}

export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumCover?: string;
  duration: string;
  kind?: number;
  payload?: string;
  mbid?: string;
}

interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  coverCid: string;
  kind: number;
  payload: string;
  durationSec: number;
}

// ── Subgraph Queries ───────────────────────────────────────────────

export async function fetchUserPlaylists(
  ownerAddress: string,
  maxEntries = 50,
): Promise<OnChainPlaylist[]> {
  const addr = ownerAddress.toLowerCase();

  const query = `{
    playlists(
      where: { owner: "${addr}", exists: true }
      orderBy: updatedAt
      orderDirection: desc
      first: ${maxEntries}
    ) {
      id owner name coverCid visibility trackCount version exists
      tracksHash createdAt updatedAt
    }
  }`;

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`);
  const json = await res.json();

  return (json.data?.playlists ?? []).map(mapPlaylist);
}

export async function fetchPlaylist(playlistId: string): Promise<OnChainPlaylist | null> {
  const query = `{
    playlist(id: "${playlistId.toLowerCase()}") {
      id owner name coverCid visibility trackCount version exists
      tracksHash createdAt updatedAt
    }
  }`;

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`);
  const json = await res.json();

  const p = json.data?.playlist;
  if (!p) return null;
  return mapPlaylist(p);
}

export async function fetchPlaylistWithTracks(
  playlistId: string,
): Promise<{ playlist: OnChainPlaylist; tracks: PlaylistTrack[] } | null> {
  const id = playlistId.toLowerCase();
  const query = `{
    playlist(id: "${id}") {
      id owner name coverCid visibility trackCount version exists
      tracksHash createdAt updatedAt
    }
    playlistTracks(
      where: { playlist: "${id}" }
      orderBy: position
      orderDirection: asc
      first: 1000
    ) {
      trackId position
    }
  }`;

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`);
  const json = await res.json();

  const p = json.data?.playlist;
  if (!p) return null;

  const rawTracks: OnChainPlaylistTrack[] = (json.data?.playlistTracks ?? []).map((t: any) => ({
    trackId: t.trackId,
    position: t.position,
  }));

  const tracks = await resolvePlaylistTracks(rawTracks);
  return { playlist: mapPlaylist(p), tracks };
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
      trackId position
    }
  }`;

  const res = await fetch(SUBGRAPH_PLAYLISTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`);
  const json = await res.json();

  return (json.data?.playlistTracks ?? []).map((t: any) => ({
    trackId: t.trackId,
    position: t.position,
  }));
}

// ── Track Metadata Resolution ──────────────────────────────────────

async function resolvePlaylistTracks(
  playlistTracks: OnChainPlaylistTrack[],
): Promise<PlaylistTrack[]> {
  if (playlistTracks.length === 0) return [];

  const uniqueIds = [...new Set(playlistTracks.map((t) => t.trackId))];
  const metaMap = await batchGetTracks(uniqueIds);

  return playlistTracks.map((pt) => {
    const meta = metaMap.get(pt.trackId);
    const isValidCid = (cid: string | undefined | null): cid is string =>
      !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'));

    const title = meta?.title ?? `Track ${pt.trackId.slice(0, 10)}...`;
    const artist = meta?.artist ?? 'Unknown';
    const album = meta?.album ?? '';
    const onChainCover = isValidCid(meta?.coverCid)
      ? `${IPFS_GATEWAY}${meta.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined;

    return {
      id: pt.trackId,
      title,
      artist,
      album,
      albumCover: onChainCover,
      duration: formatDuration(meta?.durationSec ?? 0),
      kind: meta?.kind,
      payload: meta?.payload,
    };
  });
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── On-Chain Nonce ─────────────────────────────────────────────────

export async function getUserNonce(userAddress: string): Promise<number> {
  // cast sig "userNonces(address)" → 0x2f7801f4
  const selector = '0x2f7801f4';
  const data = selector + userAddress.slice(2).toLowerCase().padStart(64, '0');

  const result = await rpcCall('eth_call', [
    { to: PLAYLIST_V1, data },
    'latest',
  ]);
  return parseInt(result, 16);
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
  };
}

async function batchGetTracks(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>();
  if (trackIds.length === 0) return results;

  const ids = trackIds.map((id) => `"${id.toLowerCase()}"`).join(',');
  const query = `{
    tracks(
      where: { id_in: [${ids}] }
      first: 1000
    ) {
      id title artist kind payload coverCid durationSec
    }
  }`;

  try {
    const res = await fetch(SUBGRAPH_ACTIVITY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return results;
    const json = await res.json();
    const tracks: Array<{
      id: string;
      title: string;
      artist: string;
      kind: number;
      payload: string;
      coverCid: string | null;
      durationSec: number | null;
    }> = json.data?.tracks ?? [];

    for (const t of tracks) {
      results.set(t.id, {
        title: t.title,
        artist: t.artist,
        album: '',
        coverCid: t.coverCid ?? '',
        kind: t.kind,
        payload: t.payload,
        durationSec: t.durationSec ?? 0,
      });
    }
  } catch {
    // Subgraph unavailable — degrade gracefully
  }

  return results;
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(MEGA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}
