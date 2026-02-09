/**
 * Camp Network Spotify integration for React Native.
 *
 * Replicates the web frontend's camp-spotify.ts without importing @campnetwork/origin.
 * Uses direct API calls + expo-web-browser for the OAuth redirect.
 *
 * Flow:
 * 1. authenticateWithCamp() — SIWE auth → get userId + jwt
 * 2. openSpotifyLink() — open Camp OAuth URL in browser, user approves
 * 3. After deep link return: fetchTopArtists() — get top artists, resolve to MBIDs
 */

import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Config ──────────────────────────────────────────────────────────

const CAMP_CLIENT_ID = 'fce77d7a-8085-47ca-adff-306a933e76aa';
const CAMP_API_KEY = '4f1a2c9c-008e-4a2e-8712-055fa04f9ffa';
const CAMP_AUTH_BASE = 'https://origin-backend-iota.vercel.app';
const CAMP_API_BASE = 'https://wv2h4to5qa.execute-api.us-east-2.amazonaws.com/dev';
const RESOLVER_URL = 'https://heaven-resolver-production.deletion-backup782.workers.dev';
const REDIRECT_URI = 'heaven://spotify-callback';

const STORAGE_KEY_CAMP_JWT = 'heaven:camp:jwt';
const STORAGE_KEY_CAMP_USER = 'heaven:camp:userId';

// ── Types ───────────────────────────────────────────────────────────

export interface SpotifyArtist {
  mbid: string;
  name: string;
}

interface PKPSigner {
  signMessage: (message: string) => Promise<string>;
  getAddress: () => string;
}

export interface CampSession {
  userId: string;
  jwt: string;
}

// ── SIWE auth with Camp ─────────────────────────────────────────────

/**
 * Authenticate with Camp via SIWE (Sign-In With Ethereum).
 * Returns userId + jwt needed for Spotify linking.
 */
