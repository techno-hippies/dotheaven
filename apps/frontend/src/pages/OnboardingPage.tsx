/**
 * OnboardingPage — mandatory 4-step onboarding after auth.
 *
 * Steps:
 * 1. Name — Claim a .heaven name (on-chain via RegistryV1)
 * 2. Basics — Age, gender, location, language (on-chain via ProfileV2 + RecordsV1)
 * 3. Music — Connect Spotify or pick favorite artists (skippable)
 * 4. Avatar — Upload profile photo (IPFS + RecordsV1)
 *
 * All steps mandatory except Music (skippable). Resumes at the correct step
 * on page refresh by reading on-chain state via useOnboardingStatus.
 */

import type { Component } from 'solid-js'
import { createSignal, createEffect, onMount, Show, Switch, Match } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import {
  OnboardingNameStep,
  OnboardingBasicsStep,
  OnboardingMusicStep,
  OnboardingAvatarStep,
  Stepper,
} from '@heaven/ui'
import type { OnboardingBasicsData, OnboardingMusicData, OnboardingArtist } from '@heaven/ui'
import { HOME } from '@heaven/core'
import { useAuth } from '../providers'
import { useI18n } from '@heaven/i18n/solid'
import { useOnboardingStatus } from '../hooks/useOnboardingStatus'
import {
  checkNameAvailable,
  registerHeavenName,
  setProfile,
  setTextRecord,
  setTextRecords,
  uploadAvatar,
  computeNode,
} from '../lib/heaven'
import { queryClient } from '../main'
import {
  startSpotifyLink,
  isSpotifyCallback,
  handleSpotifyCallback,
  clearSpotifyCallback,
} from '../lib/camp-spotify'

type OnboardingStep = 'name' | 'basics' | 'music' | 'avatar' | 'complete'

const MUSIC_RECORD_KEY = 'heaven.music.v1'
const MUSIC_COUNT_RECORD_KEY = 'heaven.music.count'

type MusicPreferencesV1 = {
  version: 1
  source: 'spotify' | 'manual'
  updatedAt: number
  artistMbids: string[]
}

