import { type Component, type JSX, Show } from 'solid-js'
import { cn } from '../lib/classnames'
import { useIsMobile } from '../lib/use-media-query'

export interface AppShellProps {
  class?: string
  children: JSX.Element
  /** Left sidebar - hidden on mobile */
  sidebar?: JSX.Element
  /** Right panel - hidden on mobile and tablet */
  rightPanel?: JSX.Element
  /** Header - always visible */
  header?: JSX.Element
  /** Desktop footer (e.g., full MusicPlayer) - hidden on mobile */
  footer?: JSX.Element
  /** Mobile mini player - shown above mobile footer on mobile only */
  mobilePlayer?: JSX.Element
  /** Mobile footer navigation - shown on mobile only */
  mobileFooter?: JSX.Element
}

/**
 * Main application shell with responsive layout.
 *
 * Desktop (≥1024px): sidebar (with logo) + content + rightPanel + footer
 * Tablet (768-1023px): sidebar + content + footer
 * Mobile (<768px): header + content + mobilePlayer + mobileFooter
 */
export const AppShell: Component<AppShellProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <div
      class={cn(
        'flex flex-col h-[var(--vh-screen,100vh)] bg-[var(--bg-page)] text-white overflow-hidden',
        // On desktop, cap width and center
        'lg:max-w-[1440px] lg:mx-auto lg:w-full',
        props.class
      )}
    >
      {/* Header - mobile only */}
      <Show when={isMobile() && props.header}>
        {props.header}
      </Show>

      {/* Main content area */}
      <div class="flex flex-1 overflow-hidden">
        {/* Left Sidebar - hidden on mobile */}
        <Show when={!isMobile() && props.sidebar}>
          {props.sidebar}
        </Show>

        {/* Main Content */}
        <main class="flex-1 overflow-hidden">
          {props.children}
        </main>

        {/* Right Panel - hidden on mobile/tablet (only show on lg+) */}
        <Show when={!isMobile() && props.rightPanel}>
          <div class="hidden lg:block">
            {props.rightPanel}
          </div>
        </Show>
      </div>

      {/* Desktop Footer / Music Player - hidden on mobile */}
      <Show when={!isMobile() && props.footer}>
        <div class="border-t border-[var(--border-subtle)]">
          {props.footer}
        </div>
      </Show>

      {/* Mobile: Mini Player + Footer Nav */}
      <Show when={isMobile()}>
        {props.mobilePlayer}
        {props.mobileFooter}
      </Show>
    </div>
  )
}
