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
        {props.logo || <AppLogo size={36} />}
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

export interface AppLogoProps {
  /** Path to logo image (defaults to /images/heaven.png) */
  logoSrc?: string
  /** Logo size in pixels (defaults to 32) */
  size?: number
}

export const AppLogo: Component<AppLogoProps> = (props) => (
  <a href="/" class="flex items-center gap-2 cursor-pointer group">
    <img
      src={props.logoSrc || "/images/heaven.png"}
      alt="Heaven logo"
      class="object-contain hover:opacity-90 transition-opacity"
      style={{ width: `${props.size || 32}px`, height: `${props.size || 32}px` }}
    />
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
      'flex items-center gap-3 bg-[var(--bg-highlight)] rounded-lg px-4 py-2.5 w-full',
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
