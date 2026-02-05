import type { Component, JSX } from 'solid-js'
import { Show, For } from 'solid-js'
import { cn } from '../../lib/utils'
import { Avatar } from '../../primitives/avatar'
import { FlagIcon } from '../../primitives/flag-icon'
import { ChatCircle } from '../../icons'
import { type LanguageEntry, LANG_TO_FLAG, PROFICIENCY } from '../../data/languages'
import { VerificationBadge, type VerificationState } from '../profile/verification-badge'

export interface LanguageInfo {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "JP") */
  code: string
  /** Optional label (e.g. "English") */
  label?: string
}

export interface CommunityCardProps {
  class?: string
  /** Display name */
  name: string
  /** Avatar image URL */
  avatarUrl?: string
  /** Bio / intro text */
  bio?: string
  /** Whether user is online */
  online?: boolean
  /** Whether this is a featured/highlighted card */
  featured?: boolean
  /**
   * Unified language entries with proficiency.
   * When provided, Native/Learns rows are derived automatically
   * (proficiency === 7 → Native, 1-6 → Learns).
   * Takes precedence over nativeLanguages/learningLanguages.
   */
  languages?: LanguageEntry[]
  /** Native languages (legacy — use `languages` instead) */
  nativeLanguages?: LanguageInfo[]
  /** Languages being learned (legacy — use `languages` instead) */
  learningLanguages?: LanguageInfo[]
  /** Number of comments/messages */
  commentCount?: number
  /** Age (0 = unset) */
  age?: number
  /** Gender label (e.g. "Woman", "Man") */
  gender?: string
  /** Top artists from scrobble history */
  topArtists?: string[]
  /** Verification state */
  verified?: VerificationState
  /** Click handler for the entire card */
  onClick?: () => void
  /** Right-aligned slot (e.g. badge, menu) */
  rightSlot?: JSX.Element
}

/** Render a row of flags with "+N" overflow */
const LanguageRow: Component<{ label: string; languages: LanguageInfo[] }> = (props) => {
  const visible = () => props.languages.slice(0, 3)
  const overflow = () => Math.max(0, props.languages.length - 3)

  return (
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-[var(--text-muted)]">
        {props.label}
      </span>
      <For each={visible()}>
        {(lang) => (
          <FlagIcon code={lang.code} class="w-5 h-5 flex-shrink-0" />
        )}
      </For>
      <Show when={overflow() > 0}>
        <span class="text-sm font-medium text-[var(--text-muted)]">
          +{overflow()}
        </span>
      </Show>
    </div>
  )
}

/**
 * CommunityCard - A card showing a community member with their photo, bio, and languages.
 *
 * Features:
 * - Large avatar with optional online indicator
 * - Age / gender subtitle
 * - Verification badge next to name
 * - Bio text preview
 * - Top artists from scrobble history
 * - Native and learning language flags
 * - Featured variant with larger layout and star badge
 */
export const CommunityCard: Component<CommunityCardProps> = (props) => {
  // Derive Native/Learns from unified languages prop, or fall back to legacy props
  const nativeLangs = (): LanguageInfo[] => {
    if (props.languages) {
      return props.languages
        .filter((e) => e.proficiency === PROFICIENCY.NATIVE)
        .map((e) => ({ code: LANG_TO_FLAG[e.code] ?? e.code.toUpperCase() }))
    }
    return props.nativeLanguages ?? []
  }
  const learningLangs = (): LanguageInfo[] => {
    if (props.languages) {
      return props.languages
        .filter((e) => e.proficiency > 0 && e.proficiency < PROFICIENCY.NATIVE)
        .map((e) => ({ code: LANG_TO_FLAG[e.code] ?? e.code.toUpperCase() }))
    }
    return props.learningLanguages ?? []
  }

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
        {/* Avatar */}
        <div class="relative flex-shrink-0">
          <Avatar
            src={props.avatarUrl}
            size={props.featured ? '4xl' : '2xl'}
          />
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0 flex flex-col">
          <div class="flex-1 flex flex-col gap-1.5">
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

              {/* Right side: comment count */}
              <div class="flex items-center gap-2 ml-auto flex-shrink-0">
                <Show when={props.commentCount != null && props.commentCount! > 0}>
                  <div class="flex items-center gap-1 text-[var(--accent-blue)]">
                    <span class="text-sm font-medium">{props.commentCount}</span>
                    <ChatCircle class="w-4 h-4" />
                  </div>
                </Show>
                {props.rightSlot}
              </div>
            </div>

            {/* Bio */}
            <Show when={props.bio}>
              <p class={cn(
                'text-[var(--text-secondary)] leading-snug',
                props.featured ? 'text-base line-clamp-3' : 'text-sm line-clamp-2',
              )}>
                {props.bio}
              </p>
            </Show>

            {/* Top artists */}
            <Show when={props.topArtists && props.topArtists.length > 0}>
              <p class="text-sm text-[var(--text-muted)] line-clamp-2">
                {props.topArtists!.slice(0, 3).join(', ')}
              </p>
            </Show>
          </div>

          {/* Language rows - always at bottom */}
          <div class="flex items-center gap-4 flex-wrap mt-2">
            <Show when={nativeLangs().length > 0}>
              <LanguageRow label="Native" languages={nativeLangs()} />
            </Show>
            <Show when={learningLangs().length > 0}>
              <LanguageRow label="Learns" languages={learningLangs()} />
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
