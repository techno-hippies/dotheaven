import type { Component } from 'solid-js'
import { createSignal, createMemo, createEffect, For, Show } from 'solid-js'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { FeedPost, type FeedPostProps, type FeedPostMedia, Avatar, ComposeBox, ComposeFab, ComposeDrawer, useIsMobile, type ProfileInput, ShareViaChatDialog, type ShareRecipient, LiveRoomsRow, type LiveRoom, CreateRoomModal, type CreateRoomOptions } from '@heaven/ui'
import { useNavigate } from '@solidjs/router'
import { post, room } from '@heaven/core'
import { useI18n } from '@heaven/i18n/solid'
import type { TranslationKey } from '@heaven/i18n'
import { useAuth, useXMTP } from '../providers'
import { openUserMenu } from '../lib/user-menu'
import { fetchFeedPosts, translatePost, likePost, flagPost, getUserLang, batchGetLikedStates, type FeedPostData } from '../lib/heaven/posts'
import { getPrimaryNamesBatch, getTextRecordsBatch } from '../lib/heaven/registry'
import { resolveAvatarUri } from '../lib/heaven/avatar-resolver'
import { openAuthDialog } from '../lib/auth-dialog'
import { useActiveRooms } from '../lib/voice/useActiveRooms'

function timeAgo(ts: number, t: <K extends TranslationKey>(key: K, ...args: any[]) => string): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) })
  if (diff < 604800) return t('time.daysAgo', { count: Math.floor(diff / 86400) })
  return new Date(ts * 1000).toLocaleDateString()
}

