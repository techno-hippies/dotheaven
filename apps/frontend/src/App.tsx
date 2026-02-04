import type { Component } from 'solid-js'
import { createSignal, createResource, For, Show } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import { OnboardingFlow } from '@heaven/ui'
import { FeedPost, PostComposer } from '@heaven/ui'
import type { PostProcessingStep, Attribution, PostProvenance } from '@heaven/ui'
import { useAuth } from './providers'
import { checkNameAvailable, registerHeavenName, uploadAvatar, setProfile, setTextRecord, computeNode, getEnsProfile, fetchPosts, timeAgo, getPrimaryName, getTextRecord, resolveAvatarUri, getLinkedEoa } from './lib/heaven'
import { createPost, createTextPost } from './lib/post-service'
import type { OnboardingBasicsData } from '@heaven/ui'

const noop = () => {}

// Type for posts from the API
interface FeedPostData {
  creator: string
  timestamp: number
  text?: string
  imageUrl?: string
  provenance?: {
    postId: string
    ipfsHash?: string
    txHash: string
    chainId: number
    registeredAt: string
  }
}

// Wrapper component that uses TanStack Query for creator resolution
const FeedPostWithCreator: Component<{
  post: FeedPostData
  resolveCreator: (address: string) => Promise<{ name: string; handle: string; avatar?: string }>
  navigate: (path: string) => void
  onPostClick?: (postId: string) => void
}> = (props) => {
  const creatorQuery = createQuery(() => ({
    queryKey: ['creator', props.post.creator.toLowerCase()],
    queryFn: () => props.resolveCreator(props.post.creator),
    staleTime: 5 * 60_000, // 5 minutes
  }))

  const creator = () => {
    if (creatorQuery.data) return creatorQuery.data
    // Fallback while loading
    const short = `${props.post.creator.slice(0, 6)}...${props.post.creator.slice(-4)}`
    return { name: short, handle: short }
  }

  // Route to the displayed identity (handle), not the raw PKP address
  // But if handle is a truncated address (contains "..."), use the full address
  const handleAuthorClick = () => {
    const handle = creator().handle
    // handle can be: "alice.heaven", "bob.eth", or "0x1234...5678" (truncated)
    if (handle.includes('...')) {
      // Truncated address - use full creator address
      props.navigate(`/u/${props.post.creator}`)
    } else {
      props.navigate(`/u/${handle}`)
    }
  }

  // Build provenance for the dialog
  const provenance = (): PostProvenance | undefined => {
    if (!props.post.provenance) return undefined
    return {
      ownership: null, // Not stored on-chain yet
      postId: props.post.provenance.postId,
      ipfsHash: props.post.provenance.ipfsHash,
      txHash: props.post.provenance.txHash,
      chainId: props.post.provenance.chainId,
      registeredAt: props.post.provenance.registeredAt,
    }
  }

  const handlePostClick = () => {
    if (props.post.provenance?.postId) {
      props.onPostClick?.(props.post.provenance.postId)
    }
  }

  return (
    <FeedPost
      authorName={creator().name}
      authorHandle={creator().handle}
      authorAvatarUrl={creator().avatar}
      timestamp={timeAgo(props.post.timestamp)}
      text={props.post.text}
      media={props.post.imageUrl ? { type: 'photo' as const, items: [{ url: props.post.imageUrl }] } : undefined}
      onLike={noop}
      onComment={noop}
      onAuthorClick={handleAuthorClick}
      onPostClick={handlePostClick}
      provenance={provenance()}
    />
  )
}

