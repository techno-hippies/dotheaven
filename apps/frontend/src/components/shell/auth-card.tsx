import { Component, JSX, Show } from 'solid-js'
import { cn, Button } from '@heaven/ui'

export type AuthStatus = 'idle' | 'authenticating' | 'success' | 'error'

export interface AuthCardProps {
  /** Current auth status */
  status: AuthStatus
  /** Auth mode - signin or register */
  authMode?: 'signin' | 'register'
  /** Error message to display */
  error?: string | null
  /** Called when sign in button clicked */
  onSignIn?: () => void
  /** Called when register button clicked */
  onRegister?: () => void
  /** Called when try again button clicked */
  onRetry?: () => void
  /** Called when back button clicked */
  onBack?: () => void
  /** Logo image source */
  logoSrc?: string
  /** App name */
  appName?: string
  /** Tagline */
  tagline?: string
  /** Optional CSS class */
  class?: string
}

const SpinnerIcon: Component<{ class?: string }> = (props) => (
  <svg class={cn("animate-spin", props.class)} fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

const CheckIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

const WarningIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

const PasskeyIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </svg>
)

/**
 * AuthCard - Reusable authentication card component
 *
 * Displays different states: idle (login/register), authenticating, success, error
 */
export const AuthCard: Component<AuthCardProps> = (props) => {
  const appName = () => props.appName || 'Heaven'
  const tagline = () => props.tagline || 'Matches are made in Heaven'

  return (
    <div class={cn(
      "w-full max-w-md bg-[var(--bg-surface)] border border-[var(--bg-highlight)] rounded-2xl p-8 shadow-xl",
      props.class
    )}>
      {/* Idle State */}
      <Show when={props.status === 'idle'}>
        <div class="text-center space-y-6">
          <Show when={props.logoSrc}>
            <img
              src={props.logoSrc}
              alt={`${appName()} logo`}
              class="w-20 h-20 mx-auto object-contain"
            />
          </Show>
          <div>
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">{appName()}</h2>
            <p class="text-[var(--text-secondary)] mt-2">Sign in with your passkey</p>
          </div>
          <div class="space-y-3">
            <Button
              variant="default"
              size="lg"
              class="w-full gap-2"
              onClick={props.onSignIn}
            >
              <PasskeyIcon class="w-5 h-5" />
              Sign In with Passkey
            </Button>
            <Button
              variant="secondary"
              size="lg"
              class="w-full"
              onClick={props.onRegister}
            >
              Create New Account
            </Button>
          </div>
          <p class="text-[var(--text-muted)] text-xs">{tagline()}</p>
        </div>
      </Show>

      {/* Authenticating State */}
      <Show when={props.status === 'authenticating'}>
        <div class="text-center space-y-6">
          <div class="w-16 h-16 mx-auto text-[var(--accent-blue)]">
            <SpinnerIcon class="w-full h-full" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">
              {props.authMode === 'register' ? 'Creating Account...' : 'Signing In...'}
            </h2>
            <p class="text-[var(--text-secondary)] mt-2">
              Complete the passkey prompt
            </p>
          </div>
        </div>
      </Show>

      {/* Success State */}
      <Show when={props.status === 'success'}>
        <div class="text-center space-y-6">
          <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckIcon class="w-10 h-10 text-green-500" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">Success!</h2>
            <p class="text-[var(--text-secondary)] mt-2">You can close this window.</p>
          </div>
        </div>
      </Show>

      {/* Error State */}
      <Show when={props.status === 'error'}>
        <div class="text-center space-y-6">
          <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <WarningIcon class="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">Authentication Failed</h2>
            <Show when={props.error}>
              <p class="text-red-500 mt-2">{props.error}</p>
            </Show>
          </div>
          <div class="space-y-3">
            <Button
              variant="default"
              size="lg"
              class="w-full"
              onClick={props.onRetry}
            >
              Try Again
            </Button>
            <Button
              variant="secondary"
              size="lg"
              class="w-full"
              onClick={props.onBack}
            >
              Back
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}
