/**
 * LandingPage — full-screen landing page for unauthenticated users.
 *
 * Hero section with tagline + three feature pillars + inline auth buttons.
 * Rendered by AppLayout when the user is not authenticated.
 */

import { type Component, createSignal, Show } from 'solid-js'
import { Button, Spinner } from '@heaven/ui'
import { useAuth } from '../providers'

// ── Feature icons (Phosphor, 256x256 viewBox) ────────────────────────

const VinylRecordIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-100a12,12,0,1,0,12,12A12,12,0,0,0,128,116Zm0-48a60,60,0,1,0,60,60A60.07,60.07,0,0,0,128,68Zm0,104a44,44,0,1,1,44-44A44.05,44.05,0,0,1,128,172Z" />
  </svg>
)

const UsersThreeIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM64,112a8,8,0,0,0,7.37-4.89,8,8,0,0,0,0-6.22A8,8,0,0,0,64,96a24,24,0,1,1,23.24-30,8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,64,112Z" />
  </svg>
)

const MicrophoneStageIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,16A72.07,72.07,0,0,0,96,88v0a73.33,73.33,0,0,0,.63,9.42L34.34,159.71a8,8,0,0,0,0,11.32l50.63,50.63a8,8,0,0,0,11.32,0l62.29-62.29A73.33,73.33,0,0,0,168,160h0a72,72,0,0,0,0-144ZM90.63,210.35,45.66,165.37,68,143l45,45ZM168,144a55.67,55.67,0,0,1-11.16-1.12l-22.49,22.49a8,8,0,0,1-11.32,0l-33.4-33.4a8,8,0,0,1,0-11.32l22.49-22.49A56,56,0,1,1,168,144Z" />
  </svg>
)

const WalletIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const WarningIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z" />
  </svg>
)

export const LandingPage: Component = () => {
  const auth = useAuth()

  const [authMethod, setAuthMethod] = createSignal<'passkey' | 'eoa'>('passkey')
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')

  const isLoading = () => auth.isAuthenticating()
  const hasError = () => !!auth.authError()

  const handleSignIn = async () => {
    setAuthMethod('passkey')
    setAuthMode('signin')
    try { await auth.loginWithPasskey() } catch { /* handled by state */ }
  }

  const handleRegister = async () => {
    setAuthMethod('passkey')
    setAuthMode('register')
    try { await auth.registerWithPasskey() } catch { /* handled by state */ }
  }

  const handleConnectWallet = async () => {
    setAuthMethod('eoa')
    setAuthMode('signin')
    try { await auth.connectWallet() } catch { /* handled by state */ }
  }

  const handleRetry = () => {
    auth.clearError()
  }

  return (
    <div class="min-h-screen flex flex-col bg-[var(--bg-page)]">
      <div class="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Hero */}
        <div class="text-center mb-16">
          <img
            src={`${import.meta.env.BASE_URL}images/heaven.png`}
            alt="Heaven"
            class="w-20 h-20 mx-auto mb-6 object-contain"
          />
          <h1 class="text-4xl sm:text-5xl font-bold text-[var(--text-primary)] mb-4">
            Heaven
          </h1>
          <p class="text-lg sm:text-xl text-[var(--text-secondary)] max-w-md mx-auto">
            Karaoke to learn a language,<br />make friends, and date.
          </p>
        </div>

        {/* Three features */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 max-w-3xl w-full mb-16">
          <div class="flex flex-col items-center text-center">
            <div class="w-12 h-12 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center mb-4">
              <VinylRecordIcon class="w-6 h-6 text-[var(--accent-blue)]" />
            </div>
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-2">
              Scrobble your music
            </h3>
            <p class="text-sm text-[var(--text-muted)] leading-relaxed">
              Heaven scrobbles what you listen to to the Ethereum blockchain permanently.
            </p>
          </div>

          <div class="flex flex-col items-center text-center">
            <div class="w-12 h-12 rounded-full bg-[var(--accent-purple)]/10 flex items-center justify-center mb-4">
              <UsersThreeIcon class="w-6 h-6 text-[var(--accent-purple)]" />
            </div>
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-2">
              Get matched
            </h3>
            <p class="text-sm text-[var(--text-muted)] leading-relaxed">
              Based on your scrobbles and preferences, Heaven matches you with candidates.
            </p>
          </div>

          <div class="flex flex-col items-center text-center">
            <div class="w-12 h-12 rounded-full bg-[var(--accent-coral)]/10 flex items-center justify-center mb-4">
              <MicrophoneStageIcon class="w-6 h-6 text-[var(--accent-coral)]" />
            </div>
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-2">
              Karaoke together
            </h3>
            <p class="text-sm text-[var(--text-muted)] leading-relaxed">
              Chat to get to know each other, then karaoke to your favorite songs.
            </p>
          </div>
        </div>

        {/* Auth section — inline, no card */}
        <div class="w-full max-w-sm space-y-4">
          <Show when={hasError()}>
            <div class="flex items-center gap-3 p-3 rounded-md bg-red-500/10 mb-2">
              <WarningIcon class="w-5 h-5 text-red-500 shrink-0" />
              <p class="text-sm text-red-400">{auth.authError()}</p>
            </div>
          </Show>

          <Show
            when={!isLoading()}
            fallback={
              <div class="flex flex-col items-center gap-3 py-4">
                <Spinner size="lg" />
                <p class="text-sm text-[var(--text-secondary)]">
                  {authMethod() === 'eoa'
                    ? 'Confirm in your wallet'
                    : authMode() === 'register'
                      ? 'Complete the passkey prompt to create your account'
                      : 'Complete the passkey prompt to sign in'}
                </p>
              </div>
            }
          >
            <div class="flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                class="flex-1"
                onClick={hasError() ? handleRetry : handleSignIn}
              >
                {hasError() ? 'Try Again' : 'Sign In'}
              </Button>
              <Button
                variant="default"
                size="lg"
                class="flex-1"
                onClick={handleRegister}
              >
                New Account
              </Button>
            </div>

            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-[var(--bg-highlight)]" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="bg-[var(--bg-page)] px-3 text-[var(--text-muted)]">or</span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="lg"
              class="w-full gap-2"
              onClick={handleConnectWallet}
            >
              <WalletIcon class="w-5 h-5" />
              Connect Wallet
            </Button>
          </Show>
        </div>
      </div>
    </div>
  )
}