export const App: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  const handlePostClick = (postId: string) => {
    navigate(`/post/${postId}`)
  }

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

  // ── Feed data (TanStack Query) ──────────────────────────────────────
  const postsQuery = createQuery(() => ({
    queryKey: ['posts', 'feed'],
    queryFn: () => fetchPosts(50),
    staleTime: 60_000,
  }))

  // Accessor for backward compatibility
  const posts = () => postsQuery.data

  // ── Creator resolution helper (async, for use in queries) ──────────
  async function resolveCreatorAsync(address: string): Promise<{ name: string; handle: string; avatar?: string }> {
    const addr = address.toLowerCase() as `0x${string}`
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`

    // Fetch heaven name and linked EOA in parallel
    const [heavenResult, linkedEoa] = await Promise.all([
      getPrimaryName(addr).catch(() => null),
      getLinkedEoa(addr).catch(() => null),
    ])

    // Fetch ENS profile if we have a linked EOA
    const ensProfile = linkedEoa ? await getEnsProfile(linkedEoa).catch(() => null) : null

    // Check user's display identity preference (only if they have both identities)
    let displayPref: 'ens' | 'heaven' = 'ens' // default to ENS when available
    if (heavenResult?.node && ensProfile?.name) {
      const pref = await getTextRecord(heavenResult.node, 'heaven.displayIdentity').catch(() => '')
      displayPref = pref === 'heaven' ? 'heaven' : 'ens'
    }

    // Helper to resolve Heaven avatar (with ENS fallback)
    async function resolveHeavenAvatar(): Promise<string | undefined> {
      if (!heavenResult?.node) return undefined
      try {
        const avatarRecord = await getTextRecord(heavenResult.node, 'avatar')
        if (avatarRecord) {
          const resolved = await resolveAvatarUri(avatarRecord)
          if (resolved) return resolved
        }
      } catch (err) {
        console.warn('[Feed] Heaven avatar resolution failed:', err)
      }
      // Fallback to ENS avatar
      return ensProfile?.avatar ?? undefined
    }

    // Case 1: User has both Heaven name AND ENS - use their preference
    if (heavenResult?.label && ensProfile?.name) {
      if (displayPref === 'heaven') {
        return {
          name: heavenResult.label,
          handle: `${heavenResult.label}.heaven`,
          avatar: await resolveHeavenAvatar(),
        }
      } else {
        // Prefer ENS identity
        return {
          name: ensProfile.name.replace('.eth', ''),
          handle: ensProfile.name,
          avatar: ensProfile.avatar ?? await resolveHeavenAvatar(),
        }
      }
    }

    // Case 2: Only Heaven name (no ENS)
    if (heavenResult?.label) {
      return {
        name: heavenResult.label,
        handle: `${heavenResult.label}.heaven`,
        avatar: await resolveHeavenAvatar(),
      }
    }

    // Case 3: Only ENS (no Heaven name)
    if (ensProfile?.name) {
      return {
        name: ensProfile.name.replace('.eth', ''),
        handle: ensProfile.name,
        avatar: ensProfile.avatar ?? undefined,
      }
    }

    // Case 4: No identity - fallback to short address
    return { name: short, handle: short }
  }

  // ── Own avatar query for PostComposer ──────────────────────────────
  const ownAvatarQuery = createQuery(() => ({
    queryKey: ['creator', auth.pkpInfo()?.ethAddress?.toLowerCase()],
    queryFn: () => resolveCreatorAsync(auth.pkpInfo()!.ethAddress),
    get enabled() { return !!auth.pkpInfo()?.ethAddress },
    staleTime: 5 * 60_000, // 5 minutes
  }))

  const ownAvatar = () => ownAvatarQuery.data?.avatar

  // ── Post composer state ──────────────────────────────────────────────
  const [postImage, setPostImage] = createSignal<File | null>(null)
  const [postImageUrl, setPostImageUrl] = createSignal<string | undefined>()
  const [postProcessing, setPostProcessing] = createSignal(false)
  const [postStep, setPostStep] = createSignal<PostProcessingStep>('safety')
  const [postError, setPostError] = createSignal<string | undefined>()
  const [postSuccess, setPostSuccess] = createSignal(false)
  let fileInputRef: HTMLInputElement | undefined

  function handlePhotoClick() {
    fileInputRef?.click()
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    setPostImage(file)
    setPostImageUrl(URL.createObjectURL(file))
    setPostError(undefined)
    input.value = ''
  }

  function handleImageRemove() {
    const url = postImageUrl()
    if (url) URL.revokeObjectURL(url)
    setPostImage(null)
    setPostImageUrl(undefined)
  }

  async function handlePostSubmit(text: string, attribution?: Attribution) {
    const file = postImage()
    const hasText = text.trim().length > 0

    if (!file && !hasText) return // Need at least text or photo

    setPostProcessing(true)
    setPostError(undefined)

    // Log attribution (will be stored in IPFS metadata + backend later)
    if (attribution) {
      console.log('[Post] Attribution:', {
        ownership: attribution.ownership,
        source: attribution.source,
        hasThirdPartyAudio: attribution.hasThirdPartyAudio,
        audioSource: attribution.audioSource,
      })
    }

    try {
      // Map UI attribution to post-service attribution format
      const postAttribution = attribution?.ownership ? {
        ownership: attribution.ownership,
        sourceUrl: attribution.source?.url,
        sourcePlatform: attribution.source?.platform,
        sourceHandle: attribution.source?.handle,
      } : undefined

      if (file) {
        // Photo post
        setPostStep('safety')
        const result = await createPost(
          {
            imageFile: file,
            title: text.trim() || 'Photo post',
            attribution: postAttribution,
            onStep: (step) => setPostStep(step as PostProcessingStep),
          },
          () => auth.getAuthContext(),
          () => auth.pkpInfo()?.publicKey ?? null,
        )
        console.log('[Post] Photo created:', result)
        handleImageRemove()
      } else {
        // Text-only post
        setPostStep('uploading')
        const result = await createTextPost(
          {
            text: text.trim(),
            onStep: (step) => setPostStep(step as PostProcessingStep),
          },
          () => auth.getAuthContext(),
          () => auth.pkpInfo()?.publicKey ?? null,
        )
        console.log('[Post] Text created:', result)
      }

      setPostProcessing(false)
      setPostSuccess(true)
      // Refresh feed after a short delay (give subgraph time to index)
      setTimeout(() => { postsQuery.refetch() }, 3000)
      setTimeout(() => setPostSuccess(false), 2500)
    } catch (err) {
      console.error('[Post] Failed:', err)
      setPostProcessing(false)
      setPostError(err instanceof Error ? err.message : 'Post failed')
    }
  }

  function handlePostRetry() {
    setPostError(undefined)
  }

  return (
    <>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      onChange={handleFileSelect}
    />
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
          avatarUrl={ownAvatar()}
          imagePreviewUrl={postImageUrl()}
          onImageRemove={handleImageRemove}
          onPhotoClick={handlePhotoClick}
          onSubmit={handlePostSubmit}
          processing={postProcessing()}
          processingStep={postStep()}
          processingError={postError()}
          onRetry={handlePostRetry}
          success={postSuccess()}
        />
      </div>
      <div class="divide-y divide-[var(--bg-highlight)]">
        <Show when={postsQuery.isLoading}>
          <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
            Loading posts...
          </div>
        </Show>
        <Show when={postsQuery.isError}>
          <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
            Failed to load posts
          </div>
        </Show>
        <Show when={!postsQuery.isLoading && !postsQuery.isError && posts()?.length === 0}>
          <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
            No posts yet. Be the first to post!
          </div>
        </Show>
        <For each={posts()}>
          {(post) => (
            <FeedPostWithCreator
              post={post}
              resolveCreator={resolveCreatorAsync}
              navigate={navigate}
              onPostClick={handlePostClick}
            />
          )}
        </For>
      </div>
    </div>
    </>
  )
}
