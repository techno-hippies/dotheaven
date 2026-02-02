import { type Component, type JSX } from 'solid-js'
import { cn, Button } from '@heaven/ui'

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
        "bg-[var(--bg-page)]",
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
      <h1 class="text-4xl font-semibold text-[var(--text-primary)] mb-3">
        Welcome to Heaven
      </h1>

      <p class="text-lg text-[var(--text-secondary)] mb-10">
        {props.subtitle || "Add your music folders to start listening"}
      </p>

      {/* Action Button */}
      <Button
        onClick={props.onAction}
        size="lg"
        variant="default"
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
      viewBox="0 0 256 256"
      fill="currentColor"
      class={cn("w-full h-full", props.class)}
    >
      <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM92.69,56l16,16H40V56ZM216,200H40V88H216Zm-88-88a8,8,0,0,1,8,8v16h16a8,8,0,0,1,0,16H136v16a8,8,0,0,1-16,0V152H104a8,8,0,0,1,0-16h16V120A8,8,0,0,1,128,112Z" />
    </svg>
  )
}
