/**
 * Auth Page
 *
 * Dual-purpose authentication page:
 * 1. Tauri callback flow - when ?callback=... param exists, handles auth and POSTs result back to localhost
 * 2. Web flow redirect - when no callback, redirects to main app (auth handled by AuthContext)
 *
 * Shows passkey sign-in/register + a single "Connect Wallet" button that auto-detects new vs returning.
 */

import { Component, createSignal, onMount } from 'solid-js'
import { AuthCard, type AuthStatus } from '../components/shell'
import type { PKPInfo, AuthData } from '../lib/lit'

export const AuthPage: Component = () => {
  const [status, setStatus] = createSignal<AuthStatus>('idle')
  const [error, setError] = createSignal<string | null>(null)
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')
  const [authMethod, setAuthMethod] = createSignal<'passkey' | 'eoa'>('passkey')

  // Parse callback URL from query params (supports both hash and regular routing)
  const getCallbackUrl = () => {
    const hash = window.location.hash
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
    const params = new URLSearchParams(hashQuery || window.location.search)
    return params.get('callback') || undefined
  }

  const callbackUrl = getCallbackUrl()
  const isTauriCallback = !!callbackUrl

  console.log('[AuthPage] callbackUrl:', callbackUrl, 'isTauriCallback:', isTauriCallback)

  // Send result to Tauri via POST
  const sendCallback = async (data: Record<string, unknown>) => {
    if (!callbackUrl) {
      console.log('[AuthPage] No callbackUrl, skipping POST')
      return false
    }
    console.log('[AuthPage] POSTing to callback:', callbackUrl, 'data keys:', Object.keys(data))
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      console.log('[AuthPage] Callback response:', res.status, res.ok)
      return res.ok
    } catch (e) {
      console.error('[AuthPage] Callback fetch failed:', e)
      return false
    }
  }

  const handleAuthSuccess = async (pkpInfo: PKPInfo, authData: AuthData, isNewUser: boolean) => {
    console.log('[AuthPage] handleAuthSuccess:', pkpInfo.ethAddress, 'isNewUser:', isNewUser)
    console.log('[AuthPage] authData keys:', Object.keys(authData))
    console.log('[AuthPage] authData full:', authData)
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
      console.log('[AuthPage] SUCCESS - callback sent, page will NOT close (debug mode)')
      // Temporarily disabled for debugging - uncomment when done:
      // setTimeout(() => window.close(), 5000)
    } else {
      setError('Failed to send result to app')
      setStatus('error')
    }
  }

  const handleAuthError = async (err: Error) => {
    setError(err.message || 'Authentication failed')
    setStatus('error')
    await sendCallback({ error: err.message || 'Authentication failed' })
  }

  // Guard against double-calls
  let inFlight = false

  const performSignIn = async () => {
    if (inFlight) return
    inFlight = true
    setAuthMode('signin')
    setAuthMethod('passkey')
    setStatus('authenticating')
    setError(null)

    try {
      console.log('[AuthPage] Starting WebAuthn authenticate...')
      const { authenticateWithWebAuthn } = await import('../lib/lit')
      const result = await authenticateWithWebAuthn()
      console.log('[AuthPage] WebAuthn result:', result.pkpInfo.ethAddress)
      await handleAuthSuccess(result.pkpInfo, result.authData, false)
    } catch (e: unknown) {
      console.error('[AuthPage] Sign in failed:', e)
      await handleAuthError(e as Error)
    } finally {
      inFlight = false
    }
  }

  const performRegister = async () => {
    if (inFlight) return
    inFlight = true
    setAuthMode('register')
    setAuthMethod('passkey')
    setStatus('authenticating')
    setError(null)

    try {
      await (await import('../lib/lit')).registerWithWebAuthn()
      const { authenticateWithWebAuthn } = await import('../lib/lit')
      const authResult = await authenticateWithWebAuthn()
      await handleAuthSuccess(authResult.pkpInfo, authResult.authData, true)
    } catch (e: unknown) {
      console.error('[Auth] Registration failed:', e)
      await handleAuthError(e as Error)
    } finally {
      inFlight = false
    }
  }

  // Single "Connect Wallet" flow: try sign-in first, auto-register if no PKP found
  const performConnectWallet = async () => {
    if (inFlight) return
    inFlight = true
    setAuthMode('signin')
    setAuthMethod('eoa')
    setStatus('authenticating')
    setError(null)

    try {
      const { authenticateWithEOA } = await import('../lib/lit')
      const result = await authenticateWithEOA()
      await handleAuthSuccess(result.pkpInfo, result.authData, false)
    } catch (e: unknown) {
      const err = e as Error
      // If no PKP found, auto-register
      if (err.message?.includes('No PKP found')) {
        console.log('[Auth] No PKP for wallet, auto-registering...')
        setAuthMode('register')
        try {
          const { registerWithEOA } = await import('../lib/lit')
          const result = await registerWithEOA()
          await handleAuthSuccess(result.pkpInfo, result.authData, true)
        } catch (regErr: unknown) {
          console.error('[Auth] EOA registration failed:', regErr)
          await handleAuthError(regErr as Error)
        }
      } else {
        console.error('[Auth] EOA sign in failed:', e)
        await handleAuthError(err)
      }
    } finally {
      inFlight = false
    }
  }

  const handleRetry = () => {
    if (authMethod() === 'eoa') {
      performConnectWallet()
    } else {
      authMode() === 'register' ? performRegister() : performSignIn()
    }
  }

  // Redirect to main app if not a Tauri callback
  onMount(() => {
    console.log('[AuthPage] onMount, isTauriCallback:', isTauriCallback, 'hash:', window.location.hash)
    if (!isTauriCallback) {
      console.log('[AuthPage] No callback, redirecting to /')
      window.location.href = '/'
    }
  })

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
        authMethod={authMethod()}
        error={error()}
        logoSrc={`${import.meta.env.BASE_URL}images/heaven.png`}
        onSignIn={performSignIn}
        onRegister={performRegister}
        onConnectWallet={performConnectWallet}
        onRetry={handleRetry}
        onBack={() => setStatus('idle')}
      />
    </div>
  )
}
