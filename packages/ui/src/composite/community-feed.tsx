import type { Component, JSX } from 'solid-js'
import { Show, For, createSignal } from 'solid-js'
import { cn } from '../lib/utils'
import { CommunityCard, type CommunityCardProps } from './community-card'

export interface CommunityTab {
  id: string
  label: string
  /** Badge count (e.g. "99+" for Nearby) */
  badge?: string
}

export interface CommunityFeedProps {
  class?: string
  /** Tab definitions. Defaults to All / Nearby / Travel if not provided. */
  tabs?: CommunityTab[]
  /** Currently active tab id */
  activeTab?: string
  /** Called when tab changes */
  onTabChange?: (tabId: string) => void
  /** Members to display */
  members: CommunityCardProps[]
  /** Featured member (shown enlarged at top on mobile, or first in list on desktop) */
  featuredMember?: CommunityCardProps
  /** Header left slot (e.g. user avatar) */
  headerLeftSlot?: JSX.Element
  /** Header right slot (e.g. add friend, filter icons) */
  headerRightSlot?: JSX.Element
  /** Empty state content */
  emptySlot?: JSX.Element
}

const defaultTabs: CommunityTab[] = [
  { id: 'all', label: 'All' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'travel', label: 'Travel' },
]

/**
 * CommunityFeed - A feed of community member cards with tab navigation.
 *
 * Features:
 * - Tab bar (All, Nearby, Travel) with optional badges
 * - Optional featured member card
 * - Responsive: single column on mobile, two columns on desktop
 * - Header with optional left/right slots
 * - Empty state support
 */
export const CommunityFeed: Component<CommunityFeedProps> = (props) => {
  const tabs = () => props.tabs ?? defaultTabs
  const [localTab, setLocalTab] = createSignal(props.activeTab ?? tabs()[0]?.id ?? 'all')
  const activeTab = () => props.activeTab ?? localTab()

  const handleTabChange = (tabId: string) => {
    setLocalTab(tabId)
    props.onTabChange?.(tabId)
  }

  return (
    <div class={cn('flex flex-col', props.class)}>
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          {props.headerLeftSlot}
          <h1 class="text-xl font-bold text-[var(--text-primary)]">Community</h1>
        </div>
        <Show when={props.headerRightSlot}>
          <div class="flex items-center gap-2">
            {props.headerRightSlot}
          </div>
        </Show>
      </div>

      {/* Tab bar */}
      <div class="flex items-center border-b border-[var(--bg-highlight)] overflow-x-auto scrollbar-hide">
        <For each={tabs()}>
          {(tab) => {
            const isActive = () => activeTab() === tab.id

            return (
              <button
                onClick={() => handleTabChange(tab.id)}
                class={cn(
                  'flex items-center gap-1.5 py-3 text-base font-medium transition-colors relative cursor-pointer whitespace-nowrap',
                  'flex-1 justify-center px-4',
                  'hover:text-[var(--text-primary)]',
                  isActive()
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                <span>{tab.label}</span>
                <Show when={tab.badge}>
                  <span class={cn(
                    'px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center',
                    isActive()
                      ? 'bg-[var(--accent-coral)] text-white'
                      : 'bg-[var(--bg-highlight)] text-[var(--text-muted)]',
                  )}>
                    {tab.badge}
                  </span>
                </Show>

                {/* Active indicator */}
                {isActive() && (
                  <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-blue)]" />
                )}
              </button>
            )
          }}
        </For>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={props.members.length > 0 || props.featuredMember}
          fallback={
            props.emptySlot ?? (
              <div class="flex items-center justify-center py-16 text-[var(--text-muted)]">
                No members found
              </div>
            )
          }
        >
          <div class="flex flex-col gap-2 p-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-4">
            {/* Featured card */}
            <Show when={props.featuredMember}>
              {(member) => (
                <div class="lg:col-span-2">
                  <CommunityCard {...member()} featured />
                </div>
              )}
            </Show>

            {/* Regular cards */}
            <For each={props.members}>
              {(member) => <CommunityCard {...member} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
