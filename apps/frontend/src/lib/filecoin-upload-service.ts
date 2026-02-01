/**
 * Filecoin Upload Service — processes the upload queue one job at a time.
 *
 * Pipeline per job:
 *   1. reading    — read audio bytes from local file (Tauri readFile)
 *   2. encrypting — AES-GCM encrypt + Lit-encrypt key (content-crypto)
 *   3. depositing — ensure Synapse has enough USDFC deposit for the blob
 *   4. uploading  — upload encrypted blob to Synapse (Filecoin)
 *   5. registering— register content on-chain via Lit Action (ContentRegistry)
 *   6. done
 *
 * Jobs run sequentially to avoid Filecoin nonce collisions.
 */

import { ethers } from 'ethers'
import { keccak256, encodeAbiParameters, type Hex } from 'viem'
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
  type UploadJob,
} from './upload-manager'

// ── Constants ──────────────────────────────────────────────────────────

const FIL_RPC = 'https://api.calibration.node.glif.io/rpc/v1'
const USDFC_DECIMALS = 18
/** Deposit enough for ~1 GB of storage (generous buffer) */
const DEPOSIT_AMOUNT = ethers.parseUnits('0.10', USDFC_DECIMALS)

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

/**
 * Initialize the upload service and register the queue processor.
 * Call once at app startup (e.g. in AuthContext after login).
 */
export function initFilecoinUploadService(deps: FilecoinUploadServiceDeps) {
  _deps = deps
  setQueueProcessor(processQueue)
}

