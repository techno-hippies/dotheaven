import { type Component, type JSX, Show, For } from 'solid-js'
import { cn } from '../lib/utils'

export interface MobileFooterTab {
  /** Unique identifier for the tab */
  id: string
  /** Icon element to display (regular weight) */
  icon: JSX.Element
  /** Icon element for active state (fill weight) */
  activeIcon?: JSX.Element
  /** Label text (for accessibility, not displayed) */
  label: string
  /** Optional badge count (e.g., unread messages) */
  badge?: number
}

export interface MobileFooterProps {
  /** Array of tabs to display (max 5 recommended) */
  tabs: MobileFooterTab[]
  /** Currently active tab id */
  activeTab: string
  /** Callback when a tab is pressed */
  onTabPress: (tabId: string) => void
  /** Additional class names */
  class?: string
}

/**
 * Mobile bottom navigation bar with 5 tabs.
 * Shows icon + label for each tab, with optional badge.
 * Fixed to bottom of screen, 64px height.
 */
export const MobileFooter: Component<MobileFooterProps> = (props) => {
  return (
    <nav
      class={cn(
        'h-16 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] flex items-center justify-around px-2',
        props.class
      )}
    >
      <For each={props.tabs}>
        {(tab) => (
          <MobileFooterItem
            icon={tab.icon}
            activeIcon={tab.activeIcon}
            label={tab.label}
            badge={tab.badge}
            active={props.activeTab === tab.id}
            onClick={() => props.onTabPress(tab.id)}
          />
        )}
      </For>
    </nav>
  )
}

export interface MobileFooterItemProps {
  /** Icon element (regular weight) */
  icon: JSX.Element
  /** Icon element for active state (fill weight) */
  activeIcon?: JSX.Element
  /** Label text (for accessibility) */
  label: string
  /** Whether this tab is active */
  active?: boolean
  /** Optional badge count */
  badge?: number
  /** Click handler */
  onClick?: () => void
}

/**
 * Individual tab item in the mobile footer.
 * Shows icon with optional badge. No label - icons only.
 * Active state uses filled icon (passed via activeIcon prop) and primary text color.
 */
export const MobileFooterItem: Component<MobileFooterItemProps> = (props) => {
  return (
    <button
      type="button"
      class={cn(
        'flex items-center justify-center min-w-[48px] h-12 px-4 rounded-md transition-colors cursor-pointer',
        props.active
          ? 'text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
      )}
      onClick={props.onClick}
    >
      <span class="relative w-6 h-6 flex items-center justify-center">
        {props.active && props.activeIcon ? props.activeIcon : props.icon}
        <Show when={props.badge && props.badge > 0}>
          <span class="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {props.badge! > 99 ? '99+' : props.badge}
          </span>
        </Show>
      </span>
    </button>
  )
}
