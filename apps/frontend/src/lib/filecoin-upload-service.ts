/**
 * Filecoin Upload Service — processes the upload queue one job at a time.
 *
 * Pipeline per job:
 *   1. reading    — read audio bytes from local file (Tauri readFile)
 *   2. encrypting — AES-GCM encrypt + Lit-encrypt key (content-crypto)
 *   3. depositing — ensure Synapse has enough USDFC deposit
 *   4. uploading  — upload encrypted blob to Filecoin via Synapse SDK
 *   5. registering— register content on-chain via Lit Action (ContentRegistry)
 *   6. done
 *
 * Uses the Synapse SDK's public API (synapse.storage.upload / synapse.payments).
 * Jobs run sequentially to avoid Filecoin nonce collisions.
 */

import { ethers } from 'ethers'
import { keccak256, encodeAbiParameters, type Hex } from 'viem'
import { Synapse, RPC_URLS, TOKENS } from '@filoz/synapse-sdk'
import type { PKPAuthContext, PKPInfo } from './lit'
import { PKPEthersSigner } from './lit/pkp-ethers-signer'
import {
  encryptForUpload,
  registerContent,
  computeContentId,
} from './content-service'
import {
  isProcessing,
  setIsProcessing,
  nextQueuedJob,
  updateJob,
  setQueueProcessor,
  persistUpload,
  type UploadJob,
} from './upload-manager'

// ── Constants ──────────────────────────────────────────────────────────

const FIL_RPC = RPC_URLS.mainnet.http
const USDFC_DECIMALS = 18

// ── TrackId computation ────────────────────────────────────────────────

/** Normalize string for trackId derivation (matches scrobble-submit-v3.js) */
function normalize(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Compute trackId from track metadata.
 * Matches the on-chain ScrobbleV3 logic and scrobble-submit-v3.js Lit Action.
 *
 * kind 1: MBID (MusicBrainz recording ID)
 * kind 3: metadata hash (keccak256(title, artist, album))
 */
export function computeTrackId(track: {
  title: string
  artist: string
  album?: string
  mbid?: string
}): string {
  if (track.mbid) {
    // Kind 1: MBID — payload is bytes32 of the MBID hex (strip dashes, pad)
    const mbidHex = ('0x' + track.mbid.replace(/-/g, '').padEnd(64, '0')) as Hex
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [1, mbidHex],
      ),
    )
  }

  // Kind 3: metadata hash
  const titleNorm = normalize(track.title)
  const artistNorm = normalize(track.artist)
  const albumNorm = normalize(track.album || '')

  const payload = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
      [titleNorm, artistNorm, albumNorm],
    ),
  )

  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }],
      [3, payload as Hex],
    ),
  )
}

// ── Service ────────────────────────────────────────────────────────────

export interface FilecoinUploadServiceDeps {
  getAuthContext: () => Promise<PKPAuthContext>
  getPkp: () => PKPInfo | null
}

let _deps: FilecoinUploadServiceDeps | null = null
let _synapse: Synapse | null = null

/**
 * Initialize the upload service and register the queue processor.
 * Call once at app startup (e.g. in AuthContext after login).
 */
export function initFilecoinUploadService(deps: FilecoinUploadServiceDeps) {
  _deps = deps
  _synapse = null // Reset cached Synapse instance on re-init
  setQueueProcessor(processQueue)
}

// ── Synapse singleton ──────────────────────────────────────────────────

/**
 * Get or create a cached Synapse instance for the current PKP signer.
 * Reuses the instance across uploads to benefit from SDK's internal caching
 * (provider selection, dataset reuse, etc.).
 */
async function getSynapse(pkp: PKPInfo, authContext: PKPAuthContext): Promise<Synapse> {
  if (_synapse) return _synapse

  const filProvider = new ethers.JsonRpcProvider(FIL_RPC)
  const pkpSigner = new PKPEthersSigner(pkp, authContext, filProvider)

  _synapse = await Synapse.create({
    signer: pkpSigner as any,
    withCDN: true,
  })

  return _synapse
}

// ── WebKit streaming fetch patch ───────────────────────────────────────

/**
 * Patch global Request/fetch for WebKit (Tauri/Safari) which doesn't support
 * ReadableStream request bodies. Converts streaming uploads to buffered.
 *
 * Returns a cleanup function to restore originals.
 */
function patchFetchForWebKit(): () => void {
  const OrigRequest = globalThis.Request
  const STREAM_KEY = Symbol('__streamBody')

  globalThis.Request = new Proxy(OrigRequest, {
    construct(target, args) {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined]
      if (init?.body instanceof ReadableStream) {
        const stream = init.body
        const patched = { ...init, body: null as BodyInit | null }
        delete (patched as any).duplex
        const req = new target(input, patched)
        ;(req as any)[STREAM_KEY] = stream
        return req
      }
      return new target(input, init)
    },
  }) as any

  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL | Request, init?: RequestInit) => {
    if (input instanceof OrigRequest && (input as any)[STREAM_KEY]) {
      const stream = (input as any)[STREAM_KEY] as ReadableStream<Uint8Array>
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      const totalLen = chunks.reduce((s, c) => s + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let off = 0
      for (const c of chunks) {
        merged.set(c, off)
        off += c.length
      }
      const newReq = new OrigRequest(input.url, {
        method: input.method,
        headers: input.headers,
        body: merged,
      })
      return origFetch(newReq)
    }
    return origFetch(input, init)
  }) as typeof fetch

  return () => {
    globalThis.fetch = origFetch
    globalThis.Request = OrigRequest
  }
}

