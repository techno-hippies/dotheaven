import type { Component, JSX } from 'solid-js'
import { createSignal, createMemo, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { PostDetailView, type CommentItemProps, ShareViaChatDialog, type ShareRecipient } from '@heaven/ui'
import { post as postRoute } from '@heaven/core'
import { useAuth, useXMTP } from '../providers'
import { fetchPost, fetchPostComments, translatePost, getUserLang, type FeedPostData } from '../lib/heaven/posts'

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

export const PostPage: Component = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
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

  const handleTranslate = async (targetLang: string) => {
    const p = postQuery.data
    const addr = auth.pkpAddress()
    const pkpInfo = auth.pkpInfo()
    if (!p?.text || !addr || !pkpInfo) return

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
      timestamp: timeAgo(p.blockTimestamp),
      text: p.text,
      media: p.photoUrls?.length
        ? { type: 'photo' as const, items: p.photoUrls.map((url) => ({ url })) }
        : undefined,
      likes: p.likeCount,
      comments: p.commentCount,
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
          <p class="text-sm text-[var(--text-primary)]">{c.text}</p>
          <span class="text-xs text-[var(--text-muted)]">{timeAgo(c.blockTimestamp)}</span>
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
            {postQuery.isLoading ? 'Loading...' : 'Post not found'}
          </div>
        }
      >
        {(p) => (
          <PostDetailView
            post={p()}
            comments={commentProps()}
            onBack={() => navigate(-1)}
            onSubmitComment={(text) => console.log('comment:', text)}
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
