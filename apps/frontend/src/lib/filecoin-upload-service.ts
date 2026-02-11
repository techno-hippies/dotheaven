/**
 * Storage Upload Service (Load-first) — processes upload queue jobs sequentially.
 *
 * Pipeline per job:
 *   1. read local audio bytes
 *   2. optional Lit encryption
 *   3. upload blob to backend Load route
 *   4. register content on-chain
 */

import { keccak256, encodeAbiParameters, type Hex } from 'viem'
import type { PKPAuthContext, PKPInfo } from './lit'
import { encryptForUpload, registerContent, computeContentId } from './content-service'
import {
  isProcessing,
  setIsProcessing,
  nextQueuedJob,
  updateJob,
  setQueueProcessor,
  persistUpload,
  type UploadJob,
} from './upload-manager'

const HEAVEN_API_URL = import.meta.env.VITE_HEAVEN_API_URL || 'http://localhost:8787'

function normalize(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

export function computeTrackId(track: {
  title: string
  artist: string
  album?: string
  mbid?: string
}): string {
  if (track.mbid) {
    const mbidHex = ('0x' + track.mbid.replace(/-/g, '').padEnd(64, '0')) as Hex
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [1, mbidHex],
      ),
    )
  }

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

export interface FilecoinUploadServiceDeps {
  getAuthContext: () => Promise<PKPAuthContext>
  getPkp: () => PKPInfo | null
}

let _deps: FilecoinUploadServiceDeps | null = null

export function initFilecoinUploadService(deps: FilecoinUploadServiceDeps) {
  _deps = deps
  setQueueProcessor(processQueue)
}

async function uploadBlobToLoad(blob: Uint8Array, filenameHint: string): Promise<string> {
  const fileName = `${filenameHint.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track'}.bin`
  const payload = new Uint8Array(blob)
  const file = new File([payload], fileName, { type: 'application/octet-stream' })
  const form = new FormData()
  form.append('file', file)
  form.append('contentType', 'application/octet-stream')
  form.append(
    'tags',
    JSON.stringify([
      { key: 'App-Name', value: 'Heaven' },
      { key: 'Upload-Source', value: 'frontend-load-route' },
    ]),
  )

  const response = await fetch(`${HEAVEN_API_URL}/api/load/upload`, {
    method: 'POST',
    body: form,
  })
  const text = await response.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!response.ok) {
    const err = json?.error || `Load upload failed (${response.status})`
    throw new Error(err)
  }

  const id = json?.id
  if (!id || typeof id !== 'string') {
    throw new Error('Load upload succeeded but returned no id')
  }
  return id
}

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
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const audioBytes = await readFile(job.filePath)
    if (!audioBytes || audioBytes.length === 0) {
      throw new Error('Audio file is empty or unreadable')
    }

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
      updateJob(job.id, { step: 'encrypting' })
      const encrypted = await encryptForUpload(audioBytes, contentId, authContext)
      uploadBlob = encrypted.blob
    } else {
      uploadBlob = audioBytes
    }

    updateJob(job.id, { step: 'uploading' })
    const pieceCid = await uploadBlobToLoad(uploadBlob, job.title)
    updateJob(job.id, { pieceCid })

    updateJob(job.id, { step: 'registering' })
    let coverImage: { base64: string; contentType: string } | undefined
    if (job.coverPath) {
      try {
        const coverBytes = await readFile(job.coverPath)
        if (coverBytes && coverBytes.length > 0 && coverBytes.length <= 5 * 1024 * 1024) {
          const ext = job.coverPath.split('.').pop()?.toLowerCase() || 'jpg'
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            bmp: 'image/bmp',
          }
          const contentType = mimeMap[ext] || 'image/jpeg'
          let binary = ''
          for (let i = 0; i < coverBytes.length; i++) binary += String.fromCharCode(coverBytes[i])
          coverImage = { base64: btoa(binary), contentType }
        }
      } catch {}
    }

    await registerContent(
      trackId,
      pieceCid,
      authContext,
      pkp.publicKey,
      undefined,
      { title: job.title, artist: job.artist, album: '' },
      job.encrypted ? undefined : 0,
      coverImage,
    )

    const completedAt = Date.now()
    updateJob(job.id, { step: 'done', completedAt })
    persistUpload({ ...job, step: 'done', pieceCid, contentId, trackId, completedAt })
  } catch (err: any) {
    updateJob(job.id, {
      step: 'error',
      error: err?.message || String(err),
    })
  }
}
