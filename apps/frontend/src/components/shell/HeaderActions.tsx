import { type Component, Show, createSignal } from 'solid-js'
import { usePlatform } from 'virtual:heaven-platform'
import { Avatar, IconButton, Button } from '@heaven/ui'
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
 * Use this in all page headers to ensure consistent behavior.
 */
export const HeaderActions: Component = () => {
  const platform = usePlatform()
  const auth = useAuth()
  const navigate = useNavigate()
  const [authAction, setAuthAction] = createSignal<'login' | 'register' | null>(null)

  const handleLogin = () => {
    setAuthAction('login')
    auth.loginWithPasskey()
  }

  const handleRegister = () => {
    setAuthAction('register')
    auth.registerWithPasskey()
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
            {/* Web or not authenticating: show login/signup buttons */}
            <Show when={!platform.isTauri || !auth.isAuthenticating()}>
              <Button
                variant="secondary"
                onClick={handleLogin}
                loading={auth.isAuthenticating() && authAction() === 'login'}
                class="w-[125px]"
              >
                Login
              </Button>
              <Button
                variant="default"
                onClick={handleRegister}
                loading={auth.isAuthenticating() && authAction() === 'register'}
                class="w-[125px]"
              >
                Sign Up
              </Button>
            </Show>
          </>
        }
      >
        <IconButton variant="ghost" size="md" aria-label="Notifications">
          <BellIcon />
        </IconButton>
        <IconButton
          variant="ghost"
          size="md"
          aria-label="Wallet"
          onClick={() => navigate('/wallet')}
        >
          <WalletIcon />
        </IconButton>
        <IconButton
          variant="ghost"
          size="md"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <GearIcon />
        </IconButton>
        <button
          onClick={() => navigate('/profile')}
          class="flex items-center gap-2 hover:opacity-80 transition-opacity"
          title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
        >
          <Avatar size="sm" class="cursor-pointer" />
        </button>
      </Show>
    </div>
  )
}
