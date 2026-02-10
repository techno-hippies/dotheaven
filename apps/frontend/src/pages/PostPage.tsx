import type { Component, JSX } from 'solid-js'
import { createSignal, createMemo, createEffect, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { PostDetailView, type CommentItemProps, ShareViaChatDialog, type ShareRecipient } from '@heaven/ui'
import { post as postRoute } from '@heaven/core'
import { useAuth, useXMTP } from '../providers'
import { useI18n } from '@heaven/i18n/solid'
import type { TranslationKey } from '@heaven/i18n'
import { fetchPost, fetchPostComments, translatePost, likePost, commentPost, flagPost, getUserLang, getHasLiked, type FeedPostData } from '../lib/heaven/posts'
import { openAuthDialog } from '../lib/auth-dialog'

function timeAgo(ts: number, t: (key: TranslationKey, ...args: any[]) => string): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) })
  if (diff < 604800) return t('time.daysAgo', { count: Math.floor(diff / 86400) })
  return new Date(ts * 1000).toLocaleDateString()
}

export const PostPage: Component = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const { t } = useI18n()
  const xmtp = useXMTP()
  const [isTranslating, setIsTranslating] = createSignal(false)
  const [shareDialogOpen, setShareDialogOpen] = createSignal(false)
  const [isSending, setIsSending] = createSignal(false)

  const userLang = getUserLang()

  const postQuery = createQuery(() => ({
    queryKey: ['post', params.id],
    queryFn: () => fetchPost(params.id),
    enabled: !!params.id,
    staleTime: 30_000,
  }))

  const commentsQuery = createQuery(() => ({
    queryKey: ['post-comments', params.id],
    queryFn: () => fetchPostComments(params.id),
    enabled: !!params.id,
    staleTime: 30_000,
  }))

  /** Wraps a callback so it opens the auth dialog if not logged in */
  const authGuard = (fn: () => void) => () => {
    if (!auth.isAuthenticated()) {
      openAuthDialog()
      return
    }
    fn()
  }

  const [isLiked, setIsLiked] = createSignal<boolean | undefined>(undefined)

  // Fetch liked state when post loads + user is authenticated
  createEffect(() => {
    const addr = auth.pkpAddress()
    const p = postQuery.data
    if (!addr || !p) return
    getHasLiked(addr as `0x${string}`, p.postId as `0x${string}`)
      .then(setIsLiked)
      .catch(() => {})
  })

  const handleLike = async () => {
    const p = postQuery.data
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!p || !addr || !pkpInfo) return

    const currentlyLiked = isLiked() ?? false
    const action = currentlyLiked ? 'unlike' : 'like'

    // Optimistic update
    setIsLiked(!currentlyLiked)
    queryClient.setQueryData<FeedPostData>(['post', params.id], (old) => {
      if (!old) return old
      return { ...old, likeCount: old.likeCount + (currentlyLiked ? -1 : 1) }
    })

    try {
      const authContext = await auth.getAuthContext()
      await likePost(p.postId, action, (msg) => auth.signMessage(msg), authContext, pkpInfo.publicKey)
    } catch (err) {
      // Revert on failure
      console.error('Like failed:', err)
      setIsLiked(currentlyLiked)
      queryClient.setQueryData<FeedPostData>(['post', params.id], (old) => {
        if (!old) return old
        return { ...old, likeCount: old.likeCount + (currentlyLiked ? 1 : -1) }
      })
    }
  }

  const handleSubmitComment = async (text: string) => {
    const p = postQuery.data
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!p || !addr || !pkpInfo) {
      openAuthDialog()
      return
    }

    try {
      const authContext = await auth.getAuthContext()
      const result = await commentPost(p.postId, text, (msg) => auth.signMessage(msg), authContext, pkpInfo.publicKey)
      if (result.success) {
        // Refresh comments after successful submission
        queryClient.invalidateQueries({ queryKey: ['post-comments', params.id] })
        queryClient.setQueryData<FeedPostData>(['post', params.id], (old) => {
          if (!old) return old
          return { ...old, commentCount: old.commentCount + 1 }
        })
      }
    } catch (err) {
      console.error('Comment failed:', err)
    }
  }

  const handleReport = async () => {
    const p = postQuery.data
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!p || !addr || !pkpInfo) return

    try {
      const authContext = await auth.getAuthContext()
      await flagPost(p.postId, 0, (msg) => auth.signMessage(msg), authContext, pkpInfo.publicKey)
    } catch (err) {
      console.error('Report failed:', err)
    }
  }

  const handleTranslate = async (targetLang: string) => {
    const p = postQuery.data
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!p?.text || !addr || !pkpInfo) {
      openAuthDialog()
      return
    }

    setIsTranslating(true)
    try {
      const authContext = await auth.getAuthContext()
      const result = await translatePost(
        p.postId,
        p.text,
        targetLang,
        (msg) => auth.signMessage(msg),
        authContext,
        pkpInfo.publicKey,
      )
      if (result.success && result.translatedText) {
        // Optimistically update cache
        queryClient.setQueryData<FeedPostData>(['post', params.id], (old) => {
          if (!old) return old
          return {
            ...old,
            translations: { ...old.translations, [targetLang]: result.translatedText! },
          }
        })
      }
    } catch (err) {
      console.error('Translation failed:', err)
    } finally {
      setIsTranslating(false)
    }
  }

  const shareRecipients = createMemo<ShareRecipient[]>(() =>
    xmtp.conversations().map((c) => ({
      id: c.peerAddress,
      name: c.name,
      handle: `${c.peerAddress.slice(0, 6)}...${c.peerAddress.slice(-4)}`,
    }))
  )

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${postRoute(params.id)}`
    navigator.clipboard.writeText(url)
  }

  const handleShareSend = async (recipientIds: string[]) => {
    setIsSending(true)
    try {
      const url = `${window.location.origin}${window.location.pathname}#${postRoute(params.id)}`
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

  const postProps = () => {
    const p = postQuery.data
    if (!p) return null
    return {
      authorName: p.authorName,
      authorHandle: p.authorHandle,
      authorAvatarUrl: p.authorAvatarUrl,
      timestamp: timeAgo(p.blockTimestamp, t),
      text: p.text,
      media: p.photoUrls?.length
        ? { type: 'photo' as const, items: p.photoUrls.map((url) => ({ url })) }
        : undefined,
      likes: p.likeCount,
      comments: p.commentCount,
      isLiked: isLiked(),
      onLike: authGuard(handleLike),
      onComment: authGuard(() => { /* comment input is below the post */ }),
      onRepost: authGuard(() => { /* TODO: wire to repost */ }),
      onQuote: authGuard(() => { /* TODO: wire to quote compose */ }),
      onReportPost: authGuard(handleReport),
      translations: p.translations,
      userLang,
      postLang: p.language,
      onTranslate: p.text ? handleTranslate : undefined,
      isTranslating: isTranslating(),
      onCopyLink: handleCopyLink,
      onSendViaChat: () => setShareDialogOpen(true),
      provenance: {
        postId: p.postId,
        txHash: p.transactionHash,
        ipfsHash: p.ipfsHash ?? undefined,
        chainId: 6343,
      },
    }
  }

  const commentProps = (): CommentItemProps[] => {
    const comments = commentsQuery.data ?? []
    return comments.map((c) => ({
      authorName: `${c.author.slice(0, 8)}...`,
      children: (
        <div>
          <p class="text-base text-[var(--text-primary)]">{c.text}</p>
          <span class="text-xs text-[var(--text-muted)]">{timeAgo(c.blockTimestamp, t)}</span>
        </div>
      ) as JSX.Element,
    }))
  }

  return (
    <>
      <Show
        when={postProps()}
        fallback={
          <div class="flex items-center justify-center h-full text-[var(--text-muted)]">
            {postQuery.isLoading ? t('common.loading') : t('feed.postNotFound')}
          </div>
        }
      >
        {(p) => (
          <PostDetailView
            post={p()}
            comments={commentProps()}
            onBack={() => navigate(-1)}
            onSubmitComment={handleSubmitComment}
          />
        )}
      </Show>

      <ShareViaChatDialog
        open={shareDialogOpen()}
        onOpenChange={setShareDialogOpen}
        recipients={shareRecipients()}
        onSend={handleShareSend}
        isSending={isSending()}
      />
    </>
  )
}