// ── Queue processor ────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  if (isProcessing()) return

  setIsProcessing(true)
  try {
    let job: UploadJob | undefined
    while ((job = nextQueuedJob())) {
      await processJob(job)
    }
  } finally {
    setIsProcessing(false)
  }
}

async function processJob(job: UploadJob): Promise<void> {
  if (!_deps) {
    updateJob(job.id, { step: 'error', error: 'Upload service not initialized' })
    return
  }

  const pkp = _deps.getPkp()
  if (!pkp) {
    updateJob(job.id, { step: 'error', error: 'Not authenticated' })
    return
  }

  updateJob(job.id, { step: 'reading', startedAt: Date.now() })

  try {
    // ── Step 1: Read audio file ──
    console.log(`[Upload] Reading: ${job.title} — ${job.artist}`)
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const audioBytes = await readFile(job.filePath)
    if (!audioBytes || audioBytes.length === 0) {
      throw new Error('Audio file is empty or unreadable')
    }
    console.log(`[Upload] Read ${(audioBytes.length / 1024 / 1024).toFixed(1)} MB`)

    // Compute trackId + contentId
    const trackId = computeTrackId({
      title: job.title,
      artist: job.artist,
      album: '',
      mbid: undefined,
    })
    const contentId = computeContentId(trackId, pkp.ethAddress)
    updateJob(job.id, { trackId, contentId })

    const authContext = await _deps.getAuthContext()
    let uploadBlob: Uint8Array

    if (job.encrypted) {
      // ── Step 2: Encrypt ──
      updateJob(job.id, { step: 'encrypting' })
      console.log(`[Upload] Encrypting (contentId: ${contentId.slice(0, 10)}...)`)
      const encrypted = await encryptForUpload(audioBytes, contentId, authContext)
      console.log(`[Upload] Encrypted blob: ${(encrypted.blob.length / 1024 / 1024).toFixed(1)} MB`)
      uploadBlob = encrypted.blob
    } else {
      // Public upload — skip encryption
      console.log(`[Upload] Public upload — skipping encryption`)
      uploadBlob = audioBytes
    }

    // ── Step 3: Pre-flight checks ──
    console.log('[Upload] Checking storage balance...')

    const { checkUploadReady } = await import('./storage-service')
    const readiness = await checkUploadReady(pkp, authContext, uploadBlob.length)
    if (!readiness.ready) {
      throw new Error(readiness.reason || 'Storage not ready. Add funds on the Wallet page.')
    }
    console.log('[Upload] Storage ready, initializing Synapse...')

    const synapse = await getSynapse(pkp, authContext)

    // ── Step 4: Upload blob to Filecoin via Synapse SDK ──
    updateJob(job.id, { step: 'uploading' })
    console.log(`[Upload] Uploading ${(uploadBlob.length / 1024 / 1024).toFixed(1)} MB to Filecoin...`)

    // Patch fetch for WebKit streaming support
    const restoreFetch = patchFetchForWebKit()

    let pieceCid: string
    try {
      // Use createContext() (singular) which correctly merges withCDN into
      // metadata for dataset matching. The plural createContexts() path used
      // by synapse.storage.upload() has a bug: it passes empty metadata {},
      // which never matches existing CDN datasets (metadata { withCDN: '' }),
      // causing a new $1 CDN dataset to be created on every upload.
      // createContext() also caches internally so subsequent calls reuse it.
      const ctx = await synapse.storage.createContext({ withCDN: true })
      const uploadResult = await ctx.upload(uploadBlob)
      pieceCid = uploadResult.pieceCid.toString()
    } finally {
      restoreFetch()
    }

    if (!pieceCid) {
      throw new Error('Synapse upload returned no pieceCid')
    }
    console.log(`[Upload] Uploaded! pieceCid: ${pieceCid}`)
    updateJob(job.id, { pieceCid })

    // ── Step 5: Register on ContentRegistry ──
    updateJob(job.id, { step: 'registering' })
    console.log('[Upload] Registering on ContentRegistry...')

    const regResult = await registerContent(
      trackId,
      pieceCid,
      authContext,
      pkp.publicKey,
      pkp.ethAddress, // datasetOwner = self
      { title: job.title, artist: job.artist, album: '' },
      job.encrypted ? undefined : 0, // algo: 0 = plaintext
    )
    console.log(`[Upload] Registered! tx: ${regResult.txHash}`)

    // ── Done ──
    updateJob(job.id, { step: 'done', completedAt: Date.now() })
    // Persist to localStorage for the Uploaded tab
    persistUpload({ ...job, step: 'done', pieceCid, contentId, trackId, completedAt: Date.now() })
    console.log(`[Upload] Complete: ${job.title} — ${job.artist}`)
  } catch (err: any) {
    console.error(`[Upload] Failed: ${job.title}`, err)
    updateJob(job.id, {
      step: 'error',
      error: err.message || String(err),
    })
  }
}
