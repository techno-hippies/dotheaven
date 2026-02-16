import type { Component } from 'solid-js'
import { Show, For, createMemo } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button } from '../../primitives/button'
import { TextField, TextArea } from '../../primitives/text-field'
import { Select, type SelectOption } from '../../primitives/select'
import { Spinner } from '../../primitives/spinner'
import { MusicNote, Image, Check, Warning, Plus, X } from '../../icons'

// ── Types ──────────────────────────────────────────────────────────

export interface SongFormData {
  title: string
  artist: string
  genre: string
  primaryLanguage: string
  secondaryLanguage: string
  lyrics: string
  coverFile: File | null
  audioFile: File | null
  vocalsFile: File | null
  instrumentalFile: File | null
  canvasFile: File | null
  license: LicenseType
  revShare: number
  mintingFee: string
  attestation: boolean
}

export type LicenseType =
  | 'non-commercial'
  | 'commercial-use'
  | 'commercial-remix'

export type PublishStep =
  | 'song'
  | 'canvas'
  | 'details'
  | 'license'
  | 'publishing'
  | 'success'
  | 'error'

export interface SongPublishFormProps {
  step: PublishStep
  formData: SongFormData
  onFormChange: (data: Partial<SongFormData>) => void
  onNext: () => void
  onBack: () => void
  onSkip?: () => void
  onPublish: () => void
  onDone?: () => void
  /** Publishing progress (0-100) */
  progress?: number
  /** Error message */
  error?: string
  /** Published result */
  result?: {
    ipId: string
    tokenId: string
    audioCid: string
    instrumentalCid: string
  }
  class?: string
}

// ── Constants ──────────────────────────────────────────────────────

const GENRE_OPTIONS: SelectOption[] = [
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'hip-hop', label: 'Hip-Hop / Rap' },
  { value: 'rnb', label: 'R&B / Soul' },
  { value: 'electronic', label: 'Electronic / Dance' },
  { value: 'blues', label: 'Blues' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'classical', label: 'Classical' },
  { value: 'country', label: 'Country' },
  { value: 'folk', label: 'Folk / Acoustic' },
  { value: 'metal', label: 'Metal' },
  { value: 'punk', label: 'Punk' },
  { value: 'indie', label: 'Indie' },
  { value: 'kpop', label: 'K-Pop' },
  { value: 'jpop', label: 'J-Pop' },
  { value: 'latin', label: 'Latin' },
  { value: 'reggae', label: 'Reggae / Dancehall' },
  { value: 'afrobeats', label: 'Afrobeats' },
  { value: 'ambient', label: 'Ambient' },
  { value: 'soundtrack', label: 'Soundtrack / Score' },
  { value: 'other', label: 'Other' },
]

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: '', label: 'None' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'tr', label: 'Turkish' },
  { value: 'th', label: 'Thai' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'id', label: 'Indonesian' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'sw', label: 'Swahili' },
]

const LICENSE_OPTIONS: { value: LicenseType; label: string; description: string }[] = [
  {
    value: 'non-commercial',
    label: 'Non-Commercial Social Remixing',
    description: 'Anyone can remix and share freely, but not for profit.',
  },
  {
    value: 'commercial-use',
    label: 'Commercial Use',
    description: 'Others pay a license fee to use your song commercially.',
  },
  {
    value: 'commercial-remix',
    label: 'Commercial Remix',
    description: 'Others pay to remix commercially. You earn ongoing royalties.',
  },
]

// ── Helpers ────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Shared: File dropzone ──────────────────────────────────────────

