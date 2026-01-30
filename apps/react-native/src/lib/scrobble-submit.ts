/**
 * Scrobble submission via Lit Action.
 *
 * Signs the batch with the user's PKP, then executes the scrobble-submit-v2
 * Lit Action which broadcasts to MegaETH.
 */

import type { LitBridge } from '../services/LitBridge';
import type { ReadyScrobble } from '../services/scrobble-engine';

const SCROBBLE_SUBMIT_V2_CID = 'QmTcovqfx6fW5d3AKhSqSDSnC5L56DouVbNhNcqmotaHQK';

/** Track format expected by the scrobble-submit-v2 Lit Action */
interface LitActionTrack {
  artist: string;
  title: string;
  album?: string;
  playedAt: number;
  mbid?: string;
  ipId?: string;
}

export async function submitScrobbleBatch(
  bridge: LitBridge,
  pkpPublicKey: string,
  scrobbles: ReadyScrobble[],
): Promise<{ success: boolean; txHashes?: any; error?: string }> {
  if (scrobbles.length === 0) return { success: true };

  // Convert to the format the Lit Action expects (matching Tauri frontend)
  const tracks: LitActionTrack[] = scrobbles.map((s) => ({
    artist: s.artist,
    title: s.title,
    ...(s.album ? { album: s.album } : {}),
    playedAt: s.playedAtSec,
    ...(s.ipId ? { ipId: s.ipId } : {}),
  }));

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000).toString();

  // Compute tracks hash (must match what the Lit Action expects)
  const tracksJson = JSON.stringify(tracks);
  const tracksHash = await sha256Hex(tracksJson);

  // Sign: heaven:scrobble:${tracksHash}:${timestamp}:${nonce}
  const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`;

  console.log('[Scrobble] Signing + submitting via Lit Action...');

  const signResult = await bridge.sendRequest('signMessage', {
    message,
    publicKey: pkpPublicKey,
  }, 120000);

  const signature = signResult.signature;

  // Execute the Lit Action
  const result = await bridge.sendRequest('executeLitAction', {
    ipfsId: SCROBBLE_SUBMIT_V2_CID,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      tracks,
      signature,
      timestamp,
      nonce,
    },
  }, 120000);

  // Parse the Lit Action response
  const raw = result.response;
  const response = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (!response.success) {
    console.error('[Scrobble] Lit Action failed:', response.error);
  } else {
    console.log('[Scrobble] On-chain! txHashes:', response.txHashes);
  }

  return response;
}

async function sha256Hex(message: string): Promise<string> {
  try {
    const { digestStringAsync, CryptoDigestAlgorithm } = require('expo-crypto');
    return await digestStringAsync(CryptoDigestAlgorithm.SHA256, message);
  } catch {
    console.warn('[Scrobble] expo-crypto not available, using fallback');
    return 'fallback-hash';
  }
}
