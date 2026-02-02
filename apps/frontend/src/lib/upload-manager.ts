/**
 * Upload Manager — signal-based queue for Filecoin content uploads.
 *
 * Each upload job tracks its step progression:
 *   reading → encrypting → depositing → uploading → registering → done | error
 *
 * Jobs run sequentially (one at a time) to avoid nonce collisions on Filecoin.
 */

import { createSignal } from 'solid-js'

export type UploadStep =
  | 'queued'
  | 'reading'
  | 'encrypting'
  | 'uploading'
  | 'registering'
  | 'done'
  | 'error'

export interface UploadJob {
  id: string
  title: string
  artist: string
  filePath: string
  step: UploadStep
  error?: string
  startedAt?: number
  completedAt?: number
  pieceCid?: string
  contentId?: string
  trackId?: string
  encrypted: boolean
}

const [jobs, setJobs] = createSignal<UploadJob[]>([])
const [isProcessing, setIsProcessing] = createSignal(false)

export { jobs, isProcessing, setIsProcessing }

let nextId = 0
let processQueue: (() => Promise<void>) | null = null

/**
 * Register the queue processor (called once from the service layer).
 * This avoids a circular dependency — the store doesn't import the service.
 */
export function setQueueProcessor(fn: () => Promise<void>) {
  processQueue = fn
}

/** Enqueue a new upload job */
export function enqueueUpload(track: {
  id: string
  title: string
  artist: string
  filePath: string
  encrypted?: boolean
}): string {
  const jobId = `upload-${nextId++}`
  const job: UploadJob = {
    id: jobId,
    title: track.title,
    artist: track.artist,
    filePath: track.filePath,
    step: 'queued',
    encrypted: track.encrypted !== false, // default true
  }
  setJobs((prev) => [...prev, job])

  // Kick the processor if not already running
  if (!isProcessing() && processQueue) {
    processQueue()
  }

  return jobId
}

/** Update a job's step */
export function updateJob(jobId: string, updates: Partial<UploadJob>) {
  setJobs((prev) =>
    prev.map((j) => (j.id === jobId ? { ...j, ...updates } : j)),
  )
}

/** Get the next queued job */
export function nextQueuedJob(): UploadJob | undefined {
  return jobs().find((j) => j.step === 'queued')
}

/** Remove a completed or errored job */
export function removeJob(jobId: string) {
  setJobs((prev) => prev.filter((j) => j.id !== jobId))
}

/** Clear all completed jobs */
export function clearCompleted() {
  setJobs((prev) => prev.filter((j) => j.step !== 'done'))
}

/** Check if there are any active (non-done, non-error) jobs */
export function hasActiveJobs(): boolean {
  return jobs().some((j) => j.step !== 'done' && j.step !== 'error' && j.step !== 'queued')
}

// ── Persistent upload history ─────────────────────────────────────────

const UPLOAD_HISTORY_KEY = 'heaven:upload-history'

export interface UploadedTrack {
  title: string
  artist: string
  pieceCid: string
  contentId: string
  trackId: string
  uploadedAt: number
  encrypted: boolean
}

/** Save a completed upload to persistent history */
export function persistUpload(job: UploadJob) {
  if (job.step !== 'done' || !job.pieceCid || !job.contentId || !job.trackId) return
  const history = getUploadHistory()
  // Dedupe by contentId
  if (history.some((h) => h.contentId === job.contentId)) return
  history.unshift({
    title: job.title,
    artist: job.artist,
    pieceCid: job.pieceCid,
    contentId: job.contentId,
    trackId: job.trackId,
    uploadedAt: job.completedAt || Date.now(),
    encrypted: job.encrypted,
  })
  localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(history))
}

/** Get all persisted uploads */
export function getUploadHistory(): UploadedTrack[] {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}