const FileDropzone: Component<{
  icon: Component<{ class?: string }>
  iconClass?: string
  label: string
  hint: string
  accept: string
  file: File | null
  onSelect: (file: File) => void
  onRemove: () => void
}> = (props) => {
  let inputRef: HTMLInputElement | undefined

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) props.onSelect(file)
        }}
      />
      <Show
        when={props.file}
        fallback={
          <button
            type="button"
            class={cn(
              'w-full flex items-center gap-3.5 p-4 rounded-xl',
              'border border-dashed border-[var(--border-subtle)]',
              'bg-[var(--bg-surface)]',
              'hover:border-[var(--accent-blue)]/40 hover:bg-[var(--bg-elevated)]/50',
              'transition-colors cursor-pointer',
            )}
            onClick={() => inputRef?.click()}
          >
            <props.icon class={cn('w-5 h-5 flex-shrink-0', props.iconClass ?? 'text-[var(--accent-blue)]')} />
            <div class="text-left">
              <p class="font-medium text-[var(--text-primary)]">{props.label}</p>
              <p class="text-base text-[var(--text-muted)]">{props.hint}</p>
            </div>
          </button>
        }
      >
        {(file) => (
          <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)]">
            <div class="w-9 h-9 rounded-lg bg-[var(--bg-highlight)] flex items-center justify-center flex-shrink-0">
              <props.icon class={cn('w-4 h-4', props.iconClass ?? 'text-[var(--accent-blue)]')} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-[var(--text-primary)] truncate">{file().name}</p>
              <p class="text-base text-[var(--text-muted)]">{formatFileSize(file().size)}</p>
            </div>
            <button
              type="button"
              class="text-base text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-1"
              onClick={() => {
                props.onRemove()
                if (inputRef) inputRef.value = ''
              }}
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        )}
      </Show>
    </div>
  )
}

// ── Step 1: Your Song ──────────────────────────────────────────────

const SongStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
}> = (props) => {
  let coverInputRef: HTMLInputElement | undefined

  const genreValue = createMemo(() =>
    GENRE_OPTIONS.find((o) => o.value === props.formData.genre)
  )

  return (
    <div class="flex flex-col gap-5">
      {/* Cover art + metadata — stacks on mobile */}
      <div class="flex flex-col sm:flex-row gap-5">
        {/* Cover art */}
        <div class="flex-shrink-0 self-center sm:self-start">
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) props.onChange({ coverFile: file })
            }}
          />
          <Show
            when={props.formData.coverFile}
            fallback={
              <button
                type="button"
                class={cn(
                  'w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] rounded-lg flex flex-col items-center justify-center gap-2',
                  'bg-[var(--bg-elevated)] border border-dashed border-[var(--border-subtle)]',
                  'hover:border-[var(--accent-blue)]/40 transition-colors cursor-pointer',
                )}
                onClick={() => coverInputRef?.click()}
              >
                <Image class="w-6 h-6 text-[var(--text-muted)]" />
                <span class="text-base text-[var(--text-muted)]">Cover art</span>
              </button>
            }
          >
            {(file) => (
              <div class="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] group">
                <img
                  src={URL.createObjectURL(file())}
                  alt="Cover art"
                  class="w-full h-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  class={cn(
                    'absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100',
                    'transition-opacity cursor-pointer flex items-center justify-center',
                    'text-base text-white font-medium',
                  )}
                  onClick={() => {
                    props.onChange({ coverFile: null })
                    if (coverInputRef) coverInputRef.value = ''
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </Show>
        </div>

        {/* Title / Artist / Album */}
        <div class="flex flex-col gap-3 flex-1 min-w-0 justify-center">
          <TextField
            label="Title"
            value={props.formData.title}
            onChange={(v) => props.onChange({ title: v })}
            placeholder="Song title"
            required
          />
          <TextField
            label="Artist"
            value={props.formData.artist}
            onChange={(v) => props.onChange({ artist: v })}
            placeholder="Artist name"
            required
          />
        </div>
      </div>

      {/* Song file */}
      <FileDropzone
        icon={MusicNote}
        label="Choose song file"
        hint="MP3, WAV, M4A, or WebM — max 50 MB"
        accept="audio/mpeg,audio/wav,audio/mp4,audio/webm"
        file={props.formData.audioFile}
        onSelect={(f) => props.onChange({ audioFile: f })}
        onRemove={() => props.onChange({ audioFile: null })}
      />

      {/* Instrumental */}
      <FileDropzone
        icon={MusicNote}
        iconClass="text-[var(--accent-purple)]"
        label="Choose instrumental track"
        hint="MP3, WAV, M4A, or WebM — max 50 MB"
        accept="audio/mpeg,audio/wav,audio/mp4,audio/webm"
        file={props.formData.instrumentalFile}
        onSelect={(f) => props.onChange({ instrumentalFile: f })}
        onRemove={() => props.onChange({ instrumentalFile: null })}
      />

      {/* Genre */}
      <div>
        <label class="text-base font-medium text-[var(--text-secondary)] mb-1.5 block">Genre</label>
        <Select
          options={GENRE_OPTIONS}
          value={genreValue()}
          onChange={(v) => props.onChange({ genre: v?.value ?? '' })}
          placeholder="Select genre..."
        />
      </div>
    </div>
  )
}

