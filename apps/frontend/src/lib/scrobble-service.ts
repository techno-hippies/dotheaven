/**
 * ScrobbleService — wires ScrobbleEngine to Lit Action V3 (ScrobbleV3).
 *
 * Each scrobble fires the Lit Action immediately (no batching/queue).
 * V3 registers tracks on-chain (title/artist/album) + scrobbles as cheap event refs.
 */

import { ScrobbleEngine } from '@heaven/core'
import type { TrackMetadata, ReadyScrobble } from '@heaven/core'
import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'
import { SCROBBLE_SUBMIT_V3_CID } from './lit/action-cids'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000

/** Encrypted Filebase covers key — only decryptable by the scrobble submit Lit Action CID */
const FILEBASE_COVERS_ENCRYPTED_KEY = {
  ciphertext: 'uGTcuCUuTuJTTrrY2zS07HpUkSaEh2DdmRerfRq+Xd92EchN13K7FCpLtWW+SzZnxRUpMI5poR6tBwu6nVY1PagofgrVxyrCCjYyqI+L5nttnTCbUye/h2bQXQ4CwOaGX9nFuqyf53zjWkmUiOal4suPfK0IBjMoY8oqpzGjKinESiXALnXn92OF+RTgRD1PedCsBh2AzB9jLp7eK1S0mVDKcSj1WVhigABOi5wpfYxvMm0zivtXHy2MDESEbwI=',
  dataToEncryptHash: 'c90b8bc304ece7f65c9af66ee9ca10472888cf1c0c324eaccead9f7edf6e1856',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: 'QmNzCDJQjcNvD9A7sthWX1XoGesEtc6MTC1k76Pa6fMChv' },
  }],
}

export interface ScrobbleService {
  start(): void
  stop(): void
  onTrackStart(meta: TrackMetadata): void
  onPlaybackChange(isPlaying: boolean): void
  tick(): void
}

export function createScrobbleService(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null
  const trackContext = new Map<string, { filePath?: string | null; coverPath?: string | null }>()

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    const trackKey = buildTrackKey(
      scrobble.source,
      scrobble.artist,
      scrobble.title,
      scrobble.album ?? null,
      scrobble.durationMs ?? null,
    )
    const ctx = trackKey ? trackContext.get(trackKey) : null
    // Fire after a brief delay to avoid competing with audio/UI in WebKitGTK
    setTimeout(() => {
      submitScrobble(scrobble, ctx, getAuthContext, getPkpPublicKey)
        .catch((err) => {
          console.error('[Scrobble] Submit failed:', err)
        })
        .finally(() => {
          if (trackKey) trackContext.delete(trackKey)
        })
    }, 2000)
  })

  return {
    start() {
      tickTimer = setInterval(() => engine.tick(), TICK_INTERVAL_MS)
    },

    stop() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = null
      }
      engine.onSessionGone(SESSION_KEY)
    },

    onTrackStart(meta: TrackMetadata) {
      const trackKey = buildTrackKey(
        SESSION_KEY,
        meta.artist,
        meta.title,
        meta.album ?? null,
        meta.durationMs ?? null,
      )
      if (trackKey) {
        trackContext.set(trackKey, { filePath: meta.filePath ?? null, coverPath: meta.coverPath ?? null })
      }
      engine.onMetadata(SESSION_KEY, meta)
    },

    onPlaybackChange(isPlaying: boolean) {
      engine.onPlayback(SESSION_KEY, isPlaying)
    },

    tick() {
      engine.tick()
    },
  }
}

// ── Lit Action V3 submit ────────────────────────────────────────────

