import { type Component, Show, createSignal } from 'solid-js'
import { usePlatform } from 'virtual:heaven-platform'
import {
  Avatar,
  IconButton,
  Button,
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
} from '@heaven/ui'
import { AuthCard, type AuthStatus } from './auth-card'
import { useAuth } from '../../providers'
import { useNavigate } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
)

/**
 * Shared header actions (notifications, wallet, avatar) with auth state handling.
 * On web: shows an auth modal (AuthCard) with passkey + wallet options.
 * On Tauri: opens browser for auth, shows waiting state in header.
 */
export const HeaderActions: Component = () => {
  const platform = usePlatform()
  const auth = useAuth()
  const navigate = useNavigate()
  const [showAuthModal, setShowAuthModal] = createSignal(false)
  const [authMethod, setAuthMethod] = createSignal<'passkey' | 'eoa'>('passkey')
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')

  const authStatus = (): AuthStatus => {
    if (auth.authError()) return 'error'
    if (auth.isAuthenticating()) return 'authenticating'
    return 'idle'
  }

  const handleSignIn = async () => {
    setAuthMethod('passkey')
    setAuthMode('signin')
    try {
      await auth.loginWithPasskey()
      setShowAuthModal(false)
    } catch {
      // error state handled by authStatus
    }
  }

  const handleRegister = async () => {
    setAuthMethod('passkey')
    setAuthMode('register')
    try {
      await auth.registerWithPasskey()
      setShowAuthModal(false)
    } catch {
      // error state handled by authStatus
    }
  }

  const handleConnectWallet = async () => {
    setAuthMethod('eoa')
    setAuthMode('signin')
    try {
      await auth.connectWallet()
      setShowAuthModal(false)
    } catch {
      // error state handled by authStatus
    }
  }

  const handleRetry = () => {
    auth.clearError()
  }

  const handleBack = () => {
    auth.clearError()
    auth.cancelAuth()
  }

  // Close modal when auth succeeds
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Only allow closing if not mid-auth
      if (!auth.isAuthenticating()) {
        setShowAuthModal(false)
        auth.clearError()
      }
    } else {
      setShowAuthModal(true)
    }
  }

  return (
    <div class="flex items-center gap-3">
      <Show
        when={auth.isAuthenticated()}
        fallback={
          <>
            {/* Tauri: auth happens in browser, show waiting message */}
            <Show when={platform.isTauri && auth.isAuthenticating()}>
              <span class="text-sm text-[var(--text-secondary)]">
                Complete sign-in in browser...
              </span>
              <Button variant="secondary" onClick={() => auth.cancelAuth()}>
                Cancel
              </Button>
            </Show>
            {/* Web: show Login/Sign Up buttons that open the auth modal */}
            <Show when={!platform.isTauri}>
              <Button
                variant="secondary"
                onClick={() => { setAuthMode('signin'); setShowAuthModal(true) }}
                class="w-[125px]"
              >
                Login
              </Button>
              <Button
                variant="default"
                onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                class="w-[125px]"
              >
                Sign Up
              </Button>
              <Dialog open={showAuthModal()} onOpenChange={handleOpenChange}>
                <DialogPortal>
                  <DialogOverlay />
                  <DialogContent class="!p-0 !bg-transparent !border-none !shadow-none !max-w-md">
                    <AuthCard
                      status={authStatus()}
                      authMode={authMode()}
                      authMethod={authMethod()}
                      error={auth.authError()}
                      onSignIn={handleSignIn}
                      onRegister={handleRegister}
                      onConnectWallet={handleConnectWallet}
                      onRetry={handleRetry}
                      onBack={handleBack}
                      appName="Heaven"
                    />
                  </DialogContent>
                </DialogPortal>
              </Dialog>
            </Show>
            {/* Tauri not authenticating: show buttons that trigger browser auth */}
            <Show when={platform.isTauri && !auth.isAuthenticating()}>
              <Button
                variant="secondary"
                onClick={() => auth.loginWithPasskey()}
                class="w-[125px]"
              >
                Login
              </Button>
              <Button
                variant="default"
                onClick={() => auth.registerWithPasskey()}
                class="w-[125px]"
              >
                Sign Up
              </Button>
            </Show>
          </>
        }
      >
        {/* Authenticated — no actions needed, everything is in sidebar */}
      </Show>
    </div>
  )
}