// ── Step 2: Canvas ─────────────────────────────────────────────────

const CanvasStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
}> = (props) => {
  let videoInputRef: HTMLInputElement | undefined

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
        {/* 9:16 video preview */}
        <div class="flex-shrink-0">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm"
            class="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) props.onChange({ canvasFile: file })
            }}
          />
          <Show
            when={props.formData.canvasFile}
            fallback={
              <button
                type="button"
                class={cn(
                  'w-[150px] h-[267px] sm:w-[180px] sm:h-[320px] rounded-xl flex flex-col items-center justify-center gap-3',
                  'bg-[var(--bg-elevated)] border border-dashed border-[var(--border-subtle)]',
                  'hover:border-[var(--accent-coral)]/40 transition-colors cursor-pointer',
                )}
                onClick={() => videoInputRef?.click()}
              >
                <Plus class="w-6 h-6 text-[var(--text-muted)]" />
                <span class="text-base text-[var(--text-muted)]">Add video</span>
              </button>
            }
          >
            {(file) => (
              <div class="relative w-[150px] h-[267px] sm:w-[180px] sm:h-[320px] rounded-xl overflow-hidden group">
                <video
                  src={URL.createObjectURL(file())}
                  class="w-full h-full object-cover"
                  autoplay
                  loop
                  muted
                  playsinline
                />
                <button
                  type="button"
                  class={cn(
                    'absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100',
                    'transition-opacity cursor-pointer flex items-center justify-center',
                    'text-base text-white font-medium',
                  )}
                  onClick={() => {
                    props.onChange({ canvasFile: null })
                    if (videoInputRef) videoInputRef.value = ''
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </Show>
        </div>

        {/* Guidelines */}
        <div class="flex flex-col gap-5 flex-1">
          <div>
            <p class="font-semibold text-[var(--text-primary)] mb-3">File requirements</p>
            <ul class="space-y-2">
              {['9:16 aspect ratio', 'At least 720px tall', 'MP4 or WebM format', '3 to 8 seconds long (loops)', 'No text overlays or URLs'].map((req) => (
                <li class="flex items-start gap-2 text-base text-[var(--text-secondary)]">
                  <span class="text-[var(--text-muted)] font-bold mt-px">·</span>
                  {req}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Details ────────────────────────────────────────────────

const DetailsStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
}> = (props) => {

  const primaryLangValue = createMemo(() =>
    LANGUAGE_OPTIONS.find((o) => o.value === props.formData.primaryLanguage)
  )

  const secondaryLangValue = createMemo(() =>
    LANGUAGE_OPTIONS.find((o) => o.value === props.formData.secondaryLanguage)
  )

  return (
    <div class="flex flex-col gap-5">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-base font-medium text-[var(--text-secondary)] mb-1.5 block">
            Primary language <span class="text-[var(--accent-coral)]">*</span>
          </label>
          <Select
            options={LANGUAGE_OPTIONS.filter((o) => o.value !== '')}
            value={primaryLangValue()}
            onChange={(v) => props.onChange({ primaryLanguage: v?.value ?? '' })}
            placeholder="Select..."
          />
        </div>
        <div>
          <label class="text-base font-medium text-[var(--text-secondary)] mb-1.5 block">
            Secondary language
          </label>
          <Select
            options={LANGUAGE_OPTIONS}
            value={secondaryLangValue()}
            onChange={(v) => props.onChange({ secondaryLanguage: v?.value ?? '' })}
            placeholder="None"
          />
          <p class="text-base text-[var(--text-muted)] mt-1">For bilingual songs (K-Pop, etc.)</p>
        </div>
      </div>

      <div>
        <div class="flex justify-between items-center mb-1.5">
          <label class="text-base font-medium text-[var(--text-secondary)]">Lyrics</label>
          <span class="text-base text-[var(--text-muted)]">Optional</span>
        </div>
        <TextArea
          value={props.formData.lyrics}
          onChange={(v) => props.onChange({ lyrics: v })}
          placeholder={'[Verse 1]\nPaste or type lyrics here...\n\n[Chorus]\n...'}
          textAreaClass="min-h-[200px] font-mono"
        />
        <p class="text-base text-[var(--text-muted)] mt-1.5">
          Include [Verse], [Chorus], [Bridge] markers for synced lyrics and translation.
        </p>
      </div>
    </div>
  )
}

// ── Step 4: License & Publish ──────────────────────────────────────

const LicenseStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
}> = (props) => {
  const langLabel = (code: string) =>
    LANGUAGE_OPTIONS.find((o) => o.value === code)?.label ?? code

  return (
    <div class="flex flex-col gap-5">
      {/* License options */}
      <div class="flex flex-col gap-2">
        <For each={LICENSE_OPTIONS}>
          {(option) => (
            <button
              type="button"
              class={cn(
                'w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors cursor-pointer',
                'border',
                props.formData.license === option.value
                  ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/5'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-default)] bg-[var(--bg-surface)]',
              )}
              onClick={() => props.onChange({ license: option.value })}
            >
              <div class={cn(
                'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                props.formData.license === option.value
                  ? 'border-[var(--accent-blue)]'
                  : 'border-[var(--text-muted)]',
              )}>
                <Show when={props.formData.license === option.value}>
                  <div class="w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
                </Show>
              </div>
              <div>
                <p class="font-medium text-[var(--text-primary)]">{option.label}</p>
                <p class="text-base text-[var(--text-muted)] mt-0.5">{option.description}</p>
              </div>
            </button>
          )}
        </For>
      </div>

      {/* Rev share fields */}
      <Show when={props.formData.license !== 'non-commercial'}>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Revenue share %"
            value={String(props.formData.revShare)}
            onChange={(v) => {
              const n = parseInt(v, 10)
              if (!isNaN(n) && n >= 0 && n <= 100) props.onChange({ revShare: n })
            }}
            placeholder="10"
          />
          <TextField
            label="License fee"
            value={props.formData.mintingFee}
            onChange={(v) => props.onChange({ mintingFee: v })}
            placeholder="0"
          />
        </div>
      </Show>

      {/* Attestation */}
      <label class={cn(
        'flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors',
        props.formData.attestation
          ? 'border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]',
      )}>
        <div class={cn(
          'w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
          props.formData.attestation
            ? 'bg-[var(--accent-blue)]'
            : 'border-2 border-[var(--text-muted)]',
        )}>
          <Show when={props.formData.attestation}>
            <Check class="w-3 h-3 text-white" />
          </Show>
        </div>
        <div>
          <p class="text-base font-medium text-[var(--text-primary)]">
            I own or have the rights to distribute this work
          </p>
          <p class="text-base text-[var(--text-muted)] mt-0.5">
            False claims may result in a Story Protocol dispute and removal.
          </p>
        </div>
        <input
          type="checkbox"
          class="sr-only"
          checked={props.formData.attestation}
          onChange={(e) => props.onChange({ attestation: e.currentTarget.checked })}
        />
      </label>

      {/* Review summary */}
      <div class="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div class="flex gap-3 items-center mb-3">
          <Show when={props.formData.coverFile}>
            {(file) => (
              <img
                src={URL.createObjectURL(file())}
                alt="Cover"
                class="w-10 h-10 rounded-md object-cover flex-shrink-0"
              />
            )}
          </Show>
          <Show when={!props.formData.coverFile}>
            <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex-shrink-0" />
          </Show>
          <div class="min-w-0">
            <p class="font-semibold text-[var(--text-primary)] truncate">
              {props.formData.title || 'Untitled'}
            </p>
            <p class="text-base text-[var(--text-secondary)] truncate">
              {props.formData.artist}
            </p>
          </div>
        </div>
        <div class="border-t border-[var(--bg-elevated)] pt-3 space-y-1.5 text-base">
          <div class="flex justify-between">
            <span class="text-[var(--text-muted)]">Genre</span>
            <span class="text-[var(--text-primary)]">
              {GENRE_OPTIONS.find((o) => o.value === props.formData.genre)?.label ?? '—'}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--text-muted)]">Language</span>
            <span class="text-[var(--text-primary)]">
              {langLabel(props.formData.primaryLanguage) || '—'}
              <Show when={props.formData.secondaryLanguage}>
                {` / ${langLabel(props.formData.secondaryLanguage)}`}
              </Show>
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--text-muted)]">Lyrics</span>
            <span class="text-[var(--text-primary)]">
              {props.formData.lyrics.trim() ? `${props.formData.lyrics.trim().split('\n').length} lines` : '—'}
            </span>
          </div>
          <Show when={props.formData.license !== 'non-commercial'}>
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">License</span>
              <span class="text-[var(--text-primary)]">
                {LICENSE_OPTIONS.find((o) => o.value === props.formData.license)?.label} · {props.formData.revShare}%
              </span>
            </div>
          </Show>
          <div class="flex justify-between">
            <span class="text-[var(--text-muted)]">Song</span>
            <span class="text-[var(--text-primary)]">
              {props.formData.audioFile?.name ?? '—'}
              <Show when={props.formData.audioFile}>
                {` · ${formatFileSize(props.formData.audioFile!.size)}`}
              </Show>
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Step: Publishing ───────────────────────────────────────────────

const PublishingStep: Component<{ progress?: number }> = (props) => {
  const label = createMemo(() => {
    const p = props.progress ?? 0
    if (p < 15) return 'Generating audio fingerprint...'
    if (p < 40) return 'Uploading to IPFS...'
    if (p < 60) return 'Aligning lyrics...'
    if (p < 75) return 'Translating lyrics...'
    if (p < 90) return 'Registering IP on Story Protocol...'
    return 'Finalizing...'
  })

  return (
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <Spinner size="lg" class="text-[var(--accent-blue)]" />
      <p class="text-[var(--text-primary)] font-medium">{label()}</p>
      <div class="w-full max-w-xs">
        <div class="h-1.5 rounded-full bg-[var(--bg-highlight)] overflow-hidden">
          <div
            class="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-500"
            style={{ width: `${props.progress ?? 0}%` }}
          />
        </div>
        <p class="text-base text-[var(--text-muted)] text-center mt-1">{props.progress ?? 0}%</p>
      </div>
    </div>
  )
}

// ── Step: Success ──────────────────────────────────────────────────

const SuccessStep: Component<{
  result?: SongPublishFormProps['result']
  onDone?: () => void
}> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <div class="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
        <Check class="w-7 h-7 text-green-400" />
      </div>
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">Published!</h2>
      <p class="text-[var(--text-secondary)] text-center max-w-sm">
        Your song is now registered as an IP Asset on Story Protocol and available on IPFS.
      </p>
      <Show when={props.result}>
        {(r) => (
          <div class="w-full space-y-1 text-base bg-[var(--bg-elevated)] p-3 rounded-lg font-mono">
            <p class="text-[var(--text-muted)]">IP ID: <span class="text-[var(--text-secondary)]">{r().ipId}</span></p>
            <p class="text-[var(--text-muted)]">Token: <span class="text-[var(--text-secondary)]">{r().tokenId}</span></p>
            <p class="text-[var(--text-muted)]">CID: <span class="text-[var(--text-secondary)]">{r().audioCid}</span></p>
            <Show when={r().instrumentalCid}>
              <p class="text-[var(--text-muted)]">Instrumental: <span class="text-[var(--text-secondary)]">{r().instrumentalCid}</span></p>
            </Show>
          </div>
        )}
      </Show>
      <Button onClick={() => props.onDone?.()}>Done</Button>
    </div>
  )
}

// ── Step: Error ────────────────────────────────────────────────────

const ErrorStep: Component<{
  error?: string
  onBack: () => void
}> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <div class="w-14 h-14 rounded-full bg-[var(--accent-coral)]/10 flex items-center justify-center">
        <Warning class="w-7 h-7 text-[var(--accent-coral)]" />
      </div>
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">Publishing failed</h2>
      <p class="text-[var(--accent-coral)] text-center max-w-sm">
        {props.error || 'Something went wrong. Please try again.'}
      </p>
      <Button variant="secondary" onClick={props.onBack}>Try again</Button>
    </div>
  )
}

