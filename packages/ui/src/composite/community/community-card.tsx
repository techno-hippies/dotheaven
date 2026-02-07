import type { Component, JSX } from 'solid-js'
import { Show, For } from 'solid-js'
import { cn } from '../../lib/utils'
import { Avatar } from '../../primitives/avatar'
import { type LanguageEntry, getLanguageName } from '../../data/languages'
import { VerificationBadge, type VerificationState } from '../profile/verification-badge'
import { LanguageChip } from '../../primitives/language-chip'

export interface CommunityCardProps {
  class?: string
  /** Display name */
  name: string
  /** Avatar image URL */
  avatarUrl?: string
  /** ISO 3166-1 alpha-2 nationality code (e.g. "US"). Shows a flag badge on the avatar. */
  nationalityCode?: string
  /** Whether user is online */
  online?: boolean
  /** Whether this is a featured/highlighted card */
  featured?: boolean
  /** Language entries with proficiency (7 = native, 1-6 = learning) */
  languages?: LanguageEntry[]
  /** Age (0 = unset) */
  age?: number
  /** Gender label (e.g. "F", "M", "NB") */
  gender?: string
  /** Verification state */
  verified?: VerificationState
  /** Click handler for the entire card */
  onClick?: () => void
  /** Right-aligned slot (e.g. badge, menu) */
  rightSlot?: JSX.Element
}

/**
 * CommunityCard - A card showing a community member with their photo and languages.
 *
 * Design:
 * - Nationality flag on avatar (decoupled from language)
 * - Chip-based language display with CEFR levels
 * - All languages shown together (native + learning)
 */
export const CommunityCard: Component<CommunityCardProps> = (props) => {
  const MAX_CHIPS = 5 // Show max 5 languages total

  // All languages sorted by proficiency (native first, then by level)
  const allLanguages = () => {
    if (!props.languages) return []
    return [...props.languages].sort((a, b) => b.proficiency - a.proficiency)
  }

  // Visible languages (first MAX_CHIPS)
  const visibleLanguages = () => allLanguages().slice(0, MAX_CHIPS)
  const overflowCount = () => Math.max(0, allLanguages().length - MAX_CHIPS)

  return (
    <div
      class={cn(
        'relative bg-[var(--bg-surface)] rounded-md overflow-hidden cursor-pointer',
        'transition-all duration-150',
        'hover:bg-[var(--bg-highlight)] hover:ring-1 hover:ring-[var(--bg-highlight-hover)]',
        props.featured && 'ring-1 ring-[var(--accent-coral)]/30 hover:ring-[var(--accent-coral)]/50',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      {/* Featured star badge */}
      <Show when={props.featured}>
        <div class="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-[var(--accent-coral)] flex items-center justify-center shadow-lg">
          <svg class="w-4 h-4 text-white" viewBox="0 0 256 256" fill="currentColor">
            <path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,91l59.46-5.15,23.21-55.36a16.4,16.4,0,0,1,30.5,0l23.21,55.36L226.92,91A16.46,16.46,0,0,1,234.29,114.85Z" />
          </svg>
        </div>
      </Show>

      <div class={cn(
        'flex gap-3',
        props.featured ? 'p-4' : 'p-3',
      )}>
        {/* Avatar with nationality flag */}
        <div class="relative flex-shrink-0">
          <Avatar
            src={props.avatarUrl}
            size={props.featured ? '2xl' : 'xl'}
            nationalityCode={props.nationalityCode}
          />
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          {/* Name row with age/gender inline */}
          <div class="flex items-center gap-2">
            <Show when={props.online}>
              <div class="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            </Show>
            <span class={cn(
              'font-semibold text-[var(--text-primary)] truncate',
              props.featured ? 'text-lg' : 'text-base',
            )}>
              {props.name}
            </span>
            <Show when={props.age || props.gender}>
              <span class={cn(
                'font-semibold text-[var(--text-muted)]',
                props.featured ? 'text-lg' : 'text-base',
              )}>
                {[props.age && props.age > 0 ? String(props.age) : null, props.gender]
                  .filter(Boolean)
                  .join('')}
              </span>
            </Show>
            <Show when={props.verified && props.verified !== 'none'}>
              <VerificationBadge state={props.verified!} size="sm" />
            </Show>

            {/* Right slot */}
            <Show when={props.rightSlot}>
              <div class="ml-auto flex-shrink-0">
                {props.rightSlot}
              </div>
            </Show>
          </div>

          {/* Languages - chip based with CEFR levels */}
          <Show when={visibleLanguages().length > 0}>
            <div class="flex items-center gap-1.5 flex-wrap">
              <For each={visibleLanguages()}>
                {(entry) => (
                  <LanguageChip
                    language={getLanguageName(entry.code)}
                    proficiency={entry.proficiency}
                    size="sm"
                  />
                )}
              </For>
              <Show when={overflowCount() > 0}>
                <span class="text-xs text-[var(--text-muted)] px-1">+{overflowCount()}</span>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
