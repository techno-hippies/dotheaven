/**
 * UploadQueue — floating panel showing Filecoin upload job progress.
 *
 * Two variants:
 * - UploadQueue: connected to upload-manager signals (use in app)
 * - UploadQueuePanel: props-driven (use in Storybook)
 */

import { type Component, For, Show, createMemo, onCleanup, createSignal } from 'solid-js'
import { jobs, removeJob, clearCompleted, type UploadJob, type UploadStep } from '../lib/upload-manager'
import { Collapsible, CollapsibleTrigger, CollapsibleContent, ProgressBar, IconButton } from '@heaven/ui'

const STEP_LABELS: Record<UploadStep, string> = {
  queued: 'Queued',
  reading: 'Reading...',
  encrypting: 'Encrypting...',
  uploading: 'Uploading...',
  registering: 'Registering...',
  done: 'Complete',
  error: 'Failed',
}

const STEP_ORDER: UploadStep[] = ['reading', 'encrypting', 'uploading', 'registering', 'done']

function stepProgress(step: UploadStep): number {
  const idx = STEP_ORDER.indexOf(step)
  if (idx < 0) return 0
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100)
}

function friendlyError(error?: string): string {
  if (!error) return 'Unknown error'
  if (error.includes('Service Provider') && error.includes('insufficient funds'))
    return 'Storage provider low on funds — retry later'
  if (error.includes('insufficient funds') || error.includes('no tFIL'))
    return 'No FIL for gas — fund your wallet'
  if (error.includes('addPieces failed') || error.includes('Failed to create data set'))
    return 'Storage provider error — retry later'
  if (error.includes('No USDFC deposited'))
    return 'Deposit USDFC on the Wallet page first'
  if (error.includes('PaymentsService') || error.includes('account information') || error.includes('CALL_EXCEPTION') || error.includes('missing revert data'))
    return 'Wallet needs FIL + USDFC on Filecoin'
  if (error.includes('Not authenticated'))
    return 'Sign in first'
  if (error.includes('No signature'))
    return 'Signing failed — try again'
  if (error.includes('empty or unreadable') || error.includes('readFile'))
    return 'Could not read audio file'
  if (error.includes('pieceCid'))
    return 'Upload failed — try again'
  if (error.length > 80) return error.slice(0, 77) + '...'
  return error
}

function formatElapsed(startedAt?: number, completedAt?: number, now?: number): string {
  if (!startedAt) return ''
  const end = completedAt || now || Date.now()
  const secs = Math.floor((end - startedAt) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

// ── Props-driven panel (Storybook-friendly) ────────────────────────────

export interface UploadQueuePanelProps {
  jobs: UploadJob[]
  onRemoveJob?: (jobId: string) => void
  onClearCompleted?: () => void
  inline?: boolean
}

export const UploadQueuePanel: Component<UploadQueuePanelProps> = (props) => {
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  const activeCount = createMemo(() =>
    props.jobs.filter((j) => j.step !== 'done' && j.step !== 'error').length,
  )
  const hasCompleted = createMemo(() =>
    props.jobs.some((j) => j.step === 'done'),
  )

  return (
    <Collapsible
      defaultOpen
      class={`w-80 shadow-xl ${props.inline ? '' : 'fixed bottom-20 right-4 z-50'}`}
    >
      <CollapsibleTrigger class="flex items-center justify-between w-full px-3 py-2 rounded-t-md text-[var(--text-primary)] select-none">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span>Uploads</span>
          <Show when={activeCount() > 0}>
            <span class="text-[var(--text-muted)]">({activeCount()})</span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <Show when={hasCompleted()}>
            <button
              type="button"
              class="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-1"
              onClick={(e) => { e.stopPropagation(); props.onClearCompleted?.() }}
            >
              Clear
            </button>
          </Show>
          <svg
            class="w-4 h-4 text-[var(--text-muted)] transition-transform group-data-[expanded]:rotate-180"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div class="max-h-64 overflow-y-auto">
          <For each={props.jobs}>
            {(job) => {
              const isDone = job.step === 'done'
              const isError = job.step === 'error'
              const isActive = !isDone && !isError && job.step !== 'queued'
              const progress = stepProgress(job.step)

              return (
                <div class="px-3 py-2 border-t border-[var(--border-subtle)]">
                  <div class="flex items-center justify-between">
                    <div class="truncate flex-1 mr-2 text-[var(--text-primary)]">{job.title}</div>
                    <div class="flex items-center gap-1 text-[var(--text-muted)] tabular-nums shrink-0">
                      {formatElapsed(job.startedAt, job.completedAt, now())}
                      <Show when={isDone || isError}>
                        <IconButton
                          variant="soft"
                          size="sm"
                          aria-label="Remove"
                          onClick={() => props.onRemoveJob?.(job.id)}
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </IconButton>
                      </Show>
                    </div>
                  </div>
                  <div class="text-[var(--text-muted)] text-sm mt-0.5">{job.artist}</div>
                  <Show when={isActive}>
                    <div class="text-[var(--text-secondary)] text-sm mt-0.5">{STEP_LABELS[job.step]}</div>
                    <ProgressBar value={progress} class="mt-1" />
                  </Show>
                  <Show when={isDone}>
                    <ProgressBar value={100} variant="success" class="mt-1" />
                  </Show>
                  <Show when={isError}>
                    <div class="flex items-start gap-1.5 mt-1.5 px-2 py-1.5 bg-red-500/10 rounded-md">
                      <svg class="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <span class="text-red-400 text-sm">{friendlyError(job.error)}</span>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Signal-connected wrapper (app use) ─────────────────────────────────

export const UploadQueue: Component = () => {
  const currentJobs = createMemo(() => jobs())

  return (
    <Show when={currentJobs().length > 0}>
      <UploadQueuePanel
        jobs={currentJobs()}
        onRemoveJob={removeJob}
        onClearCompleted={clearCompleted}
      />
    </Show>
  )
}
