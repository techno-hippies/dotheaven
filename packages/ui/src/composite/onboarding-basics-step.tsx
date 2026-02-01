import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Button, PillGroup, LocationInput, Select, type LocationResult, type SelectOption } from '../primitives'

export interface OnboardingBasicsData {
  age: number | null
  gender: string
  location: LocationResult | null
  nativeLanguage: string
  targetLanguage: string
}

export interface OnboardingBasicsStepProps {
  class?: string
  /** Called when user continues. Return false to prevent advancing. */
  onContinue?: (data: OnboardingBasicsData) => Promise<boolean | void> | boolean | void
  /** Called when user skips */
  onSkip?: () => void
  /** Whether submission is in progress */
  submitting?: boolean
  /** Error message */
  error?: string | null
  /** Pre-filled claimed name for context */
  claimedName?: string
}

const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
] as const

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ru', label: 'Russian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'id', label: 'Indonesian' },
]

/**
 * OnboardingBasicsStep - Collect age, gender, location, native + target language.
 * All fields optional. Designed to sit between name claim and avatar in the onboarding flow.
 */
export const OnboardingBasicsStep: Component<OnboardingBasicsStepProps> = (props) => {
  const [age, setAge] = createSignal('')
  const [gender, setGender] = createSignal('')
  const [location, setLocation] = createSignal<LocationResult | null>(null)
  const [nativeLang, setNativeLang] = createSignal<SelectOption>()
  const [targetLang, setTargetLang] = createSignal<SelectOption>()

  const parsedAge = () => {
    const n = parseInt(age(), 10)
    return !isNaN(n) && n >= 13 && n <= 120 ? n : null
  }

  const ageError = () => {
    const raw = age().trim()
    if (raw === '') return null
    const n = parseInt(raw, 10)
    if (isNaN(n) || n < 13 || n > 120) return 'Enter age 13–120'
    return null
  }

  const handleContinue = () => {
    props.onContinue?.({
      age: parsedAge(),
      gender: gender(),
      location: location(),
      nativeLanguage: nativeLang()?.value || '',
      targetLanguage: targetLang()?.value || '',
    })
  }

  return (
    <div class={cn('flex flex-col gap-5 w-full', props.class)}>
      {/* Row: Age + Gender */}
      <div class="flex gap-3">
        {/* Age */}
        <div class="flex flex-col gap-1.5 w-24 shrink-0">
          <label class="text-sm font-medium text-[var(--text-secondary)]">Age</label>
          <input
            type="number"
            inputMode="numeric"
            min={13}
            max={120}
            placeholder="25"
            value={age()}
            onInput={(e) => setAge(e.currentTarget.value)}
            class={cn(
              'h-11 rounded-md bg-[var(--bg-highlight)] px-3 text-base text-[var(--text-primary)]',
              'placeholder:text-[var(--text-muted)] focus:outline-none',
              'border-2 transition-colors',
              ageError()
                ? 'border-[var(--accent-coral)]'
                : 'border-transparent focus:border-[var(--accent-blue)]/50',
            )}
          />
          <Show when={ageError()}>
            <span class="text-xs text-[var(--accent-coral)]">{ageError()}</span>
          </Show>
        </div>

        {/* Gender */}
        <div class="flex flex-col gap-1.5 flex-1">
          <label class="text-sm font-medium text-[var(--text-secondary)]">Gender</label>
          <PillGroup
            options={GENDER_OPTIONS}
            value={gender()}
            onChange={(val) => setGender(gender() === val ? '' : val)}
          />
        </div>
      </div>

      {/* Location */}
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-[var(--text-secondary)]">City / Timezone</label>
        <LocationInput
          value={location()}
          onChange={setLocation}
          placeholder="e.g. Tokyo, New York, London"
        />
      </div>

      {/* Languages row */}
      <div class="flex gap-3">
        <div class="flex flex-col gap-1.5 flex-1">
          <label class="text-sm font-medium text-[var(--text-secondary)]">Native language</label>
          <Select
            options={LANGUAGE_OPTIONS}
            value={nativeLang()}
            onChange={setNativeLang}
            placeholder="Select..."
          />
        </div>

        <div class="flex flex-col gap-1.5 flex-1">
          <label class="text-sm font-medium text-[var(--text-secondary)]">Learning</label>
          <Select
            options={LANGUAGE_OPTIONS}
            value={targetLang()}
            onChange={setTargetLang}
            placeholder="Select..."
          />
        </div>
      </div>

      {/* Error */}
      <Show when={props.error}>
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--accent-coral)]/10 text-[var(--accent-coral)] text-sm">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
          </svg>
          <span>{props.error}</span>
        </div>
      </Show>

      {/* Actions */}
      <div class="flex flex-col gap-3">
        <Button
          class="w-full h-12 text-lg"
          disabled={!!ageError() || props.submitting}
          loading={props.submitting}
          onClick={handleContinue}
        >
          {props.submitting ? 'Saving...' : 'Continue'}
        </Button>
        <button
          type="button"
          onClick={() => props.onSkip?.()}
          class="text-base text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors py-2"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
