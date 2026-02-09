import type { Component } from 'solid-js'
import { createSignal, createMemo, createEffect, For, Show } from 'solid-js'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { FeedPost, type FeedPostProps, type FeedPostMedia, Avatar, ComposeBox, ComposeFab, ComposeDrawer, useIsMobile, type ProfileInput, ShareViaChatDialog, type ShareRecipient, LiveRoomsRow, type LiveRoom } from '@heaven/ui'
import { useNavigate } from '@solidjs/router'
import { post, room } from '@heaven/core'
import { useAuth, useXMTP } from '../providers'
import { openUserMenu } from '../lib/user-menu'
import { fetchFeedPosts, translatePost, getUserLang, type FeedPostData } from '../lib/heaven/posts'
import { useActiveRooms } from '../lib/voice/useActiveRooms'

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

function postDataToProps(
  p: FeedPostData,
  userLang: string,
  onTranslate: (postId: string, text: string, targetLang: string) => void,
  translatingPostId: string | null,
): FeedPostProps {
  const media: FeedPostMedia | undefined = p.photoUrls?.length
    ? { type: 'photo', items: p.photoUrls.map((url) => ({ url })) }
    : undefined

  return {
    authorName: p.authorName,
    authorHandle: p.authorHandle,
    authorAvatarUrl: p.authorAvatarUrl,
    timestamp: timeAgo(p.blockTimestamp),
    text: p.text,
    media,
    likes: p.likeCount,
    comments: p.commentCount,
    translations: p.translations,
    userLang,
    postLang: p.language,
    onTranslate: p.text ? (targetLang: string) => onTranslate(p.postId, p.text!, targetLang) : undefined,
    isTranslating: translatingPostId === p.postId,
    provenance: {
      postId: p.postId,
      txHash: p.transactionHash,
      ipfsHash: p.ipfsHash ?? undefined,
      chainId: 6343,
    },
  }
}

