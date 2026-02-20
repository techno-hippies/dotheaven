/**
 * Camp Network SDK integration for Spotify OAuth and top artist fetching.
 *
 * Flow:
 * 1. initCampAuth() — create Auth instance, authenticate with PKP custom signer
 * 2. startSpotifyLink() — sets flag + calls auth.linkSpotify() (redirects away)
 * 3. On return: handleSpotifyCallback() — re-authenticates, fetches top artists,
 *    resolves names to MBIDs via the metadata-resolver
 *
 * The Camp SDK's linkSpotify() does a full page redirect to their OAuth hub,
 * so we persist state in localStorage to resume after redirect.
 */

import { Auth } from '@campnetwork/origin'
import type { OnboardingArtist } from '@heaven/ui'

// ── Config ──────────────────────────────────────────────────────────

const CAMP_CLIENT_ID = 'fce77d7a-8085-47ca-adff-306a933e76aa'
const CAMP_API_KEY = '4f1a2c9c-008e-4a2e-8712-055fa04f9ffa'
const CAMP_API_BASE = 'https://wv2h4to5qa.execute-api.us-east-2.amazonaws.com/dev'
const RESOLVER_URL =
  (() => {
    const url = (import.meta.env.VITE_RESOLVER_URL || '').trim()
    if (!url) throw new Error('Missing VITE_RESOLVER_URL')
    return url.replace(/\/+$/, '')
  })()

const STORAGE_KEY_LINKING = 'heaven:camp:spotifyLinking'
const STORAGE_KEY_WALLET = 'heaven:camp:walletAddress'

// ── Camp API helper ─────────────────────────────────────────────────

async function campGet(path: string): Promise<any> {
  const url = `${CAMP_API_BASE}${path}`
  const res = await fetch(url, { headers: { 'x-api-key': CAMP_API_KEY } })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { isError: true, message: text }
  }
}

// ── Custom signer adapter for PKP ──────────────────────────────────

interface PKPSigner {
  signMessage: (message: string) => Promise<string>
  getAddress: () => string
}

function createPkpCustomSigner(signer: PKPSigner) {
  return {
    getAddress: async () => signer.getAddress(),
    signMessage: async (message: string) => signer.signMessage(message),
    signTypedData: async () => {
      throw new Error('signTypedData not supported for PKP signer')
    },
    getChainId: async () => 1, // Camp expects mainnet chain ID for SIWE
  }
}

// ── Camp Auth instance ──────────────────────────────────────────────

let authInstance: Auth | null = null

function getRedirectUri(): string {
  // Use the current origin + path for OAuth redirect
  return window.location.origin + window.location.pathname
}

function createAuth(): Auth {
  if (authInstance) return authInstance

  authInstance = new Auth({
    clientId: CAMP_CLIENT_ID,
    appId: CAMP_CLIENT_ID,
    redirectUri: getRedirectUri(),
    environment: 'DEVELOPMENT' as any,
  } as any)

  return authInstance
}

/**
 * Initialize Camp Auth and authenticate with a PKP custom signer.
 */
export async function initCampAuth(signer: PKPSigner): Promise<Auth> {
  const auth = createAuth()

  // Connect with the PKP as a custom signer
  const result = await auth.connectWithSigner(createPkpCustomSigner(signer))
  if (!result.success) {
    throw new Error(`Camp auth failed: ${result.message}`)
  }

  return auth
}

/**
 * Start the Spotify linking flow. This will redirect the user away.
 * Call this from the onboarding "Connect Spotify" button.
 *
 * Before redirecting, we persist state so we can resume on return.
 */
export async function startSpotifyLink(signer: PKPSigner): Promise<void> {
  const auth = await initCampAuth(signer)

  // Store that we're in the middle of Spotify linking
  localStorage.setItem(STORAGE_KEY_LINKING, 'true')
  localStorage.setItem(STORAGE_KEY_WALLET, signer.getAddress())

  // This redirects the browser — no code runs after this
  await auth.linkSpotify()
}

/**
 * Check if we're returning from a Spotify OAuth redirect.
 */
export function isSpotifyCallback(): boolean {
  return localStorage.getItem(STORAGE_KEY_LINKING) === 'true'
}

/**
 * Clear the Spotify callback state.
 */
export function clearSpotifyCallback(): void {
  localStorage.removeItem(STORAGE_KEY_LINKING)
  localStorage.removeItem(STORAGE_KEY_WALLET)
}

/**
 * After returning from Spotify OAuth, re-authenticate with Camp,
 * verify Spotify is linked, fetch top artists, and resolve to MBIDs.
 */
export async function handleSpotifyCallback(
  signer: PKPSigner,
): Promise<OnboardingArtist[]> {
  try {
    const auth = await initCampAuth(signer)

    // Verify Spotify is now linked
    const socials = await auth.getLinkedSocials()
    if (!socials.spotify) {
      throw new Error('Spotify account was not linked. Please try again.')
    }

    // Get the wallet address to look up Spotify data
    const walletAddress = signer.getAddress()

    // Fetch Spotify user data via Camp API
    const walletData = await campGet(
      `/spotify/wallet-spotify-data?walletAddress=${walletAddress}`,
    )

    if (walletData.isError || !walletData.data) {
      throw new Error('Could not find Spotify data for your wallet.')
    }

    // Extract Spotify user ID
    const spotifyId =
      walletData.data.spotifyId ||
      walletData.data.id ||
      walletData.data.spotify_id ||
      walletData.data.spotifyUser?.id

    if (!spotifyId) {
      // Fall back to fetching by wallet if no spotify ID
      console.warn('[CampSpotify] No Spotify ID found, trying top artists by name')
    }

    // Fetch top artists
    const topResult = await campGet(
      `/spotify/top?spotifyId=${encodeURIComponent(spotifyId)}&time_range=long_term`,
    )

    const data = topResult.data || topResult
    const artistNames: string[] = data.names || data.artists || []

    if (artistNames.length === 0) {
      throw new Error(
        'No top artists found. Your Spotify data may still be processing.',
      )
    }

    // Resolve artist names to MBIDs via the metadata-resolver
    const artists = await resolveArtistNames(artistNames.slice(0, 20))

    return artists
  } finally {
    clearSpotifyCallback()
  }
}

// ── Resolver: artist names → MBIDs ─────────────────────────────────

/**
 * Resolve a list of artist names to OnboardingArtist objects with MBIDs.
 * Uses the metadata-resolver /search/artist?q= endpoint.
 * Skips artists that can't be resolved.
 */
async function resolveArtistNames(
  names: string[],
): Promise<OnboardingArtist[]> {
  const results: OnboardingArtist[] = []

  // Resolve in parallel batches of 5 (resolver rate-limits to 1 req/sec internally)
  const batchSize = 5
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize)
    const resolved = await Promise.allSettled(
      batch.map((name) => resolveArtistName(name)),
    )

    for (const result of resolved) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      }
    }
  }

  return results
}

async function resolveArtistName(
  name: string,
): Promise<OnboardingArtist | null> {
  try {
    const res = await fetch(
      `${RESOLVER_URL}/search/artist?q=${encodeURIComponent(name)}`,
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      artists: Array<{
        mbid: string
        name: string
        score: number
        type?: string | null
      }>
    }

    // Take the top result if score is high enough
    const top = data.artists?.[0]
    if (!top || top.score < 80) return null

    return {
      mbid: top.mbid,
      name: top.name,
    }
  } catch {
    return null
  }
}
