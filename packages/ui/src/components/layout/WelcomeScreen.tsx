import { type Component, type JSX } from 'solid-js'
import { cn } from '../../lib/utils'
import { Button } from '../button'

export interface WelcomeScreenProps {
  /** Callback when action button is clicked */
  onAction?: () => void
  /** Button label (defaults to "Add Folders") */
  actionLabel?: string
  /** Button icon (defaults to folder icon) */
  actionIcon?: JSX.Element
  /** Subtitle text (defaults to "Add your music folders to start listening") */
  subtitle?: string
  /** Optional CSS class */
  class?: string
  /** Path to logo image (defaults to /images/heaven.png) */
  logoSrc?: string
}

export const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  return (
    <div
      class={cn(
        "flex flex-col items-center justify-center min-h-screen w-full",
        "bg-gradient-to-b from-[oklch(0.25_0.04_280)] via-background to-[oklch(0.15_0.04_285)]",
        props.class
      )}
    >
      {/* App Icon */}
      <div class="mb-8 flex items-center justify-center">
        <img
          src={props.logoSrc || "/images/heaven.png"}
          alt="Heaven logo"
          class="w-24 h-24 object-contain"
        />
      </div>

      {/* Welcome Text */}
      <h1 class="text-4xl font-semibold text-foreground mb-3">
        Welcome to Heaven
      </h1>

      <p class="text-lg text-muted-foreground mb-10">
        {props.subtitle || "Add your music folders to start listening"}
      </p>

      {/* Action Button */}
      <Button
        onClick={props.onAction}
        size="lg"
        class={cn(
          "rounded-full gap-2",
          "bg-white text-[oklch(0.25_0.04_280)] font-medium",
          "hover:bg-white/95",
          "shadow-lg shadow-white/10"
        )}
      >
        {props.actionIcon || <FolderPlusIcon class="w-5 h-5" />}
        {props.actionLabel || "Add Folders"}
      </Button>
    </div>
  )
}

// Folder Plus Icon
const FolderPlusIcon: Component<{ class?: string }> = (props) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cn("w-full h-full", props.class)}
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <line x1="9" y1="13" x2="15" y2="13" />
    </svg>
  )
}