async function submitScrobble(
  scrobble: ReadyScrobble,
  ctx: { filePath?: string | null; coverPath?: string | null } | null,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): Promise<void> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) {
    console.warn('[Scrobble] Not authenticated — skipping submit')
    return
  }

  const canUploadCover = !!FILEBASE_COVERS_ENCRYPTED_KEY
  const coverImage = (!scrobble.coverCid && ctx?.coverPath && canUploadCover)
    ? await readCoverBase64(ctx.coverPath)
    : null

  const track = {
    artist: scrobble.artist,
    title: scrobble.title,
    ...(scrobble.album ? { album: scrobble.album } : {}),
    playedAt: scrobble.playedAtSec,
    ...(scrobble.mbid ? { mbid: scrobble.mbid } : {}),
    ...(scrobble.ipId ? { ipId: scrobble.ipId } : {}),
    ...(scrobble.coverCid ? { coverCid: scrobble.coverCid } : {}),
    ...(coverImage ? { coverImage } : {}),
  }

  const litTracks = [track]

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000).toString()

  console.log('[Scrobble] Submitting via Lit Action V3 (internal signing)...')

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Single executeJs: action signs with user's PKP + sponsor PKP broadcasts
  const result = await litClient.executeJs({
    ipfsId: SCROBBLE_SUBMIT_V3_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      tracks: litTracks,
      timestamp,
      nonce,
      filebaseEncryptedKey: FILEBASE_COVERS_ENCRYPTED_KEY,
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

  if (!response.success) {
    throw new Error(`Scrobble submit failed: ${response.error || 'unknown'}`)
  }

  const uploadedCoverCid: string | undefined = response.coverCid
    || (response.coverCids ? (Object.values(response.coverCids)[0] as string | undefined) : undefined)
  if (uploadedCoverCid && ctx?.filePath) {
    await updateCoverCidNative(ctx.filePath, uploadedCoverCid)
  }

  console.log(`[Scrobble] On-chain! tx: ${response.txHash} (registered: ${response.registered}, scrobbled: ${response.scrobbled}, covers: ${response.coversSet ?? 0})`)

  // If a cover was set on-chain in a separate TX, wait for it to confirm
  // so the profile page query sees the coverCid when it refetches
  if (response.coverTxHash) {
    console.log(`[Scrobble] Waiting for cover TX ${response.coverTxHash} to confirm...`)
    await waitForTx(response.coverTxHash, 5000).catch(() => {
      console.warn('[Scrobble] Cover TX wait timed out, profile may need manual refresh for cover art')
    })
  }

  // Invalidate scrobbles query so profile page auto-refreshes
  try {
    const { queryClient } = await import('../main')
    queryClient.invalidateQueries({ queryKey: ['scrobbles'] })
  } catch {
    // Not fatal — user can refresh manually
  }
}

function buildTrackKey(
  source: string,
  artist: string | null,
  title: string | null,
  album: string | null,
  durationMs: number | null,
): string | null {
  if (!artist || !title) return null
  return `${source}|${artist}|${title}|${album ?? ''}|${durationMs ?? 0}`
}

const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'

async function waitForTx(txHash: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(MEGAETH_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    })
    const json = await res.json()
    if (json.result?.status) return
    await new Promise((r) => setTimeout(r, 500))
  }
}

let _isTauri: boolean | null = null
function isTauri(): boolean {
  if (_isTauri === null) {
    try {
      // Tauri v2: @tauri-apps/api sets __TAURI_INTERNALS__ on window
      _isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    } catch {
      _isTauri = false
    }
  }
  return _isTauri
}

function coverContentType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function readCoverBase64(coverPath: string): Promise<{ base64: string; contentType: string } | null> {
  if (!isTauri()) return null
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const bytes = await readFile(coverPath)
    if (!bytes || bytes.length === 0) return null
    return {
      base64: bytesToBase64(bytes),
      contentType: coverContentType(coverPath),
    }
  } catch (err) {
    console.warn('[Scrobble] Failed to read cover file:', err)
    return null
  }
}

async function updateCoverCidNative(filePath: string, coverCid: string): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('music_set_cover_cid', { filePath, coverCid })
  } catch (err) {
    console.warn('[Scrobble] Failed to cache cover CID locally:', err)
  }
}
