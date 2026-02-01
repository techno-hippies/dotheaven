import type { Component } from 'solid-js'
import { createSignal, createResource } from 'solid-js'
import { OnboardingFlow } from '@heaven/ui'
import { FeedPost, PostComposer } from '@heaven/ui'
import { useAuth } from './providers'
import { checkNameAvailable, registerHeavenName, uploadAvatar, setProfile, setTextRecord, computeNode, getEnsProfile } from './lib/heaven'
import type { OnboardingBasicsData } from '@heaven/ui'

const noop = () => {}

export const App: Component = () => {
  const auth = useAuth()
  const [claiming, setClaiming] = createSignal(false)
  const [claimError, setClaimError] = createSignal<string | null>(null)
  const [uploading, setUploading] = createSignal(false)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [submittingBasics, setSubmittingBasics] = createSignal(false)
  const [basicsError, setBasicsError] = createSignal<string | null>(null)
  const [claimedName, setClaimedName] = createSignal('')

  // Fetch ENS profile for EOA users during onboarding
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
      return true
    } catch (err) {
      console.error('[Onboarding] Import avatar error:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to import avatar.')
      return false
    } finally {
      setUploading(false)
    }
  }

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
          age: data.age ?? undefined,
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
        onImportAvatar: handleImportAvatar,
        uploading: uploading(),
        error: uploadError(),
        ensAvatar: ensProfile()?.avatar ?? null,
        ensAvatarRecord: ensProfile()?.avatarRecord ?? null,
        ensName: ensProfile()?.name ?? null,
      }}
      onComplete={(data) => {
        console.log('[Onboarding] Complete:', data)
        auth.dismissOnboarding()
      }}
    />
    <div class="flex flex-col h-full overflow-y-auto">
      <div class="border-b border-[var(--bg-highlight)]">
        <PostComposer
          avatarUrl="https://placewaifu.com/image/100"
          onPhotoClick={noop}
          onVideoClick={noop}
          onMusicClick={noop}
          onSubmit={noop}
        />
      </div>
      <div class="divide-y divide-[var(--bg-highlight)]">
        <FeedPost
          authorName="Yuki"
          authorHandle="yuki.heaven"
          authorAvatarUrl="https://placewaifu.com/image/100"
          timestamp="2h ago"
          text="Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly."
          likes={42}
          comments={7}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Miku"
          authorHandle="miku.heaven"
          authorAvatarUrl="https://placewaifu.com/image/101"
          timestamp="4h ago"
          text="Sunset vibes from the rooftop"
          media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
          likes={234}
          comments={18}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Rei"
          authorHandle="rei.heaven"
          authorAvatarUrl="https://placewaifu.com/image/102"
          timestamp="6h ago"
          text="New album art is incredible"
          media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] }}
          likes={28}
          comments={3}
          isLiked
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Asuka"
          authorHandle="asuka.eth"
          authorAvatarUrl="https://placewaifu.com/image/103"
          timestamp="8h ago"
          text="Concert was incredible last night"
          media={{ type: 'photo', items: [
            { url: 'https://placewaifu.com/image/400/400' },
            { url: 'https://placewaifu.com/image/401/401' },
          ]}}
          likes={312}
          comments={45}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Sakura"
          authorHandle="sakura.heaven"
          authorAvatarUrl="https://placewaifu.com/image/104"
          timestamp="12h ago"
          text="POV: discovering a new genre"
          media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/270/480', aspect: 'portrait' }}
          likes={5400}
          comments={312}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Misato"
          authorHandle="misato.heaven"
          authorAvatarUrl="https://placewaifu.com/image/105"
          timestamp="1d ago"
          text="Festival photo dump"
          media={{ type: 'photo', items: [
            { url: 'https://placewaifu.com/image/400/400' },
            { url: 'https://placewaifu.com/image/401/401' },
            { url: 'https://placewaifu.com/image/402/402' },
            { url: 'https://placewaifu.com/image/403/403' },
            { url: 'https://placewaifu.com/image/404/404' },
          ]}}
          likes={891}
          comments={67}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Kaworu"
          authorHandle="kaworu.heaven"
          authorAvatarUrl="https://placewaifu.com/image/107"
          timestamp="2d ago"
          text="New music video just dropped"
          media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }}
          likes={1200}
          comments={89}
          onLike={noop}
          onComment={noop}
        />
      </div>
    </div>
    </>
  )
}
