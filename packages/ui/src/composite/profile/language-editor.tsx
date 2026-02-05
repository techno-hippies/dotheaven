import { Show, For, type Component, createSignal } from 'solid-js'
import { cn } from '../../lib/utils'
import { FlagIcon } from '../../primitives/flag-icon'
import { Select, type SelectOption } from '../../primitives/select'
import { IconButton } from '../../primitives/icon-button'
import { X, Plus } from '../../icons'
import { LEARNING_LANGUAGE_OPTIONS } from '../../constants/profile-options'
import {
  type LanguageEntry,
  PROFICIENCY_OPTIONS,
  LANG_TO_FLAG,
  proficiencyLabel,
  PROFICIENCY,
} from '../../data/languages'

export interface LanguageEditorProps {
  /** Current list of language entries */
  languages: LanguageEntry[]
  /** Called when the list changes */
  onChange: (languages: LanguageEntry[]) => void
  /** Whether in editing mode */
  isEditing: boolean
  /** Whether this is the owner's profile */
  isOwnProfile?: boolean
  /** Max entries allowed */
  max?: number
}

const MAX_DEFAULT = 8

/** Map language code to its display label */
function langLabel(code: string): string {
  const opt = LEARNING_LANGUAGE_OPTIONS.find((o) => o.value === code)
  return opt?.label ?? code.toUpperCase()
}

/** Proficiency pill color class based on level */
function profColorClass(prof: number): string {
  if (prof === PROFICIENCY.NATIVE) return 'bg-[var(--accent-coral)]/15 text-[var(--accent-coral)]'
  if (prof >= 5) return 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
  if (prof >= 3) return 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]'
  return 'bg-[var(--bg-highlight)] text-[var(--text-muted)]'
}

/**
 * LanguageEditor — Unified language + proficiency editor for profile.
 *
 * Edit mode: list of language rows with proficiency dropdowns, add/remove.
 * View mode: read-only list with proficiency badges.
 */
export const LanguageEditor: Component<LanguageEditorProps> = (props) => {
  const max = () => props.max ?? MAX_DEFAULT
  const [addingLang, setAddingLang] = createSignal(false)

  const usedCodes = () => new Set(props.languages.map((l) => l.code))

  const availableLanguages = (): SelectOption[] =>
    LEARNING_LANGUAGE_OPTIONS.filter((o) => !usedCodes().has(o.value))

  const handleAddLanguage = (opt: SelectOption | null) => {
    if (!opt) return
    props.onChange([...props.languages, { code: opt.value, proficiency: PROFICIENCY.A1 }])
    setAddingLang(false)
  }

  const handleRemove = (index: number) => {
    const next = props.languages.filter((_, i) => i !== index)
    props.onChange(next)
  }

  const handleProficiencyChange = (index: number, opt: SelectOption | null) => {
    if (!opt) return
    const next = [...props.languages]
    next[index] = { ...next[index], proficiency: Number(opt.value) }
    props.onChange(next)
  }

  // View mode
  if (!props.isEditing) {
    if (!props.languages.length) {
      return (
        <Show when={props.isOwnProfile}>
          <div class="flex gap-3 py-2.5">
            <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0">
              Languages
            </span>
            <span class="text-base text-[var(--text-muted)] italic">+ Add languages</span>
          </div>
        </Show>
      )
    }

    return (
      <div class="flex flex-col gap-1">
        <span class="text-base text-[var(--text-secondary)] mb-1">Languages</span>
        <For each={props.languages}>
          {(entry) => (
            <div class="flex items-center gap-2.5 py-1.5">
              <FlagIcon code={LANG_TO_FLAG[entry.code] ?? entry.code.toUpperCase()} class="w-5 h-5 flex-shrink-0" />
              <span class="text-base text-[var(--text-primary)]">{langLabel(entry.code)}</span>
              <span
                class={cn(
                  'px-2 py-0.5 rounded-md text-xs font-semibold',
                  profColorClass(entry.proficiency),
                )}
              >
                {proficiencyLabel(entry.proficiency)}
              </span>
            </div>
          )}
        </For>
      </div>
    )
  }

  // Edit mode
  return (
    <div class="flex flex-col gap-2">
      <span class="text-base text-[var(--text-secondary)]">Languages</span>

      <For each={props.languages}>
        {(entry, index) => (
          <div class="flex items-center gap-2">
            <FlagIcon code={LANG_TO_FLAG[entry.code] ?? entry.code.toUpperCase()} class="w-5 h-5 flex-shrink-0" />
            <span class="text-sm text-[var(--text-primary)] min-w-[100px]">
              {langLabel(entry.code)}
            </span>
            <div class="w-[200px]">
              <Select
                options={PROFICIENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={{ value: String(entry.proficiency), label: proficiencyLabel(entry.proficiency) }}
                onChange={(opt) => handleProficiencyChange(index(), opt)}
                placeholder="Level"
              />
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Remove language"
              onClick={() => handleRemove(index())}
            >
              <X class="w-4 h-4" />
            </IconButton>
          </div>
        )}
      </For>

      <Show when={props.languages.length < max()}>
        <Show
          when={addingLang()}
          fallback={
            <button
              type="button"
              class={cn(
                'flex items-center gap-2 py-2 px-3 rounded-md transition-colors',
                'text-sm font-medium text-[var(--accent-blue)]',
                'hover:bg-[var(--bg-highlight)]',
              )}
              onClick={() => setAddingLang(true)}
            >
              <Plus class="w-4 h-4" />
              Add language
            </button>
          }
        >
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <Select
                options={availableLanguages()}
                onChange={handleAddLanguage}
                placeholder="Select a language..."
              />
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => setAddingLang(false)}
            >
              <X class="w-4 h-4" />
            </IconButton>
          </div>
        </Show>
      </Show>
    </div>
  )
}
