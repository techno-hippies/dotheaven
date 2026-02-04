/**
 * PostPage - Full page view for a single post
 *
 * Used on mobile where we navigate to /post/:id instead of opening a dialog.
 * Fetches post data and comments, displays full uncropped image and comment thread.
 */

import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { PostViewer } from '@heaven/ui'
import { getPrimaryName, getTextRecord, resolveAvatarUri, getLinkedEoa, getEnsProfile } from '../lib/heaven'

// ── Types ──────────────────────────────────────────────────────────────

interface PostData {
  id: string
  creator: string
  contentType: number
  isAdult: boolean
  timestamp: number
  title: string
  text: string
  imageUrl?: string
  provenance: {
    postId: string
    ipfsHash?: string
    txHash: string
    chainId: number
    registeredAt: string
  }
}

// ── Subgraph fetch ─────────────────────────────────────────────────────

const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/6.0.0/gn'

const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

interface PostGQL {
  id: string
  creator: string
  contentType: number
  metadataUri: string
  isAdult: boolean
  blockTimestamp: string
  transactionHash: string
}

interface IPAMetadata {
  title?: string
  description?: string
  mediaUrl?: string
  text?: string
}

async function fetchPost(postId: string): Promise<PostData | null> {
  const query = `{
    post(id: "${postId}") {
      id
      creator
      contentType
      metadataUri
      isAdult
      blockTimestamp
      transactionHash
    }
  }`

  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) throw new Error(`Subgraph error: ${res.status}`)
  const json = await res.json()
  const post: PostGQL | null = json.data?.post

  if (!post) return null

  // Fetch metadata
  let meta: IPAMetadata | null = null
  try {
    const metaUrl = post.metadataUri.startsWith('ipfs://')
      ? `${IPFS_GATEWAY}/${post.metadataUri.slice(7)}`
      : post.metadataUri
    const metaRes = await fetch(metaUrl)
    if (metaRes.ok) {
      meta = await metaRes.json()
    }
  } catch {
    // Metadata fetch failed, use fallback
  }

  const extractIpfsCid = (uri: string): string | undefined => {
    if (uri.startsWith('ipfs://')) return uri.slice(7)
    const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/)
    return match?.[1]
  }

  return {
    id: post.id,
    creator: post.creator,
    contentType: post.contentType,
    isAdult: post.isAdult,
    timestamp: Number(post.blockTimestamp),
    title: meta?.title || '',
    text: post.contentType === 1 ? (meta?.title || meta?.description || '') : (meta?.description || meta?.title || ''),
    imageUrl: meta?.mediaUrl,
    provenance: {
      postId: post.id,
      ipfsHash: extractIpfsCid(post.metadataUri),
      txHash: post.transactionHash,
      chainId: 6343,
      registeredAt: new Date(Number(post.blockTimestamp) * 1000).toISOString(),
    },
  }
}

// ── Creator resolution ─────────────────────────────────────────────────

async function resolveCreator(address: string): Promise<{ name: string; handle: string; avatar?: string }> {
  const addr = address.toLowerCase() as `0x${string}`
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`

  const [heavenResult, linkedEoa] = await Promise.all([
    getPrimaryName(addr).catch(() => null),
    getLinkedEoa(addr).catch(() => null),
  ])

  const ensProfile = linkedEoa ? await getEnsProfile(linkedEoa).catch(() => null) : null

  // Heaven avatar
  let avatar: string | undefined
  if (heavenResult?.node) {
    try {
      const avatarRecord = await getTextRecord(heavenResult.node, 'avatar')
      if (avatarRecord) {
        avatar = await resolveAvatarUri(avatarRecord) || undefined
      }
    } catch {}
  }
  if (!avatar && ensProfile?.avatar) {
    avatar = ensProfile.avatar
  }

  if (heavenResult?.label) {
    return { name: heavenResult.label, handle: `${heavenResult.label}.heaven`, avatar }
  }
  if (ensProfile?.name) {
    return { name: ensProfile.name.replace('.eth', ''), handle: ensProfile.name, avatar }
  }

  return { name: short, handle: short, avatar }
}

// ── Component ──────────────────────────────────────────────────────────

export const PostPage: Component = () => {
  const params = useParams()
  const navigate = useNavigate()

  const postQuery = createQuery(() => ({
    queryKey: ['post', params.id],
    queryFn: () => fetchPost(params.id!),
    enabled: !!params.id,
  }))

  const creatorQuery = createQuery(() => ({
    queryKey: ['creator', postQuery.data?.creator?.toLowerCase()],
    queryFn: () => resolveCreator(postQuery.data!.creator),
    enabled: !!postQuery.data?.creator,
    staleTime: 5 * 60_000,
  }))

  const handleBack = () => {
    // Go back if there's history, otherwise go home
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  const handleAuthorClick = () => {
    const creator = creatorQuery.data
    if (!creator) return
    if (creator.handle.includes('...')) {
      navigate(`/u/${postQuery.data?.creator}`)
    } else {
      navigate(`/u/${creator.handle}`)
    }
  }

  const formatFullTimestamp = (unixSeconds: number) => {
    return new Date(unixSeconds * 1000).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <Show
      when={!postQuery.isLoading}
      fallback={
        <div class="h-full flex items-center justify-center bg-[var(--bg-page)]">
          <div class="text-[var(--text-muted)]">Loading post...</div>
        </div>
      }
    >
      <Show
        when={postQuery.data}
        fallback={
          <div class="h-full flex flex-col items-center justify-center bg-[var(--bg-page)] gap-4">
            <div class="text-[var(--text-primary)] text-lg font-semibold">Post not found</div>
            <button
              onClick={handleBack}
              class="text-[var(--accent-blue)] hover:underline"
            >
              Go back
            </button>
          </div>
        }
      >
        {(post) => (
          <PostViewer
            mode="page"
            postId={post().id}
            authorName={creatorQuery.data?.name || `${post().creator.slice(0, 6)}...${post().creator.slice(-4)}`}
            authorHandle={creatorQuery.data?.handle}
            authorAvatarUrl={creatorQuery.data?.avatar}
            timestamp={formatFullTimestamp(post().timestamp)}
            fullTimestamp={formatFullTimestamp(post().timestamp)}
            text={post().text}
            imageUrl={post().imageUrl}
            likes={0}
            comments={0}
            commentList={[]}
            onBack={handleBack}
            onAuthorClick={handleAuthorClick}
            provenance={{
              ownership: null,
              postId: post().provenance.postId,
              ipfsHash: post().provenance.ipfsHash,
              txHash: post().provenance.txHash,
              chainId: post().provenance.chainId,
              registeredAt: post().provenance.registeredAt,
            }}
          />
        )}
      </Show>
    </Show>
  )
}
