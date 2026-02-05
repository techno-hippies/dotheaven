/**
 * AuthDialog — modal for Sign In / New Account / Connect Wallet.
 *
 * Extracts the auth phase UI from the old AuthFlowPage into a dialog.
 * On successful authentication, auto-closes. The onboarding gate in
 * AppLayout handles redirection to /onboarding if needed.
 *
 * Responsive: Drawer on mobile, Dialog on desktop.
 */

import type { Component, JSX } from 'solid-js'
import { createSignal, createEffect, Show } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogCloseButton,
  Drawer,
  DrawerContent,
  useIsMobile,
} from '@heaven/ui'
import { useAuth } from '../../providers'

export interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AuthDialog: Component<AuthDialogProps> = (props) => {
  const auth = useAuth()
  const isMobile = useIsMobile()

  const [authMethod, setAuthMethod] = createSignal<'passkey' | 'eoa'>('passkey')
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')

  // Auto-close on successful auth
  createEffect(() => {
    if (auth.isAuthenticated() && props.open) {
      props.onOpenChange(false)
    }
  })

  // Reset error state when dialog opens
  createEffect(() => {
    if (props.open) {
      auth.clearError()
    }
  })

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

  // Shared header content (logo + title + description)
  const headerContent = (): JSX.Element => (
    <div class="flex flex-col items-center text-center">
      <img
        src={`${import.meta.env.BASE_URL}images/heaven.png`}
        alt="Heaven"
        class="w-16 h-16 object-contain mb-4"
      />
      <p class="text-xl font-semibold text-[var(--text-primary)]">Welcome to Heaven</p>
      <p class="text-base text-[var(--text-secondary)] mt-2">
        Karaoke to learn a language, make friends, and date.
      </p>
    </div>
  )

  // Shared body content (buttons + error + loading)
  const bodyContent = (): JSX.Element => (
    <div class="space-y-4">
      <Show when={hasError()}>
        <div class="flex items-center gap-3 p-3 rounded-md bg-red-500/10">
          <svg class="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 256 256">
            <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z" />
          </svg>
          <p class="text-sm text-red-400">{auth.authError()}</p>
        </div>
      </Show>

      <Show
        when={!isLoading()}
        fallback={
          <div class="flex flex-col items-center gap-3 py-4">
            <div class="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
            <p class="text-sm text-[var(--text-secondary)] text-center">
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
          <button
            type="button"
            class="flex-1 px-4 py-3 rounded-md font-semibold text-base bg-[var(--bg-highlight-hover)] text-[var(--text-primary)] hover:brightness-110 transition-all cursor-pointer"
            onClick={hasError() ? handleRetry : handleSignIn}
          >
            {hasError() ? 'Try Again' : 'Sign In'}
          </button>
          <button
            type="button"
            class="flex-1 px-4 py-3 rounded-md font-semibold text-base bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)] transition-colors cursor-pointer"
            onClick={handleRegister}
          >
            New Account
          </button>
        </div>

        <p class="text-center text-[var(--text-muted)] text-sm">or</p>

        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-semibold text-base bg-[var(--bg-highlight-hover)] text-[var(--accent-blue)] hover:brightness-110 transition-all cursor-pointer"
          onClick={handleConnectWallet}
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
            <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
          </svg>
          Connect Wallet
        </button>
      </Show>
    </div>
  )

  return (
    <Show
      when={isMobile()}
      fallback={
        // Desktop: Dialog
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
          <DialogContent class="max-w-sm">
            {/* Custom header with centered content and absolute close button */}
            <div class="relative p-6 pb-4">
              <DialogCloseButton class="absolute top-4 right-4 p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              </DialogCloseButton>
              {headerContent()}
            </div>
            <DialogBody>{bodyContent()}</DialogBody>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Mobile: Drawer */}
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent showHandle class="pb-8">
          <div class="pt-4 pb-6">
            {headerContent()}
          </div>
          {bodyContent()}
        </DrawerContent>
      </Drawer>
    </Show>
  )
}