export async function authenticateWithCamp(signer: PKPSigner): Promise<CampSession> {
  // Check for cached session
  const [cachedJwt, cachedUser] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_CAMP_JWT),
    AsyncStorage.getItem(STORAGE_KEY_CAMP_USER),
  ]);
  if (cachedJwt && cachedUser) {
    return { jwt: cachedJwt, userId: cachedUser };
  }

  const walletAddress = signer.getAddress();

  // 1. Get nonce
  const nonceRes = await fetch(`${CAMP_AUTH_BASE}/client-user/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': CAMP_CLIENT_ID },
    body: JSON.stringify({ walletAddress }),
  });
  const nonceData = await nonceRes.json();
  if (nonceRes.status !== 200) {
    throw new Error(`Camp nonce failed: ${nonceData.message || nonceRes.status}`);
  }
  const nonce = nonceData.data;

  // 2. Build SIWE message (matching Camp SDK format)
  const issuedAt = new Date().toISOString();
  const message = [
    `localhost wants you to sign in with your Ethereum account:`,
    walletAddress,
    '',
    `Sign in to Camp Network`,
    '',
    `URI: http://localhost`,
    `Version: 1`,
    `Chain ID: 1`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');

  // 3. Sign with PKP
  const signature = await signer.signMessage(message);

  // 4. Verify with Camp
  const verifyRes = await fetch(`${CAMP_AUTH_BASE}/client-user/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': CAMP_CLIENT_ID },
    body: JSON.stringify({ message, signature, walletAddress }),
  });
  const verifyData = await verifyRes.json();
  if (verifyData.isError) {
    throw new Error(`Camp verify failed: ${verifyData.message}`);
  }

  // Decode JWT to get userId
  const jwt = verifyData.data;
  const payload = JSON.parse(atob(jwt.split('.')[1]));
  const userId = payload.id;

  // Cache session
  await AsyncStorage.setItem(STORAGE_KEY_CAMP_JWT, jwt);
  await AsyncStorage.setItem(STORAGE_KEY_CAMP_USER, userId);

  return { jwt, userId };
}

// ── Spotify OAuth ───────────────────────────────────────────────────

/**
 * Open Camp's Spotify OAuth flow in an in-app browser.
 * User approves in Spotify, gets redirected back to heaven:// deep link.
 * Returns true if the flow completed (user came back), false if dismissed.
 */
export async function openSpotifyLink(session: CampSession): Promise<boolean> {
  const url = `${CAMP_AUTH_BASE}/spotify/connect?clientId=${CAMP_CLIENT_ID}&userId=${session.userId}&redirect_url=${encodeURIComponent(REDIRECT_URI)}`;

  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);

  return result.type === 'success';
}

// ── Fetch top artists ───────────────────────────────────────────────

/**
 * After Spotify is linked, fetch the user's top artists from Camp API
 * and resolve their names to MusicBrainz IDs via the heaven-resolver.
 */
export async function fetchTopArtists(session: CampSession, walletAddress: string): Promise<SpotifyArtist[]> {
  // 1. Check Spotify is linked
  const socialsRes = await fetch(`${CAMP_AUTH_BASE}/client-user/connections-sdk`, {
    headers: {
      'Authorization': `Bearer ${session.jwt}`,
      'x-client-id': CAMP_CLIENT_ID,
      'Content-Type': 'application/json',
    },
  });
  const socialsData = await socialsRes.json();
  if (socialsData.isError || !socialsData.data?.data?.spotifyUser) {
    throw new Error('Spotify account was not linked. Please try again.');
  }

  // 2. Get Spotify user data via Camp API
  const walletDataRes = await fetch(
    `${CAMP_API_BASE}/spotify/wallet-spotify-data?walletAddress=${walletAddress}`,
    { headers: { 'x-api-key': CAMP_API_KEY } },
  );
  const walletData = await walletDataRes.json();

  if (walletData.isError || !walletData.data) {
    throw new Error('Could not find Spotify data for your wallet.');
  }

  const spotifyId =
    walletData.data.spotifyId ||
    walletData.data.id ||
    walletData.data.spotify_id ||
    walletData.data.spotifyUser?.id;

  if (!spotifyId) {
    throw new Error('No Spotify ID found. Please try again.');
  }

  // 3. Fetch top artists
  const topRes = await fetch(
    `${CAMP_API_BASE}/spotify/top?spotifyId=${encodeURIComponent(spotifyId)}&time_range=long_term`,
    { headers: { 'x-api-key': CAMP_API_KEY } },
  );
  const topData = await topRes.json();

  const data = topData.data || topData;
  const artistNames: string[] = data.names || data.artists || [];

  if (artistNames.length === 0) {
    throw new Error('No top artists found. Your Spotify data may still be processing.');
  }

  // 4. Resolve artist names to MBIDs via heaven-resolver
  return resolveArtistNames(artistNames.slice(0, 20));
}

// ── Resolver: artist names → MBIDs ─────────────────────────────────

async function resolveArtistNames(names: string[]): Promise<SpotifyArtist[]> {
  const results: SpotifyArtist[] = [];

  // Resolve in parallel batches of 5
  const batchSize = 5;
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const resolved = await Promise.allSettled(
      batch.map((name) => resolveArtistName(name)),
    );

    for (const result of resolved) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }
  }

  return results;
}

async function resolveArtistName(name: string): Promise<SpotifyArtist | null> {
  try {
    const res = await fetch(
      `${RESOLVER_URL}/search/artist?q=${encodeURIComponent(name)}`,
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      artists: Array<{ mbid: string; name: string; score: number }>;
    };

    const top = data.artists?.[0];
    if (!top || top.score < 80) return null;

    return { mbid: top.mbid, name: top.name };
  } catch {
    return null;
  }
}

/**
 * Clear cached Camp session (e.g. on logout).
 */
export async function clearCampSession(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY_CAMP_JWT, STORAGE_KEY_CAMP_USER]);
}
