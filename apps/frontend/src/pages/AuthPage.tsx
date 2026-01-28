/**
 * Auth Page
 *
 * Dual-purpose authentication page:
 * 1. Tauri callback flow - when ?callback=... param exists, handles passkey auth and POSTs result back to localhost
 * 2. Web flow redirect - when no callback, redirects to main app (auth handled by AuthContext)
 */

import { Component, createSignal, onMount, Switch, Match, Show } from 'solid-js'
import { registerWithWebAuthn, authenticateWithWebAuthn } from '../lib/lit'
import type { PKPInfo, AuthData } from '../lib/lit'

type AuthStatus = 'idle' | 'authenticating' | 'success' | 'error'

export const AuthPage: Component = () => {
  const [status, setStatus] = createSignal<AuthStatus>('idle')
  const [error, setError] = createSignal<string | null>(null)
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')

  // Parse callback URL from query params
  const getCallbackUrl = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('callback') || undefined
  }

  const callbackUrl = getCallbackUrl()
  const isTauriCallback = !!callbackUrl

  // Send result to Tauri via POST
  const sendCallback = async (data: Record<string, unknown>) => {
    if (!callbackUrl) return false
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.ok
    } catch (e) {
      console.error('[Auth] Callback failed:', e)
      return false
    }
  }

  const handleAuthSuccess = async (pkpInfo: PKPInfo, authData: AuthData, isNewUser: boolean) => {
    const sent = await sendCallback({
      pkpPublicKey: pkpInfo.publicKey,
      pkpAddress: pkpInfo.ethAddress,
      pkpTokenId: pkpInfo.tokenId,
      authMethodType: authData.authMethodType,
      authMethodId: authData.authMethodId,
      accessToken: authData.accessToken,
      isNewUser,
    })

    if (sent) {
      setStatus('success')
      // Auto-close after delay
      setTimeout(() => window.close(), 1500)
    } else {
      setError('Failed to send result to app')
      setStatus('error')
    }
  }

  // Guard against double-calls
  let inFlight = false

  const performSignIn = async () => {
    if (inFlight) return
    inFlight = true

    setAuthMode('signin')
    setStatus('authenticating')
    setError(null)

    try {
      const result = await authenticateWithWebAuthn()
      await handleAuthSuccess(result.pkpInfo, result.authData, false)
    } catch (e: unknown) {
      const err = e as Error
      console.error('[Auth] Sign in failed:', err)
      setError(err.message || 'Sign in failed')
      setStatus('error')
      await sendCallback({ error: err.message || 'Sign in failed' })
    } finally {
      inFlight = false
    }
  }

  const performRegister = async () => {
    if (inFlight) return
    inFlight = true

    setAuthMode('register')
    setStatus('authenticating')
    setError(null)

    try {
      const result = await registerWithWebAuthn()
      await handleAuthSuccess(result.pkpInfo, result.authData, true)
    } catch (e: unknown) {
      const err = e as Error
      console.error('[Auth] Registration failed:', err)
      setError(err.message || 'Registration failed')
      setStatus('error')
      await sendCallback({ error: err.message || 'Registration failed' })
    } finally {
      inFlight = false
    }
  }

  // Redirect to main app if not a Tauri callback
  onMount(() => {
    if (!isTauriCallback) {
      // Web users hitting /auth directly should go to main app
      window.location.href = '/'
    }
  })

  // If not Tauri callback, show nothing (will redirect)
  if (!isTauriCallback) {
    return (
      <div class="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
        <p class="text-[var(--text-secondary)]">Redirecting...</p>
      </div>
    )
  }

  return (
    <div class="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-page)]">
      <div class="w-full max-w-md">
        <div class="bg-[var(--bg-surface)] border border-[var(--bg-highlight)] rounded-2xl p-8 shadow-xl">
          <Switch>
            {/* Authenticating */}
            <Match when={status() === 'authenticating'}>
              <div class="text-center space-y-6">
                <div class="w-16 h-16 mx-auto">
                  <svg class="animate-spin w-full h-full text-[var(--accent-blue)]" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <div>
                  <h2 class="text-2xl font-bold text-[var(--text-primary)]">
                    {authMode() === 'register' ? 'Creating Account...' : 'Signing In...'}
                  </h2>
                  <p class="text-[var(--text-secondary)] mt-2">
                    Complete the passkey prompt
                  </p>
                </div>
              </div>
            </Match>

            {/* Success */}
            <Match when={status() === 'success'}>
              <div class="text-center space-y-6">
                <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <svg class="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 class="text-2xl font-bold text-[var(--text-primary)]">Success!</h2>
                  <p class="text-[var(--text-secondary)] mt-2">You can close this window.</p>
                </div>
              </div>
            </Match>

            {/* Error */}
            <Match when={status() === 'error'}>
              <div class="text-center space-y-6">
                <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                  <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 class="text-2xl font-bold text-[var(--text-primary)]">Authentication Failed</h2>
                  <p class="text-red-500 mt-2">{error()}</p>
                </div>
                <div class="space-y-3">
                  <button
                    onClick={() => authMode() === 'register' ? performRegister() : performSignIn()}
                    class="w-full py-3 px-4 bg-[oklch(0.65_0.12_240)] hover:opacity-90 text-white font-semibold rounded-lg transition-opacity"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setStatus('idle')}
                    class="w-full py-3 px-4 bg-[var(--bg-highlight)] hover:bg-[var(--bg-highlight-hover)] text-[var(--text-primary)] font-semibold rounded-lg transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            </Match>

            {/* Idle */}
            <Match when={status() === 'idle'}>
              <div class="text-center space-y-6">
                <img
                  src="/images/heaven.png"
                  alt="Heaven"
                  class="w-20 h-20 mx-auto"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <div>
                  <h2 class="text-2xl font-bold text-[var(--text-primary)]">Heaven</h2>
                  <p class="text-[var(--text-secondary)] mt-2">Sign in with your passkey</p>
                </div>
                <div class="space-y-3">
                  <button
                    onClick={performSignIn}
                    class="w-full py-3 px-4 bg-[oklch(0.65_0.12_240)] hover:opacity-90 text-white font-semibold rounded-lg transition-opacity"
                  >
                    Sign In with Passkey
                  </button>
                  <button
                    onClick={performRegister}
                    class="w-full py-3 px-4 bg-[var(--bg-highlight)] hover:bg-[var(--bg-highlight-hover)] text-[var(--text-primary)] font-semibold rounded-lg transition-colors"
                  >
                    Create New Account
                  </button>
                </div>
                <p class="text-[var(--text-muted)] text-xs">Matches are made in Heaven</p>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  )
}
