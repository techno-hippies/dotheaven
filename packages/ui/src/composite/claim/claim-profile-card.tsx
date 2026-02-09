import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'

export interface ClaimProfileData {
  displayName: string
  avatarUrl?: string
  source: string
  sourceUrl?: string
  age?: string
  gender?: string
  location?: string
  bio?: string
  likesReceived: number
}

export interface ClaimProfileCardProps {
  profile: ClaimProfileData
  class?: string
}

/** Map source codes to display names */
const SOURCE_NAMES: Record<string, string> = {
  dateme: 'DateMe Directory',
  'dateme.directory': 'DateMe Directory',
  cuties: 'Cuties',
  'cuties.app': 'Cuties',
  acx: 'ACX Dating Post',
}

export function getSourceName(source: string): string {
  return SOURCE_NAMES[source] || source
}

/**
 * ClaimProfileCard - Shows a shadow profile preview on the claim page.
 * Displays avatar, name, basic info, bio snippet, and source.
 */
export const ClaimProfileCard: Component<ClaimProfileCardProps> = (props) => {
  const p = () => props.profile

  return (
    <div class={cn(
      'bg-[var(--bg-surface)] rounded-md p-5',
      'border border-[var(--border-subtle)]',
      props.class,
    )}>
      <div class="flex gap-4 items-start">
        <Avatar
          src={p().avatarUrl}
          size="2xl"
        />
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold text-[var(--text-primary)] truncate">
            {p().displayName}
          </h3>
          <Show when={p().age || p().gender || p().location}>
            <p class="text-base text-[var(--text-secondary)] mt-0.5">
              {[p().age && `${p().age}`, p().gender, p().location]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Show>
        </div>
      </div>

      <Show when={p().bio}>
        <p class="text-base text-[var(--text-secondary)] mt-4 line-clamp-3">
          {p().bio}
        </p>
      </Show>
    </div>
  )
}
