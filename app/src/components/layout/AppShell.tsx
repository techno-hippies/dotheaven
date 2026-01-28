import type { Component, JSX } from 'solid-js'
import { cn } from '@/lib/utils'

export interface AppShellProps {
  class?: string
  children: JSX.Element
  sidebar?: JSX.Element
  rightPanel?: JSX.Element
  header?: JSX.Element
  footer?: JSX.Element
}

/**
 * Main application shell with left sidebar, main content, right panel, header and footer.
 * Uses a Spotify-like layout structure.
 */
export const AppShell: Component<AppShellProps> = (props) => {
  return (
    <div class={cn('flex flex-col h-screen bg-[var(--bg-page)] text-white overflow-hidden', props.class)}>
      {/* Header */}
      {props.header}

      {/* Main content area */}
      <div class="flex flex-1 gap-2 overflow-hidden">
        {/* Left Sidebar */}
        {props.sidebar}

        {/* Main Content */}
        <main class="flex-1 overflow-hidden">
          {props.children}
        </main>

        {/* Right Panel */}
        {props.rightPanel}
      </div>

      {/* Footer / Music Player */}
      {props.footer}
    </div>
  )
}
