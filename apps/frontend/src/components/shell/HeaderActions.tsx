import { type Component, Show, createSignal } from 'solid-js'
import {
  Button,
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
} from '@heaven/ui'
import { AuthCard, type AuthStatus } from './auth-card'
import { useAuth } from '../../providers'

/**
 * Shared header actions (notifications, wallet, avatar) with auth state handling.
 * Shows an auth modal (AuthCard) with passkey + wallet options on both web and Tauri.
 */
export const HeaderActions: Component = () => {
  const auth = useAuth()
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
          </>
        }
      >
        {/* Authenticated state on desktop: nothing (notifications in sidebar) */}
        <></>
      </Show>
    </div>
  )
}
