import { For, type Component, type JSX } from 'solid-js'
import { cn } from '../lib/utils'

export interface TabItem {
  id: string
  label: string
  icon?: JSX.Element
  disabled?: boolean
}

export interface TabsProps {
  class?: string
  tabs: TabItem[]
  activeTab: string
  onTabChange?: (tabId: string) => void
  /** Add horizontal padding to align with page content */
  padded?: boolean
}

/**
 * Tabs - General tab navigation component
 *
 * Features:
 * - Flexible tab items with optional icons
 * - Active state with bottom border highlight
 * - Hover states
 * - Click handler for tab switching
 * - Disabled state support
 */
export const Tabs: Component<TabsProps> = (props) => {
  return (
    <div
      class={cn(
        'flex items-center border-b border-[var(--bg-highlight)] overflow-x-auto scrollbar-hide',
        props.padded && 'md:px-8',
        props.class
      )}
    >
      <For each={props.tabs}>
        {(tab) => {
          const isActive = () => props.activeTab === tab.id

          return (
            <button
              onClick={() => !tab.disabled && props.onTabChange?.(tab.id)}
              disabled={tab.disabled}
              class={cn(
                'flex items-center gap-2 py-3 md:py-4 text-base font-medium transition-colors relative cursor-pointer whitespace-nowrap',
                'flex-1 justify-center px-2 md:px-6', // Spread evenly & center on all screen sizes
                'hover:text-[var(--text-primary)]',
                isActive()
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)]',
                tab.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Icon */}
              {tab.icon && (
                <span class="w-5 h-5 flex items-center justify-center">
                  {tab.icon}
                </span>
              )}

              {/* Label - hide on mobile, show on md+ */}
              <span class="hidden md:inline">{tab.label}</span>

              {/* Active indicator - bottom border */}
              {isActive() && (
                <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-blue)]" />
              )}
            </button>
          )
        }}
      </For>
    </div>
  )
}
