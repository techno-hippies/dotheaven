import type { Component } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import { FeedPost, PostComposer } from '@heaven/ui'
import type { PostProcessingStep, Attribution, PostProvenance } from '@heaven/ui'
import { useAuth } from './providers'
import { fetchPosts, timeAgo, getPrimaryName, getTextRecord, resolveAvatarUri, getLinkedEoa, getEnsProfile } from './lib/heaven'
import { createPost, createTextPost } from './lib/post-service'

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
