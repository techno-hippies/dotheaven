/**
 * Auth Page
 *
 * Dual-purpose authentication page:
 * 1. Callback flow - when ?callback=... param exists, handles auth and POSTs result back to localhost
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

  // Parse auth query params (supports both hash and regular routing)
  const getAuthParams = () => {
    const hash = window.location.hash
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
    return new URLSearchParams(hashQuery || window.location.search)
  }
  const authParams = getAuthParams()
  const getCallbackUrl = () => authParams.get('callback') || undefined

  const callbackUrl = getCallbackUrl()
  const isCallbackFlow = !!callbackUrl
  const callbackTransport = (authParams.get('transport') || '').toLowerCase()
  const initialMode = authParams.get('mode')

  console.log('[AuthPage] callbackUrl:', callbackUrl, 'isCallbackFlow:', isCallbackFlow, 'transport:', callbackTransport)

  // Send auth result to callback transport:
  // - POST (desktop callback server)
  // - redirect with payload query param (mobile deep links)
  const sendCallback = async (data: Record<string, unknown>) => {
    if (!callbackUrl) {
      console.log('[AuthPage] No callbackUrl, skipping POST')
      return false
    }
    const useRedirect = callbackTransport === 'redirect' || !/^https?:\/\//i.test(callbackUrl)

    if (useRedirect) {
      try {
        const callback = new URL(callbackUrl)
        callback.searchParams.set('payload', JSON.stringify(data))
        const callbackHref = callback.toString()
        console.log('[AuthPage] Redirecting to callback URL:', callbackHref)
        window.location.href = callbackHref
        return true
      } catch (e) {
        console.error('[AuthPage] Callback redirect failed:', e)
        return false
      }
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

  const handleAuthSuccess = async (
    pkpInfo: PKPInfo,
    authData: AuthData,
    isNewUser: boolean,
    eoaAddress?: `0x${string}`
  ) => {
    console.log('[AuthPage] handleAuthSuccess:', pkpInfo.ethAddress, 'isNewUser:', isNewUser)
    console.log('[AuthPage] authData keys:', Object.keys(authData))
    console.log('[AuthPage] authData full:', authData)
    const callbackPayload: Record<string, unknown> = {
      pkpPublicKey: pkpInfo.publicKey,
      pkpAddress: pkpInfo.ethAddress,
      pkpTokenId: pkpInfo.tokenId,
      authMethodType: authData.authMethodType,
      authMethodId: authData.authMethodId,
      accessToken: authData.accessToken,
      isNewUser,
      eoaAddress,
    }

    const includePreGeneratedDelegation = callbackTransport !== 'redirect'

    if (includePreGeneratedDelegation) {
      try {
        // Pre-generate delegation auth materials while accessToken challenge is fresh.
        // Native GPUI can later restore from these without needing a fresh WebAuthn challenge.
        const { createPKPAuthContext } = await import('../lib/lit')
        const authContext = await createPKPAuthContext(pkpInfo, authData)
        if (authContext?.sessionKeyPair) {
          callbackPayload.litSessionKeyPair = authContext.sessionKeyPair
        }
        if (typeof authContext?.authNeededCallback === 'function') {
          const delegationAuthSig = await authContext.authNeededCallback()
          if (delegationAuthSig) {
            callbackPayload.litDelegationAuthSig = delegationAuthSig
          }
        }
        console.log('[AuthPage] Prepared pre-generated Lit delegation auth material for callback')
      } catch (e) {
        console.warn('[AuthPage] Failed to pre-generate Lit delegation auth material; falling back to raw authData only:', e)
      }
    }

    const sent = await sendCallback(callbackPayload)

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
      const { registerWithWebAuthn } = await import('../lib/lit')
      const result = await registerWithWebAuthn()
      await handleAuthSuccess(result.pkpInfo, result.authData, true)
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
      await handleAuthSuccess(result.pkpInfo, result.authData, false, result.eoaAddress)
    } catch (e: unknown) {
      const err = e as Error
      const message = err?.message || String(e)
      const shouldAutoRegister =
        message.includes('No PKP found') ||
        message.includes('missing required personal-sign scope') ||
        message.includes('NodeAuthSigScopeTooLimited') ||
        message.includes('required scope [2]') ||
        message.includes('pkp is not authorized')

      // Auto-register when wallet has no PKP yet or only legacy / under-scoped PKPs.
      if (shouldAutoRegister) {
        console.log('[Auth] Wallet needs PKP migration/registration, auto-registering...')
        setAuthMode('register')
        try {
          const { registerWithEOA } = await import('../lib/lit')
          const result = await registerWithEOA()
          await handleAuthSuccess(result.pkpInfo, result.authData, true, result.eoaAddress)
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

  // Redirect to main app if this is not a callback flow.
  onMount(() => {
    console.log('[AuthPage] onMount, isCallbackFlow:', isCallbackFlow, 'hash:', window.location.hash)
    if (!isCallbackFlow) {
      console.log('[AuthPage] No callback, redirecting to /')
      window.location.href = '/'
      return
    }

    if (initialMode === 'register') {
      console.log('[AuthPage] Auto-starting register flow')
      queueMicrotask(() => performRegister())
    } else if (initialMode === 'signin') {
      console.log('[AuthPage] Auto-starting sign-in flow')
      queueMicrotask(() => performSignIn())
    } else if (initialMode === 'connect-wallet') {
      console.log('[AuthPage] Auto-starting wallet connect flow')
      queueMicrotask(() => performConnectWallet())
    }
  })

  if (!isCallbackFlow) {
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
        tagline="Karaoke to learn a language, make friends, and date."
        onSignIn={performSignIn}
        onRegister={performRegister}
        onConnectWallet={performConnectWallet}
        onRetry={handleRetry}
        onBack={() => setStatus('idle')}
      />
    </div>
  )
}
