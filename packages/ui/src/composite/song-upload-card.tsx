import { type Component, createSignal, For, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { TextField, TextArea, Button, Checkbox, FileInput } from '../primitives'
import { InfoCard, InfoCardSection, InfoCardRow } from './info-card'

const ChevronDownIcon = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)

export interface SongUploadFormData {
  audioFile: File | null
  previewFile: File | null
  coverFile: File | null
  title: string
  artist: string
  lyrics: string
  sourceLanguage: string
  targetLanguages: string[]
  commercialRevShare: number
  defaultMintingFee: string
}

export interface SongUploadCardProps {
  /** Form data (controlled) */
  value?: Partial<SongUploadFormData>
  /** Change handler */
  onChange?: (data: Partial<SongUploadFormData>) => void
  /** Submit handler */
  onSubmit?: (data: SongUploadFormData) => Promise<void>
  /** Loading state (when Lit Actions are running) */
  loading?: boolean
  /** Additional class */
  class?: string
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
]

const TARGET_LANGUAGES = [
  { code: 'zh', label: 'Chinese (Simplified)', defaultChecked: true },
  { code: 'ja', label: 'Japanese', defaultChecked: false },
  { code: 'ko', label: 'Korean', defaultChecked: false },
  { code: 'es', label: 'Spanish', defaultChecked: false },
  { code: 'fr', label: 'French', defaultChecked: false },
]

/**
 * SongUploadCard - Complete song upload form with Story Protocol integration
 *
 * Features:
 * - Audio file upload (required)
 * - Preview clip upload (optional, auto-generated if not provided)
 * - Album cover upload (required)
 * - Song metadata (title, artist)
 * - Lyrics input for alignment + translation
 * - Language selection (source + target translations)
 * - License terms display (PIL Commercial Remix)
 * - Single "Publish" action that chains song-publish + story-register Lit Actions
 */
