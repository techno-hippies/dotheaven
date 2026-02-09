import type { Component, JSX } from 'solid-js'
import { Show, For } from 'solid-js'
import { cn } from '../../lib/classnames'
import { CommunityCard, type CommunityCardProps } from './community-card'

export interface CommunityFeedProps {
  class?: string
  /** Members to display */
  members: CommunityCardProps[]
  /** Empty state content */
  emptySlot?: JSX.Element
  /** Loading state - shows spinner instead of empty state */
  isLoading?: boolean
}

/**
 * CommunityFeed - A feed of community member cards.
 *
 * Features:
 * - Responsive: single column on mobile, two columns on desktop
 * - Empty state support
 */
export const CommunityFeed: Component<CommunityFeedProps> = (props) => {
  return (
    <div class={cn('flex flex-col h-full', props.class)}>
      <div class="flex-1 overflow-y-auto">
        <Show
          when={props.members.length > 0}
          fallback={
            <Show
              when={props.isLoading}
              fallback={
                props.emptySlot ?? (
                  <div class="flex items-center justify-center py-16 text-[var(--text-muted)]">
                    No members found
                  </div>
                )
              }
            >
              <div class="flex items-center justify-center py-16 text-[var(--text-muted)]">
                <div class="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
              </div>
            </Show>
          }
        >
          <div class="flex flex-col gap-2 p-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-4">
            <For each={props.members}>
              {(member) => <CommunityCard {...member} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
