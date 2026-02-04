/**
 * OnboardingPage — full-page onboarding route for new users.
 *
 * Replaces the dialog-based OnboardingFlow. Reuses the same step components
 * (OnboardingNameStep, OnboardingBasicsStep, OnboardingAvatarStep) in a
 * standalone full-screen layout.
 *
 * Redirects to / if not authenticated, redirects to / on completion.
 */

import type { Component } from 'solid-js'
import { createSignal, createEffect, createResource, Match, Switch } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import {
  Stepper,
  OnboardingNameStep,
  OnboardingBasicsStep,
  OnboardingAvatarStep,
} from '@heaven/ui'
import type { OnboardingBasicsData } from '@heaven/ui'
import { useAuth } from '../providers'
import {
  checkNameAvailable,
  registerHeavenName,
  uploadAvatar,
  setProfile,
  setTextRecord,
  computeNode,
  getEnsProfile,
} from '../lib/heaven'

type OnboardingStep = 'name' | 'basics' | 'avatar' | 'complete'
const STEPS: OnboardingStep[] = ['name', 'basics', 'avatar', 'complete']

export const OnboardingPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  // Guard: redirect if not authenticated
  createEffect(() => {
    if (auth.isSessionRestoring()) return
    if (!auth.isAuthenticated()) {
      navigate('/', { replace: true })
    }
  })

  const [step, setStep] = createSignal<OnboardingStep>('name')
  const [claimedName, setClaimedName] = createSignal('')

  // Name step state
  const [claiming, setClaiming] = createSignal(false)
  const [claimError, setClaimError] = createSignal<string | null>(null)

  // Basics step state
  const [submittingBasics, setSubmittingBasics] = createSignal(false)
  const [basicsError, setBasicsError] = createSignal<string | null>(null)

  // Avatar step state
  const [uploading, setUploading] = createSignal(false)
  const [uploadError, setUploadError] = createSignal<string | null>(null)

  // ENS profile for EOA users
  const [ensProfile] = createResource(
    () => auth.eoaAddress(),
    async (addr) => {
      if (!addr) return null
      console.log('[Onboarding] Fetching ENS profile for EOA:', addr)
      const result = await getEnsProfile(addr)
      console.log('[Onboarding] ENS profile:', result)
      return result
    },
  )

  const stepIndex = () => STEPS.indexOf(step())

  const title = () => {
    switch (step()) {
      case 'name': return 'Choose your name'
      case 'basics': return 'A bit about you'
      case 'avatar': return 'Add a profile photo'
      case 'complete': return "You're all set!"
    }
  }

  const subtitle = () => {
    switch (step()) {
      case 'name': return "This is your identity on Heaven. It's how people find and message you."
      case 'basics': return 'Helps us match your timezone and language preferences.'
      case 'avatar': return claimedName()
        ? `Looking good, ${claimedName()}.heaven. Add a photo so people recognize you.`
        : 'Help people recognize you.'
      case 'complete': return `Welcome to Heaven, ${claimedName()}.heaven. Your identity is secured on-chain.`
    }
  }

  // Auto-redirect on complete
  createEffect(() => {
    if (step() === 'complete') {
      auth.dismissOnboarding()
      setTimeout(() => navigate('/', { replace: true }), 1500)
    }
  })

  // ── Name step handlers ─────────────────────────────────────────────

  async function handleCheckAvailability(name: string): Promise<boolean> {
    try {
      return await checkNameAvailable(name)
    } catch (err) {
      console.error('[Onboarding] Availability check failed:', err)
      return false
    }
  }

  async function handleClaim(name: string): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    setClaiming(true)
    setClaimError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await registerHeavenName(
        name,
        pkp.ethAddress,
        authContext,
        pkp.publicKey,
      )

      if (result.success) {
        console.log('[Onboarding] Name registered:', result)
        setClaimedName(name)
        try {
          localStorage.setItem('heaven:username', name)
        } catch (e) {
          console.error('[Onboarding] Failed to save username:', e)
        }
        setStep('basics')
        return true
      } else {
        console.error('[Onboarding] Registration failed:', result.error)
        setClaimError(result.error || 'Registration failed. Please try again.')
        return false
      }
    } catch (err) {
      console.error('[Onboarding] Claim error:', err)
      setClaimError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
      return false
    } finally {
      setClaiming(false)
    }
  }

  // ── Basics step handlers ───────────────────────────────────────────

  async function handleBasicsContinue(data: OnboardingBasicsData): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    const hasData = data.age || data.gender || data.languages.length > 0
    if (!hasData) {
      setStep('avatar')
      return true
    }

    setSubmittingBasics(true)
    setBasicsError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await setProfile(
        {
          displayName: claimedName() || undefined,
          age: data.age ?? undefined,
          gender: data.gender,
          languages: data.languages.length > 0 ? data.languages : undefined,
        },
        pkp.ethAddress,
        authContext,
        pkp.publicKey,
      )

      if (result.success) {
        console.log('[Onboarding] Profile set on-chain:', result)
        setStep('avatar')
        return true
      } else {
        console.error('[Onboarding] Profile set failed:', result.error)
        setBasicsError(result.error || 'Failed to save profile. Please try again.')
        return false
      }
    } catch (err) {
      console.error('[Onboarding] Profile error:', err)
      setBasicsError(err instanceof Error ? err.message : 'Failed to save profile. Please try again.')
      return false
    } finally {
      setSubmittingBasics(false)
    }
  }

  // ── Avatar step handlers ───────────────────────────────────────────

  async function handleAvatarUpload(file: File): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
    if (file.size > MAX_AVATAR_SIZE) {
      setUploadError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please use an image under 2 MB.`)
      return false
    }

    setUploading(true)
    setUploadError(null)
    try {
      const authContext = await auth.getAuthContext()
      const username = claimedName() || localStorage.getItem('heaven:username')
      if (!username) {
        setUploadError('Claim a Heaven name before setting an avatar.')
        return false
      }
      const result = await uploadAvatar(file, pkp.publicKey, authContext)

      if (result.success && result.avatarCID) {
        console.log('[Onboarding] Avatar uploaded:', result)
        const avatarURI = `ipfs://${result.avatarCID}`
        const node = computeNode(username)
        const recordResult = await setTextRecord(
          node,
          'avatar',
          avatarURI,
          pkp.publicKey,
          authContext,
        )
        if (!recordResult.success) {
          console.error('[Onboarding] Failed to set avatar record:', recordResult.error)
          setUploadError(recordResult.error || 'Failed to set avatar record.')
          return false
        }
        console.log('[Onboarding] Avatar record set:', recordResult.txHash)
        setStep('complete')
        return true
      } else {
        console.error('[Onboarding] Avatar upload failed:', result.error)
        const error = result.error || 'Upload failed. Please try again.'
        setUploadError(
          error.includes('realistic photos')
            ? 'Only anime, cartoon, or illustrated avatars are allowed. Please choose a different image.'
            : error
        )
        return false
      }
    } catch (err) {
      console.error('[Onboarding] Avatar error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('413') || msg.toLowerCase().includes('payload too large') || msg.toLowerCase().includes('too large')) {
        setUploadError('Image is too large. Please use a smaller image (under 2 MB).')
      } else if (msg.includes('network_error') || msg.includes('Load failed')) {
        setUploadError('Network error uploading image. Please try a smaller file or check your connection.')
      } else {
        setUploadError(msg || 'Upload failed. Please try again.')
      }
      return false
    } finally {
      setUploading(false)
    }
  }

  async function handleImportAvatar(uri: string): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    const username = claimedName() || localStorage.getItem('heaven:username')
    if (!username) {
      setUploadError('Claim a Heaven name before setting an avatar.')
      return false
    }

    setUploading(true)
    setUploadError(null)
    try {
      const authContext = await auth.getAuthContext()
      const node = computeNode(username)
      const recordResult = await setTextRecord(
        node,
        'avatar',
        uri,
        pkp.publicKey,
        authContext,
      )
      if (!recordResult.success) {
        setUploadError(recordResult.error || 'Failed to set avatar record.')
        return false
      }
      console.log('[Onboarding] ENS avatar imported, record set:', recordResult.txHash)
      setStep('complete')
      return true
    } catch (err) {
      console.error('[Onboarding] Import avatar error:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to import avatar.')
      return false
    } finally {
      setUploading(false)
    }
  }

  return (
    <div class="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-page)] px-4 py-12">
      <div class="w-full max-w-md">
        {/* Logo */}
        <div class="flex justify-center mb-8">
          <img
            src={`${import.meta.env.BASE_URL}images/heaven.png`}
            alt="Heaven"
            class="w-12 h-12 object-contain"
          />
        </div>

        {/* Step indicator (hidden on complete) */}
        <Switch>
          <Match when={step() !== 'complete'}>
            <Stepper steps={3} currentStep={stepIndex()} class="mb-4 justify-center" />
            <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
              {title()}
            </h1>
            <p class="text-[var(--text-secondary)] text-center mb-8">
              {subtitle()}
            </p>
          </Match>
          <Match when={step() === 'complete'}>
            <div class="text-center mb-8">
              <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-1">{title()}</h1>
              <p class="text-[var(--text-secondary)]">{subtitle()}</p>
            </div>
          </Match>
        </Switch>

        {/* Step content */}
        <Switch>
          <Match when={step() === 'name'}>
            <OnboardingNameStep
              class="gap-6"
              onCheckAvailability={handleCheckAvailability}
              onClaim={handleClaim}
              claiming={claiming()}
              error={claimError()}
            />
          </Match>
          <Match when={step() === 'basics'}>
            <OnboardingBasicsStep
              claimedName={claimedName()}
              onContinue={handleBasicsContinue}
              onSkip={() => setStep('avatar')}
              submitting={submittingBasics()}
              error={basicsError()}
            />
          </Match>
          <Match when={step() === 'avatar'}>
            <OnboardingAvatarStep
              claimedName={claimedName()}
              onUpload={handleAvatarUpload}
              onImportAvatar={handleImportAvatar}
              onSkip={() => {
                setStep('complete')
              }}
              uploading={uploading()}
              error={uploadError()}
              ensAvatar={ensProfile()?.avatar ?? null}
              ensAvatarRecord={ensProfile()?.avatarRecord ?? null}
              ensName={ensProfile()?.name ?? null}
            />
          </Match>
          <Match when={step() === 'complete'}>
            <div class="flex flex-col items-center gap-6 text-center py-8">
              <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg class="w-10 h-10 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                </svg>
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
