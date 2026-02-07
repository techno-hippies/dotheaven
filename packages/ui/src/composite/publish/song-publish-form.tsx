import type { Component } from 'solid-js'
import { Show, For, createMemo } from 'solid-js'
import { cn } from '../../lib/utils'
import { Button } from '../../primitives/button'
import { TextField, TextArea } from '../../primitives/text-field'
import { Select, type SelectOption } from '../../primitives/select'
import { Spinner } from '../../primitives/spinner'
import { Stepper } from '../../primitives/stepper'
import { MusicNote, Image, Check, ChevronLeft, Warning } from '../../icons'

// ── Types ──────────────────────────────────────────────────────────

export interface SongFormData {
  title: string
  artist: string
  album: string
  genre: string
  primaryLanguage: string
  secondaryLanguage: string
  lyrics: string
  coverFile: File | null
  audioFile: File | null
  previewStart: number
  previewEnd: number
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
  | 'upload'
  | 'details'
  | 'lyrics'
  | 'license'
  | 'review'
  | 'publishing'
  | 'success'
  | 'error'

export interface SongPublishFormProps {
  step: PublishStep
  formData: SongFormData
  onFormChange: (data: Partial<SongFormData>) => void
  onNext: () => void
  onBack: () => void
  onPublish: () => void
  onDone?: () => void
  /** AcoustID check result */
  copyrightCheck?: {
    status: 'idle' | 'checking' | 'clear' | 'match'
    matchInfo?: string
  }
  /** Publishing progress (0-100) */
  progress?: number
  /** Error message */
  error?: string
  /** Published result */
  result?: {
    ipId: string
    tokenId: string
    audioCid: string
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
    description: 'Others pay a license fee to use your song commercially. You earn revenue share on derivatives.',
  },
  {
    value: 'commercial-remix',
    label: 'Commercial Remix',
    description: 'Others pay to remix your song commercially. You earn ongoing royalties from all derivatives.',
  },
]

// ── Helpers ────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Step: Upload ───────────────────────────────────────────────────

const UploadStep: Component<{
  formData: SongFormData
  copyrightCheck?: SongPublishFormProps['copyrightCheck']
  onChange: (data: Partial<SongFormData>) => void
  onNext: () => void
}> = (props) => {
  let audioInputRef: HTMLInputElement | undefined
  let coverInputRef: HTMLInputElement | undefined

  const canProceed = createMemo(() =>
    !!props.formData.audioFile && props.copyrightCheck?.status !== 'checking'
    && props.copyrightCheck?.status !== 'match'
  )

  return (
    <div class="flex flex-col gap-6">
      {/* Audio file */}
      <div>
        <label class="text-base font-medium text-[var(--text-primary)] mb-2 block">
          Audio file <span class="text-[var(--accent-coral)]">*</span>
        </label>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/webm"
          class="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            if (file) props.onChange({ audioFile: file })
          }}
        />
        <Show
          when={props.formData.audioFile}
          fallback={
            <button
              type="button"
              class={cn(
                'w-full p-8 rounded-md border-2 border-dashed border-[var(--bg-highlight-hover)]',
                'hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-highlight)]/50',
                'transition-colors cursor-pointer flex flex-col items-center gap-3',
              )}
              onClick={() => audioInputRef?.click()}
            >
              <MusicNote class="w-10 h-10 text-[var(--text-muted)]" />
              <div class="text-center">
                <p class="text-[var(--text-primary)] font-medium">Choose audio file</p>
                <p class="text-base text-[var(--text-muted)]">MP3, WAV, M4A, or WebM (max 50 MB)</p>
              </div>
            </button>
          }
        >
          {(file) => (
            <div class="flex items-center gap-3 p-3 rounded-md bg-[var(--bg-highlight)]">
              <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0">
                <MusicNote class="w-5 h-5 text-[var(--accent-blue)]" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-base font-medium text-[var(--text-primary)] truncate">{file().name}</p>
                <p class="text-sm text-[var(--text-muted)]">{formatFileSize(file().size)}</p>
              </div>
              <button
                type="button"
                class="text-base text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                onClick={() => {
                  props.onChange({ audioFile: null })
                  if (audioInputRef) audioInputRef.value = ''
                }}
              >
                Remove
              </button>
            </div>
          )}
        </Show>

        {/* AcoustID check status */}
        <Show when={props.copyrightCheck && props.copyrightCheck.status !== 'idle'}>
          <div class={cn(
            'mt-2 flex items-center gap-2 text-base px-3 py-2 rounded-md',
            props.copyrightCheck?.status === 'checking' && 'bg-[var(--bg-highlight)] text-[var(--text-secondary)]',
            props.copyrightCheck?.status === 'clear' && 'bg-green-500/10 text-green-400',
            props.copyrightCheck?.status === 'match' && 'bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]',
          )}>
            <Show when={props.copyrightCheck?.status === 'checking'}>
              <Spinner size="sm" />
              <span>Checking audio fingerprint...</span>
            </Show>
            <Show when={props.copyrightCheck?.status === 'clear'}>
              <Check class="w-4 h-4" />
              <span>No known matches found</span>
            </Show>
            <Show when={props.copyrightCheck?.status === 'match'}>
              <Warning class="w-4 h-4" />
              <span>Possible match: {props.copyrightCheck?.matchInfo}</span>
            </Show>
          </div>
        </Show>
      </div>

      {/* Cover art */}
      <div>
        <label class="text-base font-medium text-[var(--text-primary)] mb-2 block">Cover art</label>
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
                'w-32 h-32 rounded-md border-2 border-dashed border-[var(--bg-highlight-hover)]',
                'hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-highlight)]/50',
                'transition-colors cursor-pointer flex flex-col items-center justify-center gap-2',
              )}
              onClick={() => coverInputRef?.click()}
            >
              <Image class="w-6 h-6 text-[var(--text-muted)]" />
              <span class="text-sm text-[var(--text-muted)]">Add cover</span>
            </button>
          }
        >
          {(file) => (
            <div class="relative w-32 h-32 group">
              <img
                src={URL.createObjectURL(file())}
                alt="Cover art"
                class="w-32 h-32 rounded-md object-cover"
              />
              <button
                type="button"
                class={cn(
                  'absolute inset-0 rounded-md bg-black/60 opacity-0 group-hover:opacity-100',
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

      <div class="flex justify-end">
        <Button disabled={!canProceed()} onClick={props.onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}

// ── Step: Details ──────────────────────────────────────────────────

const DetailsStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
  onNext: () => void
  onBack: () => void
}> = (props) => {
  const canProceed = createMemo(() =>
    !!props.formData.title.trim() && !!props.formData.artist.trim() && !!props.formData.primaryLanguage
  )

  const genreValue = createMemo(() =>
    GENRE_OPTIONS.find((o) => o.value === props.formData.genre)
  )

  const primaryLangValue = createMemo(() =>
    LANGUAGE_OPTIONS.find((o) => o.value === props.formData.primaryLanguage)
  )

  const secondaryLangValue = createMemo(() =>
    LANGUAGE_OPTIONS.find((o) => o.value === props.formData.secondaryLanguage)
  )

  return (
    <div class="flex flex-col gap-4">
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

      <TextField
        label="Album"
        value={props.formData.album}
        onChange={(v) => props.onChange({ album: v })}
        placeholder="Album or single name (optional)"
      />

      <div>
        <label class="text-base font-medium text-[var(--text-primary)] mb-2 block">Genre</label>
        <Select
          options={GENRE_OPTIONS}
          value={genreValue()}
          onChange={(v) => props.onChange({ genre: v?.value ?? '' })}
          placeholder="Select genre..."
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-base font-medium text-[var(--text-primary)] mb-2 block">
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
          <label class="text-base font-medium text-[var(--text-primary)] mb-2 block">
            Secondary language
          </label>
          <Select
            options={LANGUAGE_OPTIONS}
            value={secondaryLangValue()}
            onChange={(v) => props.onChange({ secondaryLanguage: v?.value ?? '' })}
            placeholder="None"
          />
          <p class="text-sm text-[var(--text-muted)] mt-1">For bilingual songs (K-Pop, etc.)</p>
        </div>
      </div>

      <div class="flex justify-between">
        <Button variant="ghost" onClick={props.onBack}>
          <ChevronLeft class="w-4 h-4" /> Back
        </Button>
        <Button disabled={!canProceed()} onClick={props.onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}

// ── Step: Lyrics ───────────────────────────────────────────────────

const LyricsStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
  onNext: () => void
  onBack: () => void
}> = (props) => {
  return (
    <div class="flex flex-col gap-4">
      <TextArea
        label="Lyrics"
        value={props.formData.lyrics}
        onChange={(v) => props.onChange({ lyrics: v })}
        placeholder={'[Verse 1]\nPaste or type lyrics here...\n\n[Chorus]\n...'}
        textAreaClass="min-h-[200px] font-mono text-base"
        description="Include section markers like [Verse], [Chorus], [Bridge]. Enables synced lyrics and translation."
      />

      <p class="text-sm text-[var(--text-muted)]">
        Lyrics are optional but enable word-level synced playback and automatic translation.
      </p>

      <div class="flex justify-between">
        <Button variant="ghost" onClick={props.onBack}>
          <ChevronLeft class="w-4 h-4" /> Back
        </Button>
        <Button onClick={props.onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}

// ── Step: License ──────────────────────────────────────────────────

const LicenseStep: Component<{
  formData: SongFormData
  onChange: (data: Partial<SongFormData>) => void
  onNext: () => void
  onBack: () => void
}> = (props) => {
  return (
    <div class="flex flex-col gap-4">
      <div>
        <label class="text-base font-medium text-[var(--text-primary)] mb-3 block">
          License type <span class="text-[var(--accent-coral)]">*</span>
        </label>
        <div class="flex flex-col gap-2">
          <For each={LICENSE_OPTIONS}>
            {(option) => (
              <button
                type="button"
                class={cn(
                  'w-full text-left p-3 rounded-md border-2 transition-colors cursor-pointer',
                  props.formData.license === option.value
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/5'
                    : 'border-[var(--bg-highlight)] hover:border-[var(--bg-highlight-hover)] bg-[var(--bg-highlight)]/50',
                )}
                onClick={() => props.onChange({ license: option.value })}
              >
                <p class="text-base font-medium text-[var(--text-primary)]">{option.label}</p>
                <p class="text-sm text-[var(--text-secondary)] mt-0.5">{option.description}</p>
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={props.formData.license !== 'non-commercial'}>
        <div class="grid grid-cols-2 gap-3">
          <TextField
            label="Revenue share %"
            value={String(props.formData.revShare)}
            onChange={(v) => {
              const n = parseInt(v, 10)
              if (!isNaN(n) && n >= 0 && n <= 100) props.onChange({ revShare: n })
            }}
            placeholder="10"
            description="% of derivative revenue"
          />
          <TextField
            label="License fee (WIP)"
            value={props.formData.mintingFee}
            onChange={(v) => props.onChange({ mintingFee: v })}
            placeholder="0"
            description="Fee to mint a license"
          />
        </div>
      </Show>

      {/* Copyright attestation */}
      <label class={cn(
        'flex items-start gap-3 p-3 rounded-md cursor-pointer',
        'border-2 transition-colors',
        props.formData.attestation
          ? 'border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5'
          : 'border-[var(--bg-highlight)] hover:border-[var(--bg-highlight-hover)]',
      )}>
        <div class={cn(
          'w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
          props.formData.attestation
            ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)]'
            : 'border-[var(--text-muted)]',
        )}>
          <Show when={props.formData.attestation}>
            <Check class="w-3 h-3 text-white" />
          </Show>
        </div>
        <div>
          <p class="text-base font-medium text-[var(--text-primary)]">
            I own or have the rights to distribute this work
          </p>
          <p class="text-sm text-[var(--text-secondary)] mt-0.5">
            By publishing, you confirm you hold the copyright or a valid license for this content.
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

      <div class="flex justify-between">
        <Button variant="ghost" onClick={props.onBack}>
          <ChevronLeft class="w-4 h-4" /> Back
        </Button>
        <Button disabled={!props.formData.attestation} onClick={props.onNext}>
          Review
        </Button>
      </div>
    </div>
  )
}

// ── Step: Review ───────────────────────────────────────────────────

const ReviewStep: Component<{
  formData: SongFormData
  onBack: () => void
  onPublish: () => void
}> = (props) => {
  const langLabel = (code: string) =>
    LANGUAGE_OPTIONS.find((o) => o.value === code)?.label ?? code

  const licenseLabel = (type: LicenseType) =>
    LICENSE_OPTIONS.find((o) => o.value === type)?.label ?? type

  return (
    <div class="flex flex-col gap-4">
      <div class="flex gap-4">
        <Show when={props.formData.coverFile}>
          {(file) => (
            <img
              src={URL.createObjectURL(file())}
              alt="Cover"
              class="w-20 h-20 rounded-md object-cover flex-shrink-0"
            />
          )}
        </Show>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold text-[var(--text-primary)] truncate">
            {props.formData.title || 'Untitled'}
          </h3>
          <p class="text-base text-[var(--text-secondary)]">{props.formData.artist}</p>
          <Show when={props.formData.album}>
            <p class="text-sm text-[var(--text-muted)]">{props.formData.album}</p>
          </Show>
        </div>
      </div>

      <div class="space-y-2 text-base">
        <div class="flex justify-between py-1.5 border-b border-[var(--bg-highlight)]">
          <span class="text-[var(--text-muted)]">Genre</span>
          <span class="text-[var(--text-primary)]">
            {GENRE_OPTIONS.find((o) => o.value === props.formData.genre)?.label ?? 'Not set'}
          </span>
        </div>
        <div class="flex justify-between py-1.5 border-b border-[var(--bg-highlight)]">
          <span class="text-[var(--text-muted)]">Language</span>
          <span class="text-[var(--text-primary)]">
            {langLabel(props.formData.primaryLanguage)}
            <Show when={props.formData.secondaryLanguage}>
              {' / '}{langLabel(props.formData.secondaryLanguage)}
            </Show>
          </span>
        </div>
        <div class="flex justify-between py-1.5 border-b border-[var(--bg-highlight)]">
          <span class="text-[var(--text-muted)]">Lyrics</span>
          <span class="text-[var(--text-primary)]">
            {props.formData.lyrics.trim() ? `${props.formData.lyrics.trim().split('\n').length} lines` : 'None'}
          </span>
        </div>
        <div class="flex justify-between py-1.5 border-b border-[var(--bg-highlight)]">
          <span class="text-[var(--text-muted)]">License</span>
          <span class="text-[var(--text-primary)]">{licenseLabel(props.formData.license)}</span>
        </div>
        <Show when={props.formData.license !== 'non-commercial'}>
          <div class="flex justify-between py-1.5 border-b border-[var(--bg-highlight)]">
            <span class="text-[var(--text-muted)]">Rev share</span>
            <span class="text-[var(--text-primary)]">{props.formData.revShare}%</span>
          </div>
        </Show>
        <div class="flex justify-between py-1.5">
          <span class="text-[var(--text-muted)]">Audio</span>
          <span class="text-[var(--text-primary)]">
            {props.formData.audioFile?.name ?? '—'} ({formatFileSize(props.formData.audioFile?.size ?? 0)})
          </span>
        </div>
      </div>

      <div class="flex justify-between pt-2">
        <Button variant="ghost" onClick={props.onBack}>
          <ChevronLeft class="w-4 h-4" /> Back
        </Button>
        <Button onClick={props.onPublish}>
          Publish Song
        </Button>
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
        <p class="text-sm text-[var(--text-muted)] text-center mt-1">{props.progress ?? 0}%</p>
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
      <div class="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
        <Check class="w-8 h-8 text-green-400" />
      </div>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">Published!</h2>
      <p class="text-base text-[var(--text-secondary)] text-center max-w-sm">
        Your song is now registered as an IP Asset on Story Protocol and available on IPFS.
      </p>
      <Show when={props.result}>
        {(r) => (
          <div class="w-full space-y-1 text-sm bg-[var(--bg-highlight)] p-3 rounded-md font-mono">
            <p class="text-[var(--text-muted)]">IP ID: <span class="text-[var(--text-secondary)]">{r().ipId}</span></p>
            <p class="text-[var(--text-muted)]">Token: <span class="text-[var(--text-secondary)]">{r().tokenId}</span></p>
            <p class="text-[var(--text-muted)]">CID: <span class="text-[var(--text-secondary)]">{r().audioCid}</span></p>
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
      <div class="w-16 h-16 rounded-full bg-[var(--accent-coral)]/10 flex items-center justify-center">
        <Warning class="w-8 h-8 text-[var(--accent-coral)]" />
      </div>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">Publishing failed</h2>
      <p class="text-base text-[var(--accent-coral)] text-center max-w-sm">
        {props.error || 'Something went wrong. Please try again.'}
      </p>
      <Button variant="secondary" onClick={props.onBack}>Try again</Button>
    </div>
  )
}

// ── Step index mapping ─────────────────────────────────────────────

const PUBLISH_STEPS: PublishStep[] = ['upload', 'details', 'lyrics', 'license', 'review']

// ── Main Component ─────────────────────────────────────────────────

export const SongPublishForm: Component<SongPublishFormProps> = (props) => {
  const stepIndex = createMemo(() => PUBLISH_STEPS.indexOf(props.step))

  return (
    <div class={cn('w-full max-w-lg mx-auto', props.class)}>
      {/* Stepper — hidden during terminal states */}
      <Show when={stepIndex() >= 0}>
        <Stepper steps={5} currentStep={stepIndex()} showLabels={false} class="mb-6" />
      </Show>

      {/* Header */}
      <div class="mb-4">
        <h1 class="text-xl font-semibold text-[var(--text-primary)]">Publish Song</h1>
        <p class="text-base text-[var(--text-secondary)]">
          Upload and register your music as an IP Asset
        </p>
      </div>

      <Show when={props.step === 'upload'}>
        <UploadStep
          formData={props.formData}
          copyrightCheck={props.copyrightCheck}
          onChange={props.onFormChange}
          onNext={props.onNext}
        />
      </Show>

      <Show when={props.step === 'details'}>
        <DetailsStep
          formData={props.formData}
          onChange={props.onFormChange}
          onNext={props.onNext}
          onBack={props.onBack}
        />
      </Show>

      <Show when={props.step === 'lyrics'}>
        <LyricsStep
          formData={props.formData}
          onChange={props.onFormChange}
          onNext={props.onNext}
          onBack={props.onBack}
        />
      </Show>

      <Show when={props.step === 'license'}>
        <LicenseStep
          formData={props.formData}
          onChange={props.onFormChange}
          onNext={props.onNext}
          onBack={props.onBack}
        />
      </Show>

      <Show when={props.step === 'review'}>
        <ReviewStep
          formData={props.formData}
          onBack={props.onBack}
          onPublish={props.onPublish}
        />
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
