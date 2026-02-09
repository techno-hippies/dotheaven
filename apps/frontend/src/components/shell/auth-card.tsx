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
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

const WarningIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z" />
  </svg>
)

const WalletIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
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
      "w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md p-8 shadow-xl",
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
            <h2 class="text-2xl font-bold text-[var(--text-primary)]">Welcome to {appName()}</h2>
            <Show when={props.tagline}>
              <p class="text-base text-[var(--text-secondary)] mt-2">{props.tagline}</p>
            </Show>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={props.onSignIn}
            >
              Sign In
            </Button>
            <Button
              variant="default"
              size="lg"
              onClick={props.onRegister}
            >
              New Account
            </Button>
          </div>
          <Show when={props.onConnectWallet}>
            <div class="space-y-4">
              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-[var(--border-subtle)]" />
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
