/**
 * Auth Page
 *
 * Dual-purpose authentication page:
 * 1. Tauri callback flow - when ?callback=... param exists, handles passkey auth and POSTs result back to localhost
 * 2. Web flow redirect - when no callback, redirects to main app (auth handled by AuthContext)
 */

import { Component, createSignal, onMount } from 'solid-js'
import { AuthCard, type AuthStatus } from '@heaven/ui'
import { registerWithWebAuthn, authenticateWithWebAuthn } from '../lib/lit'
import type { PKPInfo, AuthData } from '../lib/lit'

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
      <AuthCard
        status={status()}
        authMode={authMode()}
        error={error()}
        logoSrc="/images/heaven.png"
        onSignIn={performSignIn}
        onRegister={performRegister}
        onRetry={() => authMode() === 'register' ? performRegister() : performSignIn()}
        onBack={() => setStatus('idle')}
      />
    </div>
  )
}
