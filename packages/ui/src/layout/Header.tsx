import { type Component, type JSX, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { useIsMobile } from '../lib/use-media-query'

export interface HeaderProps {
  class?: string
  logo?: JSX.Element
  /** Right slot content for desktop */
  rightSlot?: JSX.Element
  /** Right slot content for mobile (if different from desktop). If not provided, rightSlot is hidden on mobile. */
  mobileRightSlot?: JSX.Element
  /** Left slot content for mobile (e.g., wallet icon on Profile). Replaces logo on mobile. */
  mobileLeftSlot?: JSX.Element
  /** Hide logo on mobile (default: true) */
  hideLogoOnMobile?: boolean
}

/**
 * Global header bar with logo and user actions.
 * On mobile: logo hidden by default, only mobileRightSlot shown.
 */
export const Header: Component<HeaderProps> = (props) => {
  const isMobile = useIsMobile()
  const hideLogoOnMobile = () => props.hideLogoOnMobile !== false

  const showLogo = () => !(isMobile() && hideLogoOnMobile())

  return (
    <header
      class={cn(
        'h-16 bg-[var(--bg-page)] flex items-center justify-between px-4 md:px-6 gap-4',
        props.class
      )}
    >
      {/* Left: Logo on desktop, mobileLeftSlot on mobile */}
      <Show when={showLogo()}>
        <div class="flex items-center gap-4 flex-shrink-0">
          {props.logo || <AppLogo size={36} />}
        </div>
      </Show>
      <Show when={isMobile() && !showLogo() && props.mobileLeftSlot}>
        <div class="flex items-center gap-2 flex-shrink-0">
          {props.mobileLeftSlot}
        </div>
      </Show>

      {/* Spacer to push right slot to the right */}
      <div class="flex-1" />

      {/* Right: Actions - different content for mobile vs desktop */}
      <div class="flex items-center gap-2 flex-shrink-0">
        <Show when={isMobile()} fallback={props.rightSlot}>
          {props.mobileRightSlot}
        </Show>
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
      src={props.logoSrc || `${import.meta.env.BASE_URL}images/heaven.png`}
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
      'flex items-center gap-3 bg-[var(--bg-highlight)] rounded-md px-4 py-2.5 w-full',
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