export const SongUploadCard: Component<SongUploadCardProps> = (props) => {
  const [showAdvanced, setShowAdvanced] = createSignal(false)

  // Internal state (uncontrolled mode)
  const [audioFiles, setAudioFiles] = createSignal<File[]>([])
  const [previewFiles, setPreviewFiles] = createSignal<File[]>([])
  const [coverFiles, setCoverFiles] = createSignal<File[]>([])
  const [title, setTitle] = createSignal('')
  const [artist, setArtist] = createSignal('')
  const [lyrics, setLyrics] = createSignal('')
  const [sourceLanguage, setSourceLanguage] = createSignal('en')
  const [targetLanguages, setTargetLanguages] = createSignal<Set<string>>(new Set(['zh']))
  const [commercialRevShare, setCommercialRevShare] = createSignal(10)
  const [defaultMintingFee, setDefaultMintingFee] = createSignal('0')

  // Get current form data (controlled or uncontrolled)
  const formData = () => ({
    audioFile: props.value?.audioFile ?? (audioFiles()[0] || null),
    previewFile: props.value?.previewFile ?? (previewFiles()[0] || null),
    coverFile: props.value?.coverFile ?? (coverFiles()[0] || null),
    title: props.value?.title ?? title(),
    artist: props.value?.artist ?? artist(),
    lyrics: props.value?.lyrics ?? lyrics(),
    sourceLanguage: props.value?.sourceLanguage ?? sourceLanguage(),
    targetLanguages: props.value?.targetLanguages ?? Array.from(targetLanguages()),
    commercialRevShare: props.value?.commercialRevShare ?? commercialRevShare(),
    defaultMintingFee: props.value?.defaultMintingFee ?? defaultMintingFee(),
  })

  const updateField = <K extends keyof SongUploadFormData>(
    field: K,
    value: SongUploadFormData[K]
  ) => {
    if (props.onChange) {
      props.onChange({ ...props.value, [field]: value })
    } else {
      // Update internal state
      if (field === 'title') setTitle(value as string)
      else if (field === 'artist') setArtist(value as string)
      else if (field === 'lyrics') setLyrics(value as string)
      else if (field === 'sourceLanguage') setSourceLanguage(value as string)
      else if (field === 'targetLanguages') setTargetLanguages(new Set(value as string[]))
      else if (field === 'commercialRevShare') setCommercialRevShare(value as number)
      else if (field === 'defaultMintingFee') setDefaultMintingFee(value as string)
    }
  }

  const toggleTargetLanguage = (code: string) => {
    const newSet = new Set(formData().targetLanguages)
    if (newSet.has(code)) {
      newSet.delete(code)
    } else {
      newSet.add(code)
    }
    updateField('targetLanguages', Array.from(newSet))
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const data = formData()
    if (!data.audioFile || !data.coverFile || !data.title || !data.artist || !data.lyrics) {
      // Validation would go here
      return
    }
    await props.onSubmit?.(data as SongUploadFormData)
  }

  const isValid = () => {
    const data = formData()
    return !!(
      data.audioFile &&
      data.coverFile &&
      data.title?.trim() &&
      data.artist?.trim() &&
      data.lyrics?.trim() &&
      data.targetLanguages.length > 0
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      class={cn('flex flex-col gap-6 p-6 bg-[var(--bg-surface)] rounded-lg', props.class)}
    >
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-bold text-[var(--text-primary)]">Upload Song</h2>
        <p class="text-sm text-[var(--text-secondary)]">
          Publish your song with Story Protocol IP registration, lyrics alignment, and multi-language
          translation.
        </p>
      </div>

      {/* Audio Files */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileInput
          label="Audio File *"
          description="Full audio file (MP3, WAV, or M4A, max 50 MB)"
          accept={['audio/mpeg', 'audio/wav', 'audio/mp4']}
          maxFileSize={50 * 1024 * 1024}
          onFileChange={(details) => {
            setAudioFiles(details.acceptedFiles || [])
            updateField('audioFile', details.acceptedFiles?.[0] || null)
          }}
          disabled={props.loading}
        />

        <FileInput
          label="Preview Clip"
          description="Optional 30s preview (auto-generated if not provided)"
          accept={['audio/mpeg', 'audio/wav', 'audio/mp4']}
          maxFileSize={5 * 1024 * 1024}
          onFileChange={(details) => {
            setPreviewFiles(details.acceptedFiles || [])
            updateField('previewFile', details.acceptedFiles?.[0] || null)
          }}
          disabled={props.loading}
        />
      </div>

      {/* Album Cover */}
      <FileInput
        label="Album Cover *"
        description="Square image (PNG, JPG, or WebP, max 5 MB)"
        accept="image/*"
        maxFileSize={5 * 1024 * 1024}
        onFileChange={(details) => {
          setCoverFiles(details.acceptedFiles || [])
          updateField('coverFile', details.acceptedFiles?.[0] || null)
        }}
        disabled={props.loading}
      />

      {/* Song Metadata */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="Song Title *"
          placeholder="Enter song title"
          value={formData().title}
          onChange={(val) => updateField('title', val)}
          disabled={props.loading}
          required
        />

        <TextField
          label="Artist Name *"
          placeholder="Enter artist name"
          value={formData().artist}
          onChange={(val) => updateField('artist', val)}
          disabled={props.loading}
          required
        />
      </div>

      {/* Lyrics */}
      <TextArea
        label="Lyrics *"
        placeholder="Enter song lyrics (one line per line, section markers like [Verse 1] are optional)"
        value={formData().lyrics}
        onChange={(val) => updateField('lyrics', val)}
        disabled={props.loading}
        required
        class="min-h-[200px]"
      />

      {/* Language Selection */}
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[var(--text-primary)]">
            Source Language *
          </label>
          <select
            value={formData().sourceLanguage}
            onChange={(e) => updateField('sourceLanguage', e.currentTarget.value)}
            disabled={props.loading}
            class={cn(
              'px-4 py-2.5 rounded-lg bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
              'border border-transparent outline-none',
              'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <For each={SUPPORTED_LANGUAGES}>
              {(lang) => <option value={lang.code}>{lang.label}</option>}
            </For>
          </select>
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-sm font-medium text-[var(--text-primary)]">
            Translation Languages *
          </label>
          <For each={TARGET_LANGUAGES}>
            {(lang) => (
              <Checkbox
                label={lang.label}
                checked={formData().targetLanguages.includes(lang.code)}
                onChange={() => toggleTargetLanguage(lang.code)}
                disabled={props.loading}
              />
            )}
          </For>
        </div>
      </div>

      {/* License Terms (Read-only) */}
      <InfoCard class="bg-[var(--bg-page)]">
        <InfoCardSection title="License Terms">
          <p class="text-sm text-[var(--text-muted)] -mt-2 mb-2">PIL Commercial Remix</p>
          <InfoCardRow label="Commercial Use" value="Allowed" />
          <InfoCardRow label="Derivatives" value="Allowed (Reciprocal)" />
          <InfoCardRow
            label="Revenue Share"
            value={`${formData().commercialRevShare}%`}
          />
          <InfoCardRow
            label="Minting Fee"
            value={formData().defaultMintingFee === '0' ? 'Free' : `${formData().defaultMintingFee} WIP`}
          />
          <p class="text-xs text-[var(--text-muted)] mt-2">
            <a
              href="https://docs.story.foundation/docs/pil-flavors#commercial-remix"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)]"
            >
              Learn more about PIL Commercial Remix
            </a>
          </p>
        </InfoCardSection>
      </InfoCard>

      {/* Advanced Settings (collapsed by default) */}
      <div class="flex flex-col gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowAdvanced(!showAdvanced())}
          class="justify-between"
          disabled={props.loading}
        >
          <span>Advanced Settings</span>
          <ChevronDownIcon />
        </Button>

        <Show when={showAdvanced()}>
          <div class="flex flex-col gap-4 p-4 bg-[var(--bg-page)] rounded-lg">
            <TextField
              label="Commercial Revenue Share (%)"
              value={String(formData().commercialRevShare)}
              onChange={(val) => updateField('commercialRevShare', Number(val))}
              disabled={props.loading}
              inputClass="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <TextField
              label="Default Minting Fee (WIP)"
              value={formData().defaultMintingFee}
              onChange={(val) => updateField('defaultMintingFee', val)}
              disabled={props.loading}
            />
          </div>
        </Show>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        disabled={!isValid()}
        loading={props.loading}
        class="w-full"
      >
        Publish Song
      </Button>
    </form>
  )
}
