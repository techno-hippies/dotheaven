import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'
import { abbreviateLocation } from '../../primitives/location-input'
import { VerificationBadge, type VerificationState } from '../profile/verification-badge'
import { MapPin } from '../../icons'

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
  /** Age (0 = unset) */
  age?: number
  /** Gender label (e.g. "F", "M", "NB") */
  gender?: string
  /** Location label (e.g. "Paris, France") */
  location?: string
  /** Verification state */
  verified?: VerificationState
  /** Click handler for the entire card */
  onClick?: () => void
  /** Right-aligned slot (e.g. badge, menu) */
  rightSlot?: JSX.Element
}

/**
 * CommunityCard - A card showing a community member with their photo and location.
 *
 * Design:
 * - Nationality flag on avatar
 * - Name + age/gender + verification inline
 * - Location with map pin icon
 */
export const CommunityCard: Component<CommunityCardProps> = (props) => {
  return (
    <div
      class={cn(
        'relative bg-[var(--bg-surface)] rounded-md overflow-hidden cursor-pointer',
        'transition-all duration-150',
        'hover:bg-[var(--bg-highlight)] hover:ring-1 hover:ring-[var(--bg-highlight-hover)]',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      <div class="flex gap-3 p-3">
        {/* Avatar with nationality flag */}
        <div class="relative flex-shrink-0">
          <Avatar
            src={props.avatarUrl}
            size="xl"
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
            <span class="font-semibold text-base text-[var(--text-primary)] truncate">
              {props.name}
            </span>
            <Show when={props.age || props.gender}>
              <span class="font-semibold text-base text-[var(--text-muted)]">
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

          {/* Location */}
          <Show when={props.location}>
            <div class="flex items-center gap-1 text-[var(--text-muted)]">
              <MapPin class="w-3.5 h-3.5 flex-shrink-0" />
              <span class="text-base truncate">{abbreviateLocation(props.location!)}</span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