function postDataToProps(
  p: FeedPostData,
  userLang: string,
  onTranslate: (postId: string, text: string, targetLang: string) => void,
  translatingPostId: string | null,
  authGuard: (fn: () => void) => () => void,
  t: <K extends TranslationKey>(key: K, ...args: any[]) => string,
  opts: {
    isLiked?: boolean
    onLike: (postId: string) => void
    onComment: (postId: string) => void
    onReportPost: (postId: string) => void
  },
): FeedPostProps {
  const media: FeedPostMedia | undefined = p.photoUrls?.length
    ? { type: 'photo', items: p.photoUrls.map((url) => ({ url })) }
    : undefined

  return {
    authorName: p.authorName,
    authorHandle: p.authorHandle,
    authorAvatarUrl: p.authorAvatarUrl,
    timestamp: timeAgo(p.blockTimestamp, t),
    text: p.text,
    media,
    likes: p.likeCount,
    comments: p.commentCount,
    isLiked: opts.isLiked,
    onLike: authGuard(() => opts.onLike(p.postId)),
    onComment: authGuard(() => opts.onComment(p.postId)),
    onRepost: authGuard(() => { /* TODO: wire to repost */ }),
    onQuote: authGuard(() => { /* TODO: wire to quote compose */ }),
    onReportPost: authGuard(() => opts.onReportPost(p.postId)),
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
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const auth = useAuth()
  const xmtp = useXMTP()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [composeOpen, setComposeOpen] = createSignal(false)
  const [createRoomOpen, setCreateRoomOpen] = createSignal(false)
  const [translatingPostId, setTranslatingPostId] = createSignal<string | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = createSignal(false)
  const [sharePostId, setSharePostId] = createSignal<string | null>(null)
  const [isSending, setIsSending] = createSignal(false)

  const userLang = getUserLang()

  // Active voice rooms
  const activeRooms = useActiveRooms()

  // Resolve heaven names + avatars for room hosts
  const hostWallets = createMemo(() => {
    const wallets = activeRooms.rooms().map((r) => r.host_wallet as `0x${string}`)
    return [...new Set(wallets)]
  })

  const [hostInfo, setHostInfo] = createSignal<Map<string, { name: string; avatar?: string }>>(new Map())

  createEffect(() => {
    const wallets = hostWallets()
    if (wallets.length === 0) return

    getPrimaryNamesBatch(wallets).then(async (names) => {
      const info = new Map<string, { name: string; avatar?: string }>()

      // Fetch avatars for hosts that have heaven names
      const avatarRequests = names
        .filter((n) => n.node)
        .map((n) => ({ node: n.node!, key: 'avatar' }))

      const avatarResults = avatarRequests.length > 0
        ? await getTextRecordsBatch(avatarRequests).catch(() => [] as { node: string; key: string; value: string }[])
        : []

      const avatarByNode = new Map(avatarResults.map((r) => [r.node, r.value]))

      for (const n of names) {
        const truncated = `${n.address.slice(0, 6)}...${n.address.slice(-4)}`
        const label = n.label || truncated
        const rawAvatar = n.node ? avatarByNode.get(n.node) : undefined
        const avatar = rawAvatar ? await resolveAvatarUri(rawAvatar).catch(() => undefined) : undefined
        info.set(n.address.toLowerCase(), { name: label, avatar: avatar ?? undefined })
      }

      setHostInfo(info)
    }).catch((err) => {
      if (import.meta.env.DEV) console.warn('[Feed] Failed to resolve room hosts:', err)
    })
  })

  const liveRooms = createMemo<LiveRoom[]>(() => {
    const info = hostInfo()
    return activeRooms.rooms().map((r) => {
      const host = info.get(r.host_wallet.toLowerCase())
      return {
        id: r.room_id,
        hostName: host?.name ?? `${r.host_wallet.slice(0, 6)}...${r.host_wallet.slice(-4)}`,
        hostAvatarUrl: host?.avatar,
        participantCount: r.participant_count,
      }
    })
  })

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

  /** Wraps a callback so it opens the auth dialog if not logged in */
  const authGuard = (fn: () => void) => () => {
    if (!auth.isAuthenticated()) {
      openAuthDialog()
      return
    }
    fn()
  }

  const handlePost = (text: string, media?: File[]) => {
    console.log('Post:', text, media?.length ? `(${media.length} files)` : '')
    // TODO: wire to Lit Action post pipeline
  }

  const handleTranslate = async (postId: string, text: string, targetLang: string) => {
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!addr || !pkpInfo) {
      openAuthDialog()
      return
    }

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

  // ── Liked states ─────────────────────────────────────────────────
  const [likedStates, setLikedStates] = createSignal<Map<string, boolean>>(new Map())

  // Fetch liked states when posts load + user is authenticated
  createEffect(() => {
    const addr = auth.pkpAddress()
    const feedPosts = posts()
    if (!addr || feedPosts.length === 0) return
    const postIds = feedPosts.map((p) => p.postId as `0x${string}`)
    batchGetLikedStates(addr as `0x${string}`, postIds)
      .then(setLikedStates)
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('[Feed] Failed to fetch liked states:', err)
      })
  })

  const handleLike = async (postId: string) => {
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!addr || !pkpInfo) return

    const currentlyLiked = likedStates().get(postId) ?? false
    const action = currentlyLiked ? 'unlike' : 'like'

    // Optimistic update
    setLikedStates((prev) => {
      const next = new Map(prev)
      next.set(postId, !currentlyLiked)
      return next
    })
    queryClient.setQueryData<FeedPostData[]>(['feed-posts'], (old) => {
      if (!old) return old
      return old.map((p) => {
        if (p.postId !== postId) return p
        return { ...p, likeCount: p.likeCount + (currentlyLiked ? -1 : 1) }
      })
    })

    try {
      const authContext = await auth.getAuthContext()
      await likePost(postId, action, (msg) => auth.signMessage(msg), authContext, pkpInfo.publicKey)
    } catch (err) {
      // Revert optimistic update on failure
      console.error('Like failed:', err)
      setLikedStates((prev) => {
        const next = new Map(prev)
        next.set(postId, currentlyLiked)
        return next
      })
      queryClient.setQueryData<FeedPostData[]>(['feed-posts'], (old) => {
        if (!old) return old
        return old.map((p) => {
          if (p.postId !== postId) return p
          return { ...p, likeCount: p.likeCount + (currentlyLiked ? 1 : -1) }
        })
      })
    }
  }

  const handleComment = async (postId: string) => {
    // Navigate to the post detail page where the comment input is
    navigate(post(postId))
  }

  const handleReport = async (postId: string) => {
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!addr || !pkpInfo) return

    try {
      const authContext = await auth.getAuthContext()
      await flagPost(postId, 0, (msg) => auth.signMessage(msg), authContext, pkpInfo.publicKey)
    } catch (err) {
      console.error('Report failed:', err)
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

  const cardClass = () => !isMobile() ? 'bg-[var(--bg-surface)] rounded-xl' : ''

  return (
    <div class="h-full overflow-y-auto">
      {/* Mobile: avatar row */}
      <Show when={isMobile()}>
        <header>
          <div class="flex items-center h-14 px-4 mt-1">
            <button
              type="button"
              class="cursor-pointer"
              onClick={auth.isAuthenticated() ? openUserMenu : () => openAuthDialog()}
            >
              <Avatar src={auth.isAuthenticated() ? cachedAvatarUrl() : undefined} fallback="U" size="md" />
            </button>
          </div>
        </header>
      </Show>

      {/* Feed content — centered card column on desktop, full-bleed on mobile */}
      <div class={!isMobile() ? 'py-4 px-4 flex flex-col gap-3 max-w-[680px] mx-auto w-full' : ''}>
        {/* Live rooms row */}
        <div class={cardClass()}>
          <LiveRoomsRow
            rooms={liveRooms()}
            onRoomClick={(roomId) => navigate(room(roomId))}
            onCreateRoom={() => setCreateRoomOpen(true)}
            createAvatarUrl={cachedAvatarUrl()}
            createRoomLabel={t('room.yourRoom')}
          />
        </div>

        {/* Desktop: inline compose box at top */}
        <Show when={!isMobile()}>
          <div class={cardClass()}>
            <ComposeBox
              avatarUrl={cachedAvatarUrl()}
              onPost={handlePost}
              placeholder={t('feed.compose')}
              postLabel={t('common.post')}
              publishNewSongLabel={t('feed.publishNewSong')}
            />
          </div>
        </Show>

        <Show
          when={!postsQuery.isLoading}
          fallback={
            <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
              {t('feed.loadingPosts')}
            </div>
          }
        >
          <Show
            when={posts().length > 0}
            fallback={
              <div class="flex items-center justify-center py-12 text-[var(--text-muted)]">
                {t('feed.noPosts')}
              </div>
            }
          >
            <Show
              when={!isMobile()}
              fallback={
                <div class="divide-y divide-[var(--border-subtle)]">
                  <For each={posts()}>
                    {(p) => (
                      <FeedPost
                        {...postDataToProps(p, userLang, handleTranslate, translatingPostId(), authGuard, t, {
                        isLiked: likedStates().get(p.postId),
                        onLike: handleLike,
                        onComment: handleComment,
                        onReportPost: handleReport,
                      })}
                        onPostClick={() => navigate(post(p.postId))}
                        onCopyLink={() => handleCopyLink(p.postId)}
                        onSendViaChat={() => handleOpenShareDialog(p.postId)}
                      />
                    )}
                  </For>
                </div>
              }
            >
              <For each={posts()}>
                {(p) => (
                  <div class="bg-[var(--bg-surface)] rounded-xl">
                    <FeedPost
                      {...postDataToProps(p, userLang, handleTranslate, translatingPostId(), authGuard, t, {
                        isLiked: likedStates().get(p.postId),
                        onLike: handleLike,
                        onComment: handleComment,
                        onReportPost: handleReport,
                      })}
                      onPostClick={() => navigate(post(p.postId))}
                      onCopyLink={() => handleCopyLink(p.postId)}
                      onSendViaChat={() => handleOpenShareDialog(p.postId)}
                    />
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </div>

      {/* Mobile: FAB + compose drawer */}
      <Show when={isMobile()}>
        <ComposeFab onClick={() => setComposeOpen(true)} />
        <ComposeDrawer
          open={composeOpen()}
          onOpenChange={setComposeOpen}
          avatarUrl={cachedAvatarUrl()}
          onPost={handlePost}
          placeholder={t('feed.compose')}
          postLabel={t('common.post')}
          publishNewSongLabel={t('feed.publishNewSong')}
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

      {/* Create room modal */}
      <CreateRoomModal
        open={createRoomOpen()}
        onOpenChange={setCreateRoomOpen}
        onGoLive={(opts: CreateRoomOptions) => {
          if (!auth.isAuthenticated()) {
            openAuthDialog()
            return
          }
          navigate(room('new') + `?visibility=${opts.visibility}&ai_enabled=${opts.aiEnabled}`)
        }}
        labels={{
          createRoom: t('room.createRoom'),
          visibility: t('room.visibility'),
          open: t('room.open'),
          openDescription: t('room.openDescription'),
          private: t('room.private'),
          privateDescription: t('room.privateDescription'),
          aiAssistant: t('room.aiAssistant'),
          aiDescription: t('room.aiDescription'),
          create: t('common.create'),
        }}
      />
    </div>
  )
}
