/**
 * Scrobble history for React Native — fetches from Goldsky subgraph
 * and resolves track metadata from on-chain (ScrobbleV4 → V3 fallback).
 *
 * Port of apps/frontend/src/lib/heaven/scrobbles.ts
 */

import { SUBGRAPH_ACTIVITY, MEGA_RPC, IPFS_GATEWAY } from './heaven-constants';

// ── Constants ─────────────────────────────────────────────────────

const SCROBBLE_V4 = '0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1';
const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0';

// ── Types ─────────────────────────────────────────────────────────

export interface ScrobbleEntry {
  id: string;
  trackId: string;
  playedAt: number;        // unix seconds
  txHash: string;
  artist: string;
  title: string;
  album: string;
  coverCid: string;        // IPFS CID for album art (empty if none)
  durationSec: number;     // track duration in seconds
  kind: number;            // 1=MBID, 2=ipId, 3=meta
  payload: string;
}

interface ScrobbleGQL {
  id: string;
  user: string;
  track: {
    id: string;
    kind: number;
    payload: string;
    durationSec: number;
  };
  timestamp: string;
  blockTimestamp: string;
  transactionHash: string;
}

interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  coverCid: string;
  durationSec: number;
  kind: number;
  payload: string;
}

// ── Fetch ─────────────────────────────────────────────────────────

export async function fetchScrobbleEntries(
  userAddress: string,
  maxEntries = 100,
): Promise<ScrobbleEntry[]> {
  const addr = userAddress.toLowerCase();

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
  }`;

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: ${res.status}`);
  const json = await res.json();

  const scrobbles: ScrobbleGQL[] = json.data?.scrobbles ?? [];
  if (scrobbles.length === 0) return [];

  // Resolve track metadata from on-chain (V4 → V3 fallback)
  const uniqueTrackIds = [...new Set(scrobbles.map((s) => s.track.id))];
  const trackMeta = await batchGetTracks(uniqueTrackIds);

  return scrobbles.map((s) => {
    const meta = trackMeta.get(s.track.id);
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
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────

/** Validate CID looks like an IPFS hash */
export function isValidCid(cid: string | undefined | null): cid is string {
  return !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'));
}

/** Build cover URL from CID with optimization params */
export function coverUrl(cid: string): string {
  return `${IPFS_GATEWAY}${cid}?img-width=96&img-height=96&img-format=webp&img-quality=80`;
}

export function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── Track metadata resolution (on-chain via MegaETH RPC) ──────────

async function batchGetTracks(trackIds: string[]): Promise<Map<string, TrackMeta>> {
  const results = new Map<string, TrackMeta>();
  const selector = '0x82368a6b'; // getTrack(bytes32)

  const fetchFrom = async (contract: string, ids: string[]) => {
    const promises = ids.map(async (trackId) => {
      if (results.has(trackId)) return;
      try {
        const data = selector + trackId.slice(2).padStart(64, '0');
        const result = await rpcCall('eth_call', [{ to: contract, data }, 'latest']);
        if (result && result !== '0x' && result.length > 66) {
          const decoded = decodeGetTrackResult(result);
          if (decoded) results.set(trackId, decoded);
        }
      } catch {
        // Skip failed lookups
      }
    });
    await Promise.all(promises);
  };

  await fetchFrom(SCROBBLE_V4, trackIds);
  const missing = trackIds.filter((id) => !results.has(id));
  if (missing.length > 0) {
    await fetchFrom(SCROBBLE_V3, missing);
  }

  return results;
}

function decodeGetTrackResult(hex: string): TrackMeta | null {
  try {
    const data = hex.slice(2);
    const titleOffset = parseInt(data.slice(0, 64), 16) * 2;
    const artistOffset = parseInt(data.slice(64, 128), 16) * 2;
    const albumOffset = parseInt(data.slice(128, 192), 16) * 2;
    const kind = parseInt(data.slice(192, 256), 16);
    const payload = '0x' + data.slice(256, 320);
    const coverCidOffset = parseInt(data.slice(384, 448), 16) * 2;
    const durationSec = parseInt(data.slice(448, 512), 16);
    return {
      title: decodeString(data, titleOffset),
      artist: decodeString(data, artistOffset),
      album: decodeString(data, albumOffset),
      coverCid: decodeString(data, coverCidOffset),
      durationSec,
      kind,
      payload,
    };
  } catch {
    return null;
  }
}

function decodeString(data: string, offset: number): string {
  const len = parseInt(data.slice(offset, offset + 64), 16);
  if (len === 0) return '';
  const hexStr = data.slice(offset + 64, offset + 64 + len * 2);
  const bytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, '');
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