// ── Queue processor ────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  // Prevent concurrent processing
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
      album: '', // LocalTrack doesn't always have album in the job
      mbid: undefined, // TODO: pass mbid from LocalTrack
    })
    const contentId = computeContentId(trackId, pkp.ethAddress)
    updateJob(job.id, { trackId, contentId })

    // ── Step 2: Encrypt ──
    updateJob(job.id, { step: 'encrypting' })
    console.log(`[Upload] Encrypting (contentId: ${contentId.slice(0, 10)}...)`)
    const authContext = await _deps.getAuthContext()
    const encrypted = await encryptForUpload(audioBytes, contentId, authContext)
    console.log(`[Upload] Encrypted blob: ${(encrypted.blob.length / 1024 / 1024).toFixed(1)} MB`)

    // ── Step 3: Deposit on Filecoin ──
    updateJob(job.id, { step: 'depositing' })
    console.log('[Upload] Initializing Synapse + depositing...')

    const filProvider = new ethers.JsonRpcProvider(FIL_RPC)
    const pkpSigner = new PKPEthersSigner(pkp, authContext, filProvider)

    // Pre-check: does the wallet have any tFIL for gas?
    const tfilBalance = await filProvider.getBalance(pkp.ethAddress)
    if (tfilBalance === 0n) {
      throw new Error(
        'Your wallet has no tFIL on Filecoin Calibration. ' +
        'Get test FIL from https://faucet.calibnet.chainsafe-fil.io and send to ' +
        pkp.ethAddress,
      )
    }
    console.log(`[Upload] tFIL balance: ${ethers.formatEther(tfilBalance)}`)

    const { Synapse } = await import('@filoz/synapse-sdk')
    let synapse: any
    try {
      synapse = await Synapse.create({
        signer: pkpSigner as any,
        withCDN: true,
        disableNonceManager: false,
      })
    } catch (err: any) {
      throw new Error(
        'Failed to initialize Filecoin storage. Your wallet may need USDFC tokens. ' +
        `(${err.message?.slice(0, 80) || err})`,
      )
    }

    // Check balance and deposit if needed
    const payments = (synapse as any)._payments
    let available: bigint
    try {
      const accountInfo = await payments.accountInfo()
      available = accountInfo.availableFunds as bigint
    } catch {
      // First-time user — no account yet, need initial deposit
      available = 0n
      console.log('[Upload] No existing Synapse account — will create with deposit')
    }

    if (available < DEPOSIT_AMOUNT) {
      console.log(`[Upload] Low balance (${ethers.formatUnits(available, USDFC_DECIMALS)} USDFC), depositing...`)
      const warmStorageAddr = (synapse as any)._warmStorageAddress
      const maxUint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      try {
        const depositTx = await payments.depositWithPermitAndApproveOperator(
          DEPOSIT_AMOUNT,
          warmStorageAddr,
          maxUint,
          maxUint,
          2880 * 30, // 30 days
        )
        console.log(`[Upload] Deposit tx: ${depositTx.hash}`)
        await depositTx.wait()
        console.log('[Upload] Deposit confirmed')
      } catch (err: any) {
        throw new Error(
          'USDFC deposit failed. Your wallet needs USDFC tokens on Filecoin Calibration. ' +
          `(${err.message?.slice(0, 80) || err})`,
        )
      }
    } else {
      console.log(`[Upload] Balance OK: ${ethers.formatUnits(available, USDFC_DECIMALS)} USDFC`)
    }

    // ── Step 4: Upload blob to Synapse ──
    updateJob(job.id, { step: 'uploading' })
    console.log(`[Upload] Uploading ${(encrypted.blob.length / 1024 / 1024).toFixed(1)} MB to Filecoin...`)

    // Synapse SDK uses `new Request(url, { body: ReadableStream, duplex:'half' })`
    // which WebKit (Tauri/Safari) doesn't support. Patch both Request and fetch:
    // - Request: strip ReadableStream body, stash it as a hidden property
    // - fetch: read stashed stream into Uint8Array, reconstruct with buffer body
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

    let uploadResult: any
    try {
      // Use createContext with forceCreateDataSet:false to reuse existing data sets
      // (matches POC pattern — avoids provider needing to create a new data set each time)
      const storageManager = (synapse as any).storage ?? (synapse as any)._storageManager
      let reuseDataSetId: number | undefined
      try {
        const dataSets: any[] | undefined = storageManager?.findDataSets
          ? await storageManager.findDataSets(pkp.ethAddress)
          : await (synapse as any)._warmStorageService?.getClientDataSetsWithDetails?.(
              pkp.ethAddress,
              true,
            )
        if (Array.isArray(dataSets) && dataSets.length > 0) {
          const live = dataSets.filter(
            (ds) => ds?.isLive && ds?.isManaged && (ds?.pdpEndEpoch ?? 0) === 0,
          )
          const matchingCdn = live.filter((ds) => ds?.withCDN === true)
          const candidates = (matchingCdn.length > 0 ? matchingCdn : live).sort(
            (a, b) => (b?.currentPieceCount ?? 0) - (a?.currentPieceCount ?? 0),
          )
          const chosen = candidates[0]
          reuseDataSetId = chosen?.pdpVerifierDataSetId ?? chosen?.dataSetId
          console.log(
            `[Upload] Data sets: total=${dataSets.length}, live=${live.length}, withCDN=${matchingCdn.length}, using=${reuseDataSetId ?? 'none'}`,
          )
        }
      } catch (err: any) {
        console.warn(
          `[Upload] Could not list existing data sets: ${err?.message?.slice(0, 120) || err}`,
        )
      }

      const excludeProviderIds: number[] = []
      const maxProviderAttempts = 3
      let lastError: any

      for (let attempt = 1; attempt <= maxProviderAttempts; attempt++) {
        const context = await storageManager.createContext({
          withCDN: true,
          forceCreateDataSet: false,
          ...(reuseDataSetId != null ? { dataSetId: reuseDataSetId } : {}),
          ...(excludeProviderIds.length > 0 ? { excludeProviderIds } : {}),
          callbacks: {
            onProviderSelected: (provider: any) => {
              console.log(`[Upload] Provider selected: ${provider?.id ?? 'unknown'}`)
            },
            onDataSetResolved: ({ isExisting, dataSetId, provider }: any) => {
              console.log(
                `[Upload] DataSet resolved: existing=${isExisting}, id=${dataSetId}, provider=${provider?.id ?? 'unknown'}`,
              )
            },
          },
        })
        console.log(
          `[Upload] Context: dataSetId=${context.dataSetId}, withCDN=${context.withCDN}, provider=${context.provider?.id ?? 'unknown'}`,
        )

        try {
          uploadResult = await context.upload(encrypted.blob)
          lastError = undefined
          break
        } catch (err: any) {
          lastError = err
          const msg = err?.message || String(err)
          const providerId = context?.provider?.id
          const isProviderError =
            msg.includes('Service Provider') ||
            msg.includes('addPieces failed') ||
            msg.includes('Failed to create data set') ||
            msg.includes('insufficient funds')

          if (reuseDataSetId == null && isProviderError && providerId != null) {
            excludeProviderIds.push(providerId)
            console.warn(
              `[Upload] Provider ${providerId} failed (${msg.slice(0, 120)}); retrying with another provider...`,
            )
            continue
          }

          throw err
        }
      }

      if (!uploadResult && lastError) {
        throw lastError
      }
    } finally {
      globalThis.fetch = origFetch
      globalThis.Request = OrigRequest
    }
    const pieceCid = uploadResult.pieceCid || (uploadResult as any).piece_cid
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
    )
    console.log(`[Upload] Registered! tx: ${regResult.txHash}`)

    // ── Done ──
    updateJob(job.id, { step: 'done', completedAt: Date.now() })
    console.log(`[Upload] Complete: ${job.title} — ${job.artist}`)
  } catch (err: any) {
    console.error(`[Upload] Failed: ${job.title}`, err)
    updateJob(job.id, {
      step: 'error',
      error: err.message || String(err),
    })
  }
}