// ── Step headers ──────────────────────────────────────────────────

const STEP_CONFIG: Record<string, { title: string; subtitle: string }> = {
  song: { title: 'Your Song', subtitle: 'Upload your track and set the basics' },
  canvas: { title: 'Canvas', subtitle: 'Add a looping video that plays behind your cover art' },
  details: { title: 'Details', subtitle: 'Language and lyrics for translation support' },
  license: { title: 'License & Publish', subtitle: 'Choose how others can use your music' },
}

export const PUBLISH_STEPS: PublishStep[] = ['song', 'canvas', 'details', 'license']

export function isPublishFormStep(step: PublishStep): boolean {
  return PUBLISH_STEPS.includes(step)
}

export function isPublishNextDisabled(step: PublishStep, formData: SongFormData): boolean {
  switch (step) {
    case 'song':
      return !formData.title.trim()
        || !formData.artist.trim()
        || !formData.audioFile
        || !formData.instrumentalFile
    case 'details':
      return !formData.primaryLanguage
    case 'license':
      return !formData.attestation
    default:
      return false
  }
}

// ── Main Component ─────────────────────────────────────────────────

export const SongPublishForm: Component<SongPublishFormProps> = (props) => {
  const stepIndex = createMemo(() => PUBLISH_STEPS.indexOf(props.step))
  const config = createMemo(() => STEP_CONFIG[props.step])
  const isFormStep = createMemo(() => stepIndex() >= 0)

  return (
    <div class={cn('w-full [&_.text-base]:text-base', props.class)}>
      {/* Progress bar — thin segments */}
      <Show when={isFormStep()}>
        <div class="flex gap-1.5 mb-5">
          <For each={PUBLISH_STEPS}>
            {(_, i) => (
              <div class={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i() <= stepIndex() ? 'bg-[var(--accent-blue)]' : 'bg-[var(--bg-elevated)]',
              )} />
            )}
          </For>
        </div>
      </Show>

      {/* Step header */}
      <Show when={config()}>
        {(cfg) => (
          <div class="mb-5">
            <div class="flex items-center justify-between">
              <h1 class="text-xl font-semibold text-[var(--text-primary)]">{cfg().title}</h1>
              <Show when={props.step === 'canvas' && props.onSkip}>
                <button
                  type="button"
                  class="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  onClick={props.onSkip}
                >
                  Skip
                </button>
              </Show>
            </div>
            <p class="text-[var(--text-secondary)]">{cfg().subtitle}</p>
          </div>
        )}
      </Show>

      <Show when={props.step === 'song'}>
        <SongStep formData={props.formData} onChange={props.onFormChange} />
      </Show>

      <Show when={props.step === 'canvas'}>
        <CanvasStep formData={props.formData} onChange={props.onFormChange} />
      </Show>

      <Show when={props.step === 'details'}>
        <DetailsStep formData={props.formData} onChange={props.onFormChange} />
      </Show>

      <Show when={props.step === 'license'}>
        <LicenseStep formData={props.formData} onChange={props.onFormChange} />
      </Show>

      <Show when={props.step === 'publishing'}>
        <PublishingStep progress={props.progress} />
      </Show>

      <Show when={props.step === 'success'}>
        <SuccessStep result={props.result} onDone={props.onDone} />
      </Show>

      <Show when={props.step === 'error'}>
        <ErrorStep error={props.error} onBack={props.onBack} />
      </Show>

    </div>
  )
}
