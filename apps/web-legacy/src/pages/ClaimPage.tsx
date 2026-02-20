/**
 * ClaimPage — standalone route at /c/:token
 *
 * Wires the ClaimFlow UI component to the api-core claim endpoints.
 * No AppShell or AuthGuard — unauthenticated visitors can access this.
 *
 * Demo mode: /c/demo skips the API and uses mock data for testing.
 */

import { Component, createSignal, onMount } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { ClaimFlow, type ClaimState } from '@heaven/ui'
import type { ClaimProfileData } from '@heaven/ui'
import { ONBOARDING } from '@heaven/core'

const API_BASE = (() => {
  const url = (import.meta.env.VITE_CLAIM_API_URL || '').trim()
  if (!url) throw new Error('Missing VITE_CLAIM_API_URL')
  return url.replace(/\/+$/, '')
})()
const CLAIM_SIGNATURE_WINDOW_SECONDS = 120

function buildClaimCompleteMessage(params: {
  claimId: string
  shadowProfileId: string
  address: string
  nonce: string
  issuedAt: number
  expiresAt: number
}): string {
  return [
    'heaven-claim:v1',
    `claim_id=${params.claimId}`,
    `shadow_profile_id=${params.shadowProfileId}`,
    `address=${params.address.toLowerCase()}`,
    `nonce=${params.nonce}`,
    `issued_at=${params.issuedAt}`,
    `expires_at=${params.expiresAt}`,
  ].join('\n')
}

function generateNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const random = new Uint8Array(16)
  crypto.getRandomValues(random)
  return Array.from(random)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const DEMO_PROFILE: ClaimProfileData = {
  displayName: 'Alex Chen',
  avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=alex-chen',
  source: 'dateme',
  sourceUrl: 'https://dateme.directory/alex-chen',
  age: '28',
  gender: 'M',
  location: 'San Francisco, CA',
  bio: 'Software engineer who loves hiking, board games, and making pasta from scratch. Looking for someone to explore the city with.',
  likesReceived: 3,
}

export const ClaimPage: Component = () => {
  const params = useParams<{ token: string }>()
  const navigate = useNavigate()
  const isDemo = () => params.token === 'demo'

  const [state, setState] = createSignal<ClaimState>('loading')
  const [profile, setProfile] = createSignal<ClaimProfileData | null>(null)
  const [error, setError] = createSignal<string>('')

  // IDs returned by the API, needed for subsequent calls
  const [shadowProfileId, setShadowProfileId] = createSignal<string>('')
  const [claimId, setClaimId] = createSignal<string>('')

  // Load shadow profile on mount
  onMount(async () => {
    if (isDemo()) {
      setProfile(DEMO_PROFILE)
      setShadowProfileId('demo-shadow-id')
      setState('profile')
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/claim/${params.token}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Claim link not found or expired')
      }
      const data = await res.json()
      setShadowProfileId(data.id)
      setProfile({
        displayName: data.displayName || 'Unknown',
        avatarUrl: data.avatarUrl,
        source: data.source || '',
        sourceUrl: data.sourceUrl,
        age: data.age,
        gender: data.gender,
        location: data.location,
        bio: data.bio,
        likesReceived: data.likesReceived ?? 0,
      })
      setState('profile')
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load profile')
      setState('error')
    }
  })

  // Verify code (DM token)
  const handleSubmitCode = async (code: string) => {
    setState('checking')
    setError('')

    if (isDemo()) {
      setTimeout(() => {
        if (code.toUpperCase() === 'HVN-K7X9MP') {
          setClaimId('demo-claim-id')
          setState('passkey')
        } else {
          setError('Invalid code. Try HVN-K7X9MP')
          setState('profile')
        }
      }, 1500)
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/claim/verify-dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shadowProfileId: shadowProfileId(), code }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Invalid code')
      }
      const data = await res.json()
      setClaimId(data.claimId)
      setState('passkey')
    } catch (e: unknown) {
      setError((e as Error).message)
      setState('profile')
    }
  }

  // Create passkey + complete claim
  const handleCreatePasskey = async () => {
    const currentClaimId = claimId()
    const currentShadowProfileId = shadowProfileId()
    if (!currentClaimId || !currentShadowProfileId) {
      setError('Claim session missing. Please re-open your claim link and verify again.')
      setState('profile')
      return
    }

    setState('minting')
    setError('')

    if (isDemo()) {
      setTimeout(() => setState('success'), 2000)
      return
    }

    try {
      const { registerWithWebAuthn, createPKPAuthContext, signMessageWithPKP } = await import('../lib/lit')
      const result = await registerWithWebAuthn()
      const authContext = await createPKPAuthContext(result.pkpInfo, result.authData)

      const normalizedAddress = result.pkpInfo.ethAddress.toLowerCase()
      const nonce = generateNonce()
      const timestamp = Math.floor(Date.now() / 1000)
      const expiresAt = timestamp + CLAIM_SIGNATURE_WINDOW_SECONDS
      const message = buildClaimCompleteMessage({
        claimId: currentClaimId,
        shadowProfileId: currentShadowProfileId,
        address: normalizedAddress,
        nonce,
        issuedAt: timestamp,
        expiresAt,
      })
      const signature = await signMessageWithPKP(result.pkpInfo, authContext, message)

      // Complete the claim on the API
      const res = await fetch(`${API_BASE}/api/claim/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: currentClaimId,
          address: normalizedAddress,
          signature,
          timestamp,
          nonce,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to complete claim')
      }

      // Persist session so AuthContext picks it up on next page load
      try {
        localStorage.setItem('heaven:session', JSON.stringify({
          pkpInfo: result.pkpInfo,
          authData: result.authData,
        }))
      } catch {}

      setState('success')
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to create passkey')
      setState('passkey')
    }
  }

  return (
    <ClaimFlow
      state={state()}
      profile={profile()}
      error={error()}
      onSubmitCode={handleSubmitCode}
      onCreatePasskey={handleCreatePasskey}
      onComplete={() => navigate(ONBOARDING)}
      onGoHome={() => navigate('/')}
    />
  )
}
