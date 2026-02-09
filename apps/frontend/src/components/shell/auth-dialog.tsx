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
import { createEffect, Show } from 'solid-js'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  Drawer,
  DrawerContent,
  Spinner,
  Wallet,
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
    try { await auth.loginWithPasskey() } catch { /* handled by state */ }
  }

  const handleRegister = async () => {
    try { await auth.registerWithPasskey() } catch { /* handled by state */ }
  }

  const handleConnectWallet = async () => {
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
    <div class="flex flex-col gap-5">
      <Show when={hasError()}>
        <div class="flex items-center gap-3 p-3 rounded-md bg-red-500/10">
          <svg class="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 256 256">
            <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z" />
          </svg>
          <p class="text-base text-red-400">{auth.authError()}</p>
        </div>
      </Show>

      <Show
        when={!isLoading()}
        fallback={
          <div class="flex flex-col items-center py-4">
            <Spinner size="md" />
          </div>
        }
      >
        <div class="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={hasError() ? handleRetry : handleSignIn}
          >
            {hasError() ? 'Try Again' : 'Sign In'}
          </Button>
          <Button
            variant="default"
            size="lg"
            onClick={handleRegister}
          >
            New Account
          </Button>
        </div>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-[var(--border-subtle)]" />
          </div>
          <div class="relative flex justify-center text-base">
            <span class="bg-[var(--bg-surface)] px-3 text-[var(--text-muted)]">or</span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="lg"
          class="w-full"
          icon={<Wallet class="w-5 h-5" />}
          onClick={handleConnectWallet}
        >
          Connect Wallet
        </Button>
      </Show>
    </div>
  )

  return (
    <Show
      when={isMobile()}
      fallback={
        // Desktop: Dialog
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              {headerContent()}
            </DialogHeader>
            <DialogBody class="pb-6">{bodyContent()}</DialogBody>
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