export const FeedPage: Component = () => {
  const isMobile = useIsMobile()
  const auth = useAuth()
  const xmtp = useXMTP()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [composeOpen, setComposeOpen] = createSignal(false)
  const [translatingPostId, setTranslatingPostId] = createSignal<string | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = createSignal(false)
  const [sharePostId, setSharePostId] = createSignal<string | null>(null)
  const [isSending, setIsSending] = createSignal(false)

  const userLang = getUserLang()

  // Active voice rooms
  const activeRooms = useActiveRooms()
  const liveRooms = createMemo<LiveRoom[]>(() =>
    activeRooms.rooms().map((r) => ({
      id: r.room_id,
      hostName: `${r.host_wallet.slice(0, 6)}...${r.host_wallet.slice(-4)}`,
      participantCount: r.participant_count,
    }))
  )
  const showLiveRoomsLoading = createMemo(
    () => activeRooms.isLoading() && liveRooms().length === 0,
  )
  const showLiveRoomsError = createMemo(
    () => !activeRooms.isLoading() && !!activeRooms.error() && liveRooms().length === 0,
  )

  createEffect(() => {
    const err = activeRooms.error()
    if (import.meta.env.DEV && err) {
      console.warn('[Feed] Failed to load active rooms:', err)
    }
  })

  // Fetch posts from subgraph
  const postsQuery = createQuery(() => ({
    queryKey: ['feed-posts'],
    queryFn: () => fetchFeedPosts({ first: 50 }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  }))

  // Derive avatar URL from cached profile query (same pattern as AppLayout)
  const cachedAvatarUrl = createMemo(() => {
    const addr = auth.pkpAddress()
    if (!addr) return undefined
    const queries = queryClient.getQueriesData<ProfileInput>({ queryKey: ['profile', addr] })
    for (const [, data] of queries) {
      if (data?.avatar) return data.avatar
    }
    return undefined
  })

  const handlePost = (text: string, media?: File[]) => {
    console.log('Post:', text, media?.length ? `(${media.length} files)` : '')
    // TODO: wire to Lit Action post pipeline
  }

  const handleTranslate = async (postId: string, text: string, targetLang: string) => {
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!addr || !pkpInfo) return

    setTranslatingPostId(postId)
    try {
      const authContext = await auth.getAuthContext()
      const result = await translatePost(
        postId,
        text,
        targetLang,
        (msg) => auth.signMessage(msg),
        authContext,
        pkpInfo.publicKey,
      )
      if (result.success && result.translatedText) {
        // Optimistically update the cache with the new translation
        queryClient.setQueryData<FeedPostData[]>(['feed-posts'], (old) => {
          if (!old) return old
          return old.map((p) => {
            if (p.postId !== postId) return p
            return {
              ...p,
              translations: { ...p.translations, [targetLang]: result.translatedText! },
            }
          })
        })
      }
    } catch (err) {
      console.error('Translation failed:', err)
    } finally {
      setTranslatingPostId(null)
    }
  }

  // Map XMTP conversations to share recipients
  const shareRecipients = createMemo<ShareRecipient[]>(() =>
    xmtp.conversations().map((c) => ({
      id: c.peerAddress,
      name: c.name,
      handle: `${c.peerAddress.slice(0, 6)}...${c.peerAddress.slice(-4)}`,
    }))
  )

  const handleCopyLink = (postId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${post(postId)}`
    navigator.clipboard.writeText(url)
  }

  const handleOpenShareDialog = (postId: string) => {
    setSharePostId(postId)
    setShareDialogOpen(true)
  }

  const handleShareSend = async (recipientIds: string[]) => {
    const postId = sharePostId()
    if (!postId) return

    setIsSending(true)
    try {
      const url = `${window.location.origin}${window.location.pathname}#${post(postId)}`
      for (const peerAddress of recipientIds) {
        await xmtp.sendMessage(peerAddress, url)
      }
      setShareDialogOpen(false)
    } catch (err) {
      console.error('Failed to share via chat:', err)
    } finally {
      setIsSending(false)
    }
  }

  const posts = () => postsQuery.data ?? []

  return (
    <div class="h-full overflow-y-auto">
      <header>
        {/* Mobile: avatar (left) + logo (center) row */}
        <Show when={isMobile()}>
          <div class="relative flex items-center justify-center h-14">
            <Show when={auth.isAuthenticated()}>
              <button
                type="button"
                class="absolute left-4 cursor-pointer"
                onClick={openUserMenu}
              >
                <Avatar src={cachedAvatarUrl()} fallback="U" size="sm" />
              </button>
            </Show>
            <img
              src={`${import.meta.env.BASE_URL}images/heaven-white-sm.png`}
              alt="Heaven"
              class="h-7"
            />
          </div>
        </Show>
      </header>

      {/* Live rooms row */}
      <Show when={showLiveRoomsLoading()}>
        <div class="px-5 py-2 text-sm text-[var(--text-muted)]">
          Loading live rooms...
        </div>
      </Show>
      <Show when={showLiveRoomsError()}>
        <div class="px-5 py-2 text-sm text-[var(--text-muted)]">
          Live rooms are temporarily unavailable.
        </div>
      </Show>
      <LiveRoomsRow
        rooms={liveRooms()}
        onRoomClick={(roomId) => navigate(room(roomId))}
        onCreateRoom={() => navigate(room('new'))}
        createAvatarUrl={cachedAvatarUrl()}
      />

      {/* Desktop: inline compose box at top */}
      <Show when={!isMobile()}>
        <ComposeBox avatarUrl={cachedAvatarUrl()} onPost={handlePost} />
      </Show>

      <Show
        when={!postsQuery.isLoading}
        fallback={
          <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
            Loading posts...
          </div>
        }
      >
        <Show
          when={posts().length > 0}
          fallback={
            <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
              No posts yet. Be the first to post!
            </div>
          }
        >
          <div class="divide-y divide-[var(--border-subtle)]">
            <For each={posts()}>
              {(p) => (
                <FeedPost
                  {...postDataToProps(p, userLang, handleTranslate, translatingPostId())}
                  onPostClick={() => navigate(post(p.postId))}
                  onCopyLink={() => handleCopyLink(p.postId)}
                  onSendViaChat={() => handleOpenShareDialog(p.postId)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Mobile: FAB + compose drawer */}
      <Show when={isMobile()}>
        <ComposeFab onClick={() => setComposeOpen(true)} />
        <ComposeDrawer
          open={composeOpen()}
          onOpenChange={setComposeOpen}
          avatarUrl={cachedAvatarUrl()}
          onPost={handlePost}
        />
      </Show>

      {/* Share via chat dialog */}
      <ShareViaChatDialog
        open={shareDialogOpen()}
        onOpenChange={setShareDialogOpen}
        recipients={shareRecipients()}
        onSend={handleShareSend}
        isSending={isSending()}
      />
    </div>
  )
}
