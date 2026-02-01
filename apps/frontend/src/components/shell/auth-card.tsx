import { Component, Show } from 'solid-js'
import { cn, Button, Spinner } from '@heaven/ui'

export type AuthStatus = 'idle' | 'authenticating' | 'success' | 'error'

export interface AuthCardProps {
  /** Current auth status */
  status: AuthStatus
  /** Auth mode - signin or register */
  authMode?: 'signin' | 'register'
  /** Auth method used for current authenticating/error state display */
  authMethod?: 'passkey' | 'eoa'
  /** Error message to display */
  error?: string | null
  /** Called when passkey sign in button clicked */
  onSignIn?: () => void
  /** Called when passkey register button clicked */
  onRegister?: () => void
  /** Called when connect wallet button clicked (auto sign-in or register) */
  onConnectWallet?: () => void
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

const WalletIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </svg>
)

/**
 * AuthCard - Reusable authentication card component
 *
 * Displays different states: idle (login/register), authenticating, success, error
 */
export const AuthCard: Component<AuthCardProps> = (props) => {
  const appName = () => props.appName || 'Heaven'
  const isEOA = () => props.authMethod === 'eoa'

  return (
    <div class={cn(
      "w-full max-w-md bg-[var(--bg-surface)] border border-[var(--bg-highlight)] rounded-md p-8 shadow-xl",
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
          </div>
          <div class="flex flex-row gap-3">
            <Button
              variant="secondary"
              size="lg"
              class="flex-1"
              onClick={props.onSignIn}
            >
              Sign In
            </Button>
            <Button
              variant="default"
              size="lg"
              class="flex-1"
              onClick={props.onRegister}
            >
              New Account
            </Button>
          </div>
          <Show when={props.onConnectWallet}>
            <div class="space-y-4">
              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-[var(--bg-highlight)]" />
                </div>
                <div class="relative flex justify-center text-base">
                  <span class="bg-[var(--bg-surface)] px-2 text-[var(--text-muted)]">or</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="lg"
                class="w-full gap-2"
                onClick={props.onConnectWallet}
              >
                <WalletIcon class="w-5 h-5" />
                Connect Wallet
              </Button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Authenticating State */}
      <Show when={props.status === 'authenticating'}>
        <div class="text-center space-y-6">
          <div class="w-16 h-16 flex items-center justify-center mx-auto text-[var(--accent-blue)]">
            <Spinner size="xl" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">
              {props.authMode === 'register' ? 'Creating Account...' : 'Signing In...'}
            </h2>
            <p class="text-[var(--text-secondary)] mt-2">
              {isEOA() ? 'Confirm in your wallet' : 'Complete the passkey prompt'}
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
