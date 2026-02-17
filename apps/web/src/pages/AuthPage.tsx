/**
 * Auth Page
 *
 * Dual-purpose authentication page:
 * 1. Callback flow - when ?callback=... param exists, handles auth and POSTs result back to localhost
 * 2. Web flow redirect - when no callback, redirects to main app (auth handled by AuthContext)
 *
 * Shows Tempo passkey sign-in/register options.
 */

import { Component, createSignal, onMount } from 'solid-js'
import { AuthCard, type AuthStatus } from '../components/shell'
import type { TempoAuthResult } from '../lib/tempo/auth'

const TEMPO_SCROBBLE_SESSION_TTL_SEC = 7 * 24 * 60 * 60

type TempoScrobbleSessionPayload = {
  tempoSessionPrivateKey: `0x${string}`
  tempoSessionAddress: `0x${string}`
  tempoSessionExpiresAt: number
  tempoSessionKeyAuthorization: `0x${string}`
}

export const AuthPage: Component = () => {
  const [status, setStatus] = createSignal<AuthStatus>('idle')
  const [error, setError] = createSignal<string | null>(null)
  const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')
  const [authMethod, setAuthMethod] = createSignal<'passkey'>('passkey')

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
  const callbackState = authParams.get('state') || undefined
  const tempoKeyManagerUrl =
    authParams.get('tempoKeyManagerUrl') ||
    import.meta.env.VITE_TEMPO_KEY_MANAGER_URL ||
    'https://keys.tempo.xyz'
  const tempoFeePayerUrl =
    authParams.get('tempoFeePayerUrl') ||
    import.meta.env.VITE_TEMPO_FEE_PAYER_URL ||
    'https://sponsor.moderato.tempo.xyz'
  const tempoChainIdRaw =
    authParams.get('tempoChainId') ||
    import.meta.env.VITE_TEMPO_CHAIN_ID ||
    '42431'
  const parsedTempoChainId = Number.parseInt(tempoChainIdRaw, 10)
  const tempoChainId = Number.isFinite(parsedTempoChainId) ? parsedTempoChainId : 42431
  const tempoRpId =
    authParams.get('tempoRpId') ||
    import.meta.env.VITE_TEMPO_RP_ID ||
    window.location.hostname
  const initialMode = authParams.get('mode')

  const buildTempoScrobbleSession = async (
    result: TempoAuthResult
  ): Promise<TempoScrobbleSessionPayload> => {
    if (!result.tempoCredentialId || !result.tempoPublicKey) {
      throw new Error('Tempo credential data missing; cannot provision scrobble session key.')
    }

    const [viemTempo, viem] = await Promise.all([import('viem/tempo'), import('viem')])

    const rootAccount = viemTempo.Account.fromWebAuthnP256(
      {
        id: result.tempoCredentialId,
        publicKey: result.tempoPublicKey as `0x${string}`,
      },
      { rpId: result.tempoRpId }
    )

    const sessionPrivateKey = viemTempo.Secp256k1.randomPrivateKey() as `0x${string}`
    const sessionAccount = viemTempo.Account.fromSecp256k1(sessionPrivateKey)
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + TEMPO_SCROBBLE_SESSION_TTL_SEC

    const keyAuthorization = await rootAccount.signKeyAuthorization(
      {
        accessKeyAddress: sessionAccount.address,
        keyType: sessionAccount.keyType,
      },
      { expiry: sessionExpiresAt }
    )
    const keyAuthorizationTuple = viemTempo.Account.z_KeyAuthorization.toTuple(keyAuthorization)
    const keyAuthorizationRlp = viem.toRlp(keyAuthorizationTuple as any) as `0x${string}`

    return {
      tempoSessionPrivateKey: sessionPrivateKey,
      tempoSessionAddress: sessionAccount.address,
      tempoSessionExpiresAt: sessionExpiresAt,
      tempoSessionKeyAuthorization: keyAuthorizationRlp,
    }
  }

  console.log('[AuthPage] callback flow:', isCallbackFlow, 'transport:', callbackTransport)

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

  const handleTempoAuthSuccess = async (result: TempoAuthResult, isNewUser: boolean) => {
    const scrobbleSession = await buildTempoScrobbleSession(result)

    const callbackPayload: Record<string, unknown> = {
      version: 2,
      provider: 'tempo-passkey',
      walletAddress: result.walletAddress,
      state: callbackState,
      tempoCredentialId: result.tempoCredentialId,
      tempoPublicKey: result.tempoPublicKey,
      tempoRpId: result.tempoRpId,
      tempoKeyManagerUrl: result.tempoKeyManagerUrl,
      tempoFeePayerUrl: result.tempoFeePayerUrl,
      tempoChainId: result.tempoChainId,
      tempoSessionPrivateKey: scrobbleSession.tempoSessionPrivateKey,
      tempoSessionAddress: scrobbleSession.tempoSessionAddress,
      tempoSessionExpiresAt: scrobbleSession.tempoSessionExpiresAt,
      tempoSessionKeyAuthorization: scrobbleSession.tempoSessionKeyAuthorization,
      isNewUser,
    }

    const sent = await sendCallback(callbackPayload)
    if (sent) {
      setStatus('success')
      return
    }
    setError('Failed to send result to app')
    setStatus('error')
  }

  const handleAuthError = async (err: Error, provider: 'tempo-passkey') => {
    setError(err.message || 'Authentication failed')
    setStatus('error')
    await sendCallback({
      version: 2,
      provider,
      state: callbackState,
      tempoRpId,
      tempoKeyManagerUrl,
      tempoFeePayerUrl,
      tempoChainId,
      error: err.message || 'Authentication failed',
    })
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
      const { authenticateWithTempoPasskey } = await import('../lib/tempo/auth')
      const result = await authenticateWithTempoPasskey({
        mode: 'signin',
        chainId: tempoChainId,
        feePayerUrl: tempoFeePayerUrl,
        keyManagerUrl: tempoKeyManagerUrl,
        rpId: tempoRpId,
      })
      await handleTempoAuthSuccess(result, false)
    } catch (e: unknown) {
      console.error('[AuthPage] Sign in failed:', e)
      await handleAuthError(e as Error, 'tempo-passkey')
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
      const { authenticateWithTempoPasskey } = await import('../lib/tempo/auth')
      const result = await authenticateWithTempoPasskey({
        mode: 'register',
        chainId: tempoChainId,
        feePayerUrl: tempoFeePayerUrl,
        keyManagerUrl: tempoKeyManagerUrl,
        rpId: tempoRpId,
      })
      await handleTempoAuthSuccess(result, true)
    } catch (e: unknown) {
      console.error('[Auth] Registration failed:', e)
      await handleAuthError(e as Error, 'tempo-passkey')
    } finally {
      inFlight = false
    }
  }

  const handleRetry = () => {
    authMode() === 'register' ? performRegister() : performSignIn()
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
      // Legacy alias from older clients; keep it mapped to passkey sign-in.
      console.log('[AuthPage] Auto-starting sign-in flow (legacy connect-wallet mode)')
      queueMicrotask(() => performSignIn())
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
        onRetry={handleRetry}
        onBack={() => setStatus('idle')}
      />
    </div>
  )
}
