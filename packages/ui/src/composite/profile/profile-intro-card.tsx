import { Show, type Component } from 'solid-js'
import { MapPin, Briefcase, Translate, Tag, Heart } from '../../icons'
import { getLanguageName, proficiencyLabel, type LanguageEntry } from '../../data/languages'
import { getTagLabel, stringToTagIds } from '../../data/tags'
import { abbreviateLocation } from '../../primitives'
import type { ProfileInput } from './profile-info-section'
import {
  PROFESSION_OPTIONS,
  LOOKING_FOR_OPTIONS,
} from '../../constants/profile-options'

interface ProfileIntroCardProps {
  profile: ProfileInput
  location?: string
}

/** Look up the display label for an enum value in an option array */
function optionLabel(options: { value: string; label: string }[], value: string | undefined): string | undefined {
  if (!value) return undefined
  return options.find(o => o.value === value)?.label
}

/**
 * ProfileIntroCard - Condensed intro panel for Timeline tab
 *
 * Shows 4-6 high-signal rows with icons (no labels), ending with "See full about →"
 * Replaces the form-like ProfileAboutSidebar for a more casual, icon-driven layout.
 */
export const ProfileIntroCard: Component<ProfileIntroCardProps> = (props) => {
  const languages = () => props.profile.languages ?? []
  const languageDisplay = () => {
    return languages().map((lang: LanguageEntry) => {
      const name = getLanguageName(lang.code)
      const prof = proficiencyLabel(lang.proficiency)
      // Native (proficiency 7) vs Learning (proficiency 1-6)
      if (lang.proficiency === 7) {
        return `${name} (Native)`
      } else {
        return `${name} (${prof})`
      }
    }).join(' • ')
  }

  const profession = () => optionLabel(PROFESSION_OPTIONS, props.profile.profession)
  const lookingFor = () => optionLabel(LOOKING_FOR_OPTIONS, props.profile.lookingFor)
  const hobbyIds = () => stringToTagIds(props.profile.hobbiesCommit)
  const hobbyLabels = () => hobbyIds().slice(0, 3).map(id => getTagLabel(id)) // Only show first 3

  return (
    <div class="bg-[var(--bg-surface)] rounded-md p-4 flex flex-col gap-3">
      <h3 class="text-base font-semibold text-[var(--text-primary)] mb-1">Intro</h3>

      {/* Location */}
      <Show when={props.location}>
        <div class="flex items-center gap-2.5 text-base text-[var(--text-secondary)]">
          <MapPin class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
          <span>{abbreviateLocation(props.location!)}</span>
        </div>
      </Show>

      {/* Profession */}
      <Show when={profession()}>
        <div class="flex items-center gap-2.5 text-base text-[var(--text-secondary)]">
          <Briefcase class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
          <span>{profession()}</span>
        </div>
      </Show>

      {/* Languages */}
      <Show when={languages().length > 0}>
        <div class="flex items-center gap-2.5 text-base text-[var(--text-secondary)]">
          <Translate class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
          <span>{languageDisplay()}</span>
        </div>
      </Show>

      {/* Looking for (dating intent) */}
      <Show when={lookingFor()}>
        <div class="flex items-center gap-2.5 text-base text-[var(--text-secondary)]">
          <Heart class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
          <span>Looking for: {lookingFor()}</span>
        </div>
      </Show>

      {/* Hobbies (first 3 as chips) */}
      <Show when={hobbyLabels().length > 0}>
        <div class="flex items-center gap-2.5 text-base text-[var(--text-secondary)]">
          <Tag class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
          <span>{hobbyLabels().join(' • ')}</span>
        </div>
      </Show>

    </div>
  )
}
