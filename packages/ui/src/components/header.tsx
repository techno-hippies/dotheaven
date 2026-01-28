import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/utils'

export interface HeaderProps {
  class?: string
  logo?: JSX.Element
  searchSlot?: JSX.Element
  rightSlot?: JSX.Element
}

/**
 * Global header bar with logo, search, and user actions.
 */
export const Header: Component<HeaderProps> = (props) => {
  return (
    <header
      class={cn(
        'h-16 bg-[var(--bg-page)] flex items-center justify-between px-6 gap-4',
        props.class
      )}
    >
      {/* Left: Logo */}
      <div class="flex items-center gap-4">
        {props.logo || <AppLogo />}
      </div>

      {/* Center: Search */}
      <div class="flex-1 max-w-lg">
        {props.searchSlot || <SearchInput />}
      </div>

      {/* Right: Actions */}
      <div class="flex items-center gap-2">
        {props.rightSlot}
      </div>
    </header>
  )
}

const AppLogo: Component = () => (
  <a href="/" class="flex items-center gap-2 cursor-pointer">
    <div class="w-8 h-8 bg-[var(--bg-highlight)] rounded-lg flex items-center justify-center hover:bg-[var(--bg-highlight-hover)] transition-colors">
      <span class="text-lg font-bold text-[var(--text-primary)]">H</span>
    </div>
  </a>
)

export interface SearchInputProps {
  class?: string
  placeholder?: string
  value?: string
  onInput?: (value: string) => void
}

export const SearchInput: Component<SearchInputProps> = (props) => (
  <div
    class={cn(
      'flex items-center gap-3 bg-[var(--bg-highlight)] rounded-full px-4 py-2.5 w-full',
      props.class
    )}
  >
    <svg class="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
    <input
      type="text"
      placeholder={props.placeholder || 'Search or type a URL'}
      value={props.value || ''}
      onInput={(e) => props.onInput?.(e.currentTarget.value)}
      class="flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
    />
  </div>
)
