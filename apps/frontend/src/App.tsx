import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { OnboardingFlow } from '@heaven/ui'
import { VerticalVideoFeed, VideoPlaybackProvider, type VideoPostData } from './components/feed'
import { useAuth } from './providers'
import { checkNameAvailable, registerHeavenName, uploadAvatar, setProfile } from './lib/heaven'
import type { OnboardingBasicsData } from '@heaven/ui'

// Placeholder feed videos
const feedVideos: VideoPostData[] = [
  {
    id: '1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/heaven1/450/800',
    username: 'synthwave_dreams',
    userAvatar: 'https://picsum.photos/seed/user1/100/100',
    caption: 'Late night coding sessions hit different with this track 🎵✨',
    trackTitle: 'Neon Dreams',
    trackArtist: 'Synthwave Collective',
    trackCoverUrl: 'https://picsum.photos/seed/album1/100/100',
    likes: 4200,
    comments: 89,
    shares: 23,
    isLiked: false,
    canInteract: true,
  },
  {
    id: '2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/heaven2/450/800',
    username: 'lofi_producer',
    userAvatar: 'https://picsum.photos/seed/user2/100/100',
    caption: 'New beat dropping soon 🔥 What do you think?',
    trackTitle: 'Midnight Rain',
    trackArtist: 'Lo-Fi Beats',
    trackCoverUrl: 'https://picsum.photos/seed/album2/100/100',
    likes: 1850,
    comments: 42,
    shares: 15,
    isLiked: true,
    canInteract: true,
  },
]

export const App: Component = () => {
  const auth = useAuth()
  const [claiming, setClaiming] = createSignal(false)
  const [claimError, setClaimError] = createSignal<string | null>(null)
  const [uploading, setUploading] = createSignal(false)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [submittingBasics, setSubmittingBasics] = createSignal(false)
  const [basicsError, setBasicsError] = createSignal<string | null>(null)
  const [claimedName, setClaimedName] = createSignal('')

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
        console.log('[Onboarding] Claimed name set to:', name)

        // Save username to localStorage for profile page
        try {
          console.log('[Onboarding] Saving username to localStorage:', name)
          localStorage.setItem('heaven:username', name)
          const saved = localStorage.getItem('heaven:username')
          console.log('[Onboarding] Verification - localStorage now has:', saved)
        } catch (e) {
          console.error('[Onboarding] Failed to save username:', e)
        }
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

  async function handleBasicsContinue(data: OnboardingBasicsData): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    const hasData = data.age || data.gender || data.nativeLanguage || data.targetLanguage
    if (!hasData) return true

    setSubmittingBasics(true)
    setBasicsError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await setProfile(
        {
          displayName: claimedName() || undefined,
          age: data.age,
          gender: data.gender,
          nativeLanguage: data.nativeLanguage,
          targetLanguage: data.targetLanguage,
        },
        pkp.ethAddress,
        authContext,
        pkp.publicKey,
      )

      if (result.success) {
        console.log('[Onboarding] Profile set on-chain:', result)
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

  async function handleAvatarUpload(file: File): Promise<boolean> {
    const pkp = auth.pkpInfo()
    if (!pkp) return false

    setUploading(true)
    setUploadError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await uploadAvatar(file, pkp.publicKey, authContext)

      if (result.success) {
        console.log('[Onboarding] Avatar uploaded:', result)
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
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
      return false
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
    <OnboardingFlow
      open={auth.isNewUser()}
      onOpenChange={(open) => { if (!open) auth.dismissOnboarding() }}
      nameStepProps={{
        onCheckAvailability: handleCheckAvailability,
        onClaim: handleClaim,
        claiming: claiming(),
        error: claimError(),
      }}
      basicsStepProps={{
        onContinue: handleBasicsContinue,
        submitting: submittingBasics(),
        error: basicsError(),
      }}
      avatarStepProps={{
        onUpload: handleAvatarUpload,
        uploading: uploading(),
        error: uploadError(),
      }}
      onComplete={(data) => {
        console.log('[Onboarding] Complete:', data)
        auth.dismissOnboarding()
      }}
    />
    <VideoPlaybackProvider>
      <VerticalVideoFeed
        videos={feedVideos}
        onLikeClick={(id) => console.log('Like:', id)}
        onCommentClick={(id) => console.log('Comment:', id)}
        onShareClick={(id) => console.log('Share:', id)}
        onProfileClick={(username) => console.log('Profile:', username)}
        onTrackClick={(id) => console.log('Track:', id)}
      />
    </VideoPlaybackProvider>
    </>
  )
}
