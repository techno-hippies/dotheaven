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
  /** Loading state - shows skeletons instead of empty state */
  isLoading?: boolean
}

const SkeletonCard: Component = () => (
  <div class="bg-[var(--bg-surface)] rounded-md overflow-hidden">
    <div class="flex gap-3 p-3 animate-pulse">
      {/* Avatar skeleton */}
      <div class="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex-shrink-0" />
      {/* Content skeleton */}
      <div class="flex-1 flex flex-col gap-2 justify-center">
        <div class="h-4 w-32 bg-[var(--bg-elevated)] rounded" />
        <div class="h-3.5 w-24 bg-[var(--bg-elevated)] rounded" />
      </div>
    </div>
  </div>
)

const SKELETON_COUNT = 8

/**
 * CommunityFeed - A feed of community member cards.
 *
 * Features:
 * - Responsive: single column on mobile, two columns on desktop
 * - Skeleton loading state
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
              <div class="flex flex-col gap-2 p-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-4">
                <For each={Array.from({ length: SKELETON_COUNT })}>
                  {() => <SkeletonCard />}
                </For>
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