export const OnboardingPage: Component = () => {
  const auth = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const address = () => auth.pkpAddress()
  const onboarding = useOnboardingStatus(address)

  // Local step state — initialized from on-chain status
  const [step, setStep] = createSignal<OnboardingStep>('name')
  const [initialized, setInitialized] = createSignal(false)

  // Track claimed name for subsequent steps
  const [claimedName, setClaimedName] = createSignal<string>('')

  // Name step state
  const [claiming, setClaiming] = createSignal(false)
  const [claimError, setClaimError] = createSignal<string | null>(null)

  // Basics step state
  const [basicsSubmitting, setBasicsSubmitting] = createSignal(false)
  const [basicsError, setBasicsError] = createSignal<string | null>(null)

  // Music step state
  const [musicSubmitting, setMusicSubmitting] = createSignal(false)
  const [musicError, setMusicError] = createSignal<string | null>(null)
  const [connectingSpotify, setConnectingSpotify] = createSignal(false)

  // Avatar step state
  const [avatarUploading, setAvatarUploading] = createSignal(false)
  const [avatarError, setAvatarError] = createSignal<string | null>(null)

  // Redirect if not authenticated
  createEffect(() => {
    if (auth.isSessionRestoring()) return
    if (!auth.isAuthenticated()) {
      navigate(HOME, { replace: true })
    }
  })

  // Redirect if already complete
  createEffect(() => {
    if (onboarding.status() === 'complete') {
      navigate(HOME, { replace: true })
    }
  })

  // Initialize step from on-chain status (once)
  createEffect(() => {
    if (initialized()) return
    const initial = onboarding.initialStep()
    if (initial && onboarding.status() !== 'loading') {
      setStep(initial)
      // If name already exists, populate claimedName from localStorage
      if (initial !== 'name') {
        const cached = localStorage.getItem('heaven:username')
        if (cached) setClaimedName(cached)
      }
      setInitialized(true)
    }
  })

  // ── Name step handlers ─────────────────────────────────────────

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
    const addr = address()
    if (!pkp || !addr) return false

    setClaiming(true)
    setClaimError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await registerHeavenName(name, addr, authContext, pkp.publicKey)

      if (result.success) {
        console.log('[Onboarding] Name registered:', name)
        setClaimedName(name)
        try {
          localStorage.setItem('heaven:username', name)
        } catch { /* ignore */ }
        // Invalidate the name query so useOnboardingStatus updates
        queryClient.invalidateQueries({ queryKey: ['primaryName', addr] })
        setStep('basics')
        return true
      } else {
        setClaimError(result.error || t('onboarding.registrationFailed'))
        return false
      }
    } catch (err) {
      console.error('[Onboarding] Claim error:', err)
      setClaimError(err instanceof Error ? err.message : t('onboarding.registrationFailed'))
      return false
    } finally {
      setClaiming(false)
    }
  }

  // ── Basics step handlers ───────────────────────────────────────

  async function handleBasicsContinue(data: OnboardingBasicsData): Promise<boolean | void> {
    const pkp = auth.pkpInfo()
    const addr = address()
    if (!pkp || !addr) return false

    setBasicsSubmitting(true)
    setBasicsError(null)
    try {
      const authContext = await auth.getAuthContext()

      // Build ProfileInput from basics data
      const profileInput: Record<string, any> = {}
      if (data.age != null) profileInput.age = data.age
      if (data.gender) profileInput.gender = data.gender
      if (data.languages?.length) profileInput.languages = data.languages

      // Save structured profile data to ProfileV2
      const profileResult = await setProfile(profileInput, addr, authContext, pkp.publicKey)
      if (!profileResult.success) {
        throw new Error(profileResult.error || 'Failed to save profile')
      }
      console.log('[Onboarding] Profile saved:', profileResult.txHash)

      // Save location as a text record on RecordsV1 (if we have a name)
      const name = claimedName()
      if (name && data.location) {
        const node = computeNode(name)
        const recordResult = await setTextRecord(
          node,
          'heaven.location',
          data.location.label,
          pkp.publicKey,
          authContext,
        )
        if (!recordResult.success) {
          console.warn('[Onboarding] Failed to set location record:', recordResult.error)
          // Non-fatal — profile was saved, location is a text record bonus
        }
      }

      // Invalidate profile query
      queryClient.invalidateQueries({ queryKey: ['profile', addr] })
      setStep('music')
    } catch (err) {
      console.error('[Onboarding] Basics save error:', err)
      setBasicsError(err instanceof Error ? err.message : t('onboarding.failedToSave'))
      return false
    } finally {
      setBasicsSubmitting(false)
    }
  }

  // ── Music step handlers ────────────────────────────────────────

  function buildMusicPreferencesPayload(data: OnboardingMusicData): MusicPreferencesV1 {
    const artistMbids = Array.from(
      new Set(
        data.artists
          .map((artist) => artist.mbid?.trim())
          .filter((mbid): mbid is string => Boolean(mbid)),
      ),
    )

    return {
      version: 1,
      source: data.spotifyConnected ? 'spotify' : 'manual',
      updatedAt: Math.floor(Date.now() / 1000),
      artistMbids,
    }
  }

  // Build a PKP signer adapter for Camp SDK
  function buildPkpSigner() {
    const addr = address()
    if (!addr) throw new Error('Not authenticated')
    return {
      signMessage: (message: string) => auth.signMessage(message),
      getAddress: () => addr,
    }
  }

  // On mount: detect if we're returning from Spotify OAuth redirect
  onMount(async () => {
    if (!isSpotifyCallback()) return

    // Wait for auth to be ready
    const waitForAuth = () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (auth.isAuthenticated() && !auth.isSessionRestoring()) {
            resolve()
          } else {
            setTimeout(check, 200)
          }
        }
        check()
      })

    try {
      await waitForAuth()
      setStep('music')
      setConnectingSpotify(true)
      setMusicError(null)

      const signer = buildPkpSigner()
      const artists = await handleSpotifyCallback(signer)

      if (artists.length > 0) {
        // Auto-continue with the fetched artists
        await handleMusicContinue({ artists, spotifyConnected: true })
      } else {
        setMusicError(t('onboarding.noSpotifyArtists'))
        clearSpotifyCallback()
      }
    } catch (err) {
      console.error('[Onboarding] Spotify callback error:', err)
      setMusicError(
        err instanceof Error ? err.message : t('onboarding.spotifyImportFailed'),
      )
      clearSpotifyCallback()
    } finally {
      setConnectingSpotify(false)
    }
  })

  async function handleConnectSpotify(): Promise<OnboardingArtist[] | null> {
    setConnectingSpotify(true)
    setMusicError(null)
    try {
      const signer = buildPkpSigner()
      // This redirects the browser — code after this won't execute
      await startSpotifyLink(signer)
      return null
    } catch (err) {
      console.error('[Onboarding] Spotify connect error:', err)
      setMusicError(t('onboarding.spotifyConnectFailed'))
      return null
    } finally {
      setConnectingSpotify(false)
    }
  }

  async function handleMusicContinue(data: OnboardingMusicData): Promise<boolean | void> {
    setMusicSubmitting(true)
    setMusicError(null)
    try {
      if (data.artists.length > 0) {
        const musicPayload = buildMusicPreferencesPayload(data)
        const artistMbids = musicPayload.artistMbids

        const name = claimedName()
        const pkp = auth.pkpInfo()

        let persisted = false
        if (name && pkp && artistMbids.length > 0) {
          const authContext = await auth.getAuthContext()
          const node = computeNode(name)
          const recordResult = await setTextRecords(
            node,
            [MUSIC_RECORD_KEY, MUSIC_COUNT_RECORD_KEY],
            [JSON.stringify(musicPayload), String(artistMbids.length)],
            pkp.publicKey,
            authContext,
          )
          if (recordResult.success) {
            persisted = true
            console.log('[Onboarding] Music preferences saved to RecordsV1:', recordResult.txHash)
          } else {
            console.warn('[Onboarding] Failed to persist music records:', recordResult.error)
          }
        }

        // Keep local cache as a fallback/read-optimistic source.
        try {
          localStorage.setItem('heaven:favoriteArtists', JSON.stringify(artistMbids))
          localStorage.setItem('heaven:favoriteArtistsV1', JSON.stringify(musicPayload))
        } catch { /* ignore */ }

        if (!persisted) {
          console.log('[Onboarding] Music preferences cached locally:', artistMbids.length, 'artists')
        }
      }
      setStep('avatar')
    } catch (err) {
      console.error('[Onboarding] Music save error:', err)
      setMusicError(err instanceof Error ? err.message : t('onboarding.failedToSave'))
      return false
    } finally {
      setMusicSubmitting(false)
    }
  }

  // ── Avatar step handlers ───────────────────────────────────────

  async function handleAvatarUpload(file: File): Promise<boolean | void> {
    const pkp = auth.pkpInfo()
    const addr = address()
    const name = claimedName()
    if (!pkp || !addr || !name) return false

    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const authContext = await auth.getAuthContext()

      // Upload to IPFS via Lit Action
      const uploadResult = await uploadAvatar(file, pkp.publicKey, authContext)
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Avatar upload failed')
      }
      console.log('[Onboarding] Avatar uploaded:', uploadResult.avatarCID)

      // Set avatar text record on RecordsV1
      const node = computeNode(name)
      const avatarURI = `ipfs://${uploadResult.avatarCID}`
      const recordResult = await setTextRecord(node, 'avatar', avatarURI, pkp.publicKey, authContext)
      if (!recordResult.success) {
        throw new Error(recordResult.error || 'Failed to set avatar record')
      }
      console.log('[Onboarding] Avatar record set:', recordResult.txHash)

      // Invalidate avatar query + update onboarding cache
      queryClient.invalidateQueries({ queryKey: ['textRecord', node, 'avatar'] })
      try {
        localStorage.setItem(`heaven:onboarding:${addr.toLowerCase()}`, 'complete')
      } catch { /* ignore */ }

      setStep('complete')
      // Redirect after brief confirmation
      setTimeout(() => navigate(HOME, { replace: true }), 1200)
    } catch (err) {
      console.error('[Onboarding] Avatar upload error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      // Detect 413 / payload-too-large (can surface as CORS error on 413 responses)
      if (msg.includes('413') || msg.includes('access control') || msg.includes('Too Large')) {
        setAvatarError(t('onboarding.imageTooLarge'))
      } else {
        setAvatarError(msg || t('onboarding.failedToSave'))
      }
      return false
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleAvatarImport(uri: string): Promise<boolean | void> {
    const pkp = auth.pkpInfo()
    const addr = address()
    const name = claimedName()
    if (!pkp || !addr || !name) return false

    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const authContext = await auth.getAuthContext()
      const node = computeNode(name)
      const recordResult = await setTextRecord(node, 'avatar', uri, pkp.publicKey, authContext)
      if (!recordResult.success) {
        throw new Error(recordResult.error || 'Failed to set avatar record')
      }
      console.log('[Onboarding] Avatar import set:', recordResult.txHash)

      queryClient.invalidateQueries({ queryKey: ['textRecord', node, 'avatar'] })
      try {
        localStorage.setItem(`heaven:onboarding:${addr.toLowerCase()}`, 'complete')
      } catch { /* ignore */ }

      setStep('complete')
      setTimeout(() => navigate(HOME, { replace: true }), 1200)
    } catch (err) {
      console.error('[Onboarding] Avatar import error:', err)
      setAvatarError(err instanceof Error ? err.message : t('onboarding.failedToSave'))
      return false
    } finally {
      setAvatarUploading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div class="min-h-screen flex flex-col bg-[var(--bg-page)]">
      <div class="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Loading state while checking on-chain status */}
        <Show
          when={onboarding.status() !== 'loading'}
          fallback={
            <div class="flex flex-col items-center gap-3">
              <div class="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
              <p class="text-base text-[var(--text-secondary)]">{t('onboarding.checkingProfile')}</p>
            </div>
          }
        >
          <Switch>
            {/* ── Name Step ──────────────────────────── */}
            <Match when={step() === 'name'}>
              <div class="w-full max-w-md">
                <div class="flex justify-center mb-6">
                  <img
                    src={`${import.meta.env.BASE_URL}images/heaven.png`}
                    alt="Heaven"
                    class="w-12 h-12 object-contain"
                  />
                </div>
                <Stepper steps={4} currentStep={0} class="mb-6" />
                <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
                  {t('onboarding.chooseName.title')}
                </h1>
                <p class="text-[var(--text-secondary)] text-center mb-8">
                  {t('onboarding.chooseName.description')}
                </p>
                <OnboardingNameStep
                  class="gap-6"
                  onCheckAvailability={handleCheckAvailability}
                  onClaim={handleClaim}
                  claiming={claiming()}
                  error={claimError()}
                />
              </div>
            </Match>

            {/* ── Basics Step ────────────────────────── */}
            <Match when={step() === 'basics'}>
              <div class="w-full max-w-md">
                <div class="flex justify-center mb-6">
                  <img
                    src={`${import.meta.env.BASE_URL}images/heaven.png`}
                    alt="Heaven"
                    class="w-12 h-12 object-contain"
                  />
                </div>
                <Stepper steps={4} currentStep={1} class="mb-6" />
                <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
                  {t('onboarding.basics.title')}
                </h1>
                <p class="text-[var(--text-secondary)] text-center mb-8">
                  {t('onboarding.basics.description')}
                </p>
                <OnboardingBasicsStep
                  claimedName={claimedName()}
                  onContinue={handleBasicsContinue}
                  submitting={basicsSubmitting()}
                  error={basicsError()}
                />
              </div>
            </Match>

            {/* ── Music Step ─────────────────────────── */}
            <Match when={step() === 'music'}>
              <div class="w-full max-w-md">
                <div class="flex justify-center mb-6">
                  <img
                    src={`${import.meta.env.BASE_URL}images/heaven.png`}
                    alt="Heaven"
                    class="w-12 h-12 object-contain"
                  />
                </div>
                <Stepper steps={4} currentStep={2} class="mb-6" />
                <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
                  {t('onboarding.music.title')}
                </h1>
                <p class="text-[var(--text-secondary)] text-center mb-8">
                  {t('onboarding.music.description')}
                </p>
                <OnboardingMusicStep
                  claimedName={claimedName()}
                  onConnectSpotify={handleConnectSpotify}
                  onContinue={handleMusicContinue}
                  submitting={musicSubmitting()}
                  connectingSpotify={connectingSpotify()}
                  error={musicError()}
                />
              </div>
            </Match>

            {/* ── Avatar Step ────────────────────────── */}
            <Match when={step() === 'avatar'}>
              <div class="w-full max-w-md">
                <div class="flex justify-center mb-6">
                  <img
                    src={`${import.meta.env.BASE_URL}images/heaven.png`}
                    alt="Heaven"
                    class="w-12 h-12 object-contain"
                  />
                </div>
                <Stepper steps={4} currentStep={3} class="mb-6" />
                <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
                  {t('onboarding.avatar.title')}
                </h1>
                <p class="text-[var(--text-secondary)] text-center mb-8">
                  {claimedName()
                    ? t('onboarding.avatar.lookingGoodDescription', { name: claimedName() })
                    : t('onboarding.avatar.helpRecognize')}
                </p>
                <OnboardingAvatarStep
                  claimedName={claimedName()}
                  onUpload={handleAvatarUpload}
                  onImportAvatar={handleAvatarImport}
                  uploading={avatarUploading()}
                  error={avatarError()}
                />
              </div>
            </Match>

            {/* ── Complete ────────────────────────────── */}
            <Match when={step() === 'complete'}>
              <div class="flex flex-col items-center gap-6 text-center py-8">
                <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg class="w-10 h-10 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                  </svg>
                </div>
                <h1 class="text-2xl font-bold text-[var(--text-primary)]">{t('onboarding.allSet')}</h1>
                <p class="text-[var(--text-secondary)]">
                  {t('onboarding.welcomeUser', { name: claimedName() })}
                </p>
              </div>
            </Match>
          </Switch>
        </Show>
      </div>
    </div>
  )
}
