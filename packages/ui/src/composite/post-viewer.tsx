import type { Component, JSX } from 'solid-js'
import { Show, For } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'
import { IconButton } from '../primitives/icon-button'
import { EngagementBar } from './engagement-bar'
import { MessageInput } from './message-input'
import type { PostProvenance } from './feed-post'

// ── Icons ──────────────────────────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
  </svg>
)

const XIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </svg>
)

const DotsThreeIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z" />
  </svg>
)

const InfoIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
  </svg>
)


// ── Types ──────────────────────────────────────────────────────────────

export interface PostComment {
  id: string
  authorName: string
  authorHandle?: string
  authorAvatarUrl?: string
  text: string
  timestamp: string
  likes?: number
  isLiked?: boolean
}

export interface PostViewerProps {
  class?: string
  // Post data
  postId: string
  authorName: string
  authorHandle?: string
  authorAvatarUrl?: string
  timestamp: string
  fullTimestamp?: string // Full date/time for detail view
  text?: string
  imageUrl?: string
  imageAlt?: string
  // Engagement
  likes?: number
  comments?: number
  isLiked?: boolean
  onLike?: () => void
  // Comments
  commentList?: PostComment[]
  commentsLoading?: boolean
  onCommentLike?: (commentId: string) => void
  onReply?: (commentId: string) => void
  // Actions
  onBack?: () => void
  onClose?: () => void
  onAuthorClick?: () => void
  onImageClick?: () => void
  onSubmitComment?: (text: string) => void
  // Menu
  menuSlot?: JSX.Element
  // Provenance
  provenance?: PostProvenance
  onProvenanceClick?: () => void
  // Display mode
  mode?: 'page' | 'dialog'
}

// ── Comment Item ───────────────────────────────────────────────────────

const CommentItem: Component<{
  comment: PostComment
  onLike?: () => void
  onReply?: () => void
}> = (props) => (
  <div class="flex gap-3 py-4">
    <Avatar
      src={props.comment.authorAvatarUrl}
      size="sm"
    />
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-base font-semibold text-[var(--text-primary)]">
          {props.comment.authorName}
        </span>
        <Show when={props.comment.authorHandle}>
          <span class="text-base text-[var(--text-muted)]">
            @{props.comment.authorHandle}
          </span>
        </Show>
        <span class="text-base text-[var(--text-muted)]">·</span>
        <span class="text-base text-[var(--text-muted)]">
          {props.comment.timestamp}
        </span>
      </div>
      <p class="text-base text-[var(--text-primary)] whitespace-pre-wrap mb-2">
        {props.comment.text}
      </p>
      <div class="flex items-center gap-4 text-base text-[var(--text-muted)]">
        <button
          onClick={props.onLike}
          class={cn(
            'flex items-center gap-1 hover:text-[var(--accent-coral)] transition-colors',
            props.comment.isLiked && 'text-[var(--accent-coral)]'
          )}
        >
          <svg class="w-4 h-4" fill={props.comment.isLiked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" viewBox="0 0 256 256">
            <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32Z" />
          </svg>
          <Show when={props.comment.likes}>{props.comment.likes}</Show>
        </button>
        <button
          onClick={props.onReply}
          class="hover:text-[var(--text-secondary)] transition-colors"
        >
          Reply
        </button>
      </div>
    </div>
  </div>
)


// ── Main Component ─────────────────────────────────────────────────────

export const PostViewer: Component<PostViewerProps> = (props) => {
  const mode = () => props.mode ?? 'page'
  const isPage = () => mode() === 'page'
  const isDialog = () => mode() === 'dialog'

  return (
    <div class={cn('flex flex-col h-full bg-[var(--bg-page)]', props.class)}>
      {/* Header */}
      <header class="flex items-center gap-3 px-4 py-3 border-b border-[var(--bg-highlight)] bg-[var(--bg-surface)] sticky top-0 z-10">
        <Show when={isPage() && props.onBack}>
          <IconButton variant="ghost" size="md" onClick={props.onBack} aria-label="Back">
            <ChevronLeftIcon />
          </IconButton>
        </Show>
        <h1 class="flex-1 text-lg font-semibold text-[var(--text-primary)]">Post</h1>
        <Show when={props.menuSlot}>
          {props.menuSlot}
        </Show>
        <Show when={!props.menuSlot}>
          <IconButton variant="ghost" size="md" aria-label="More options">
            <DotsThreeIcon />
          </IconButton>
        </Show>
        <Show when={isDialog() && props.onClose}>
          <IconButton variant="ghost" size="md" onClick={props.onClose} aria-label="Close">
            <XIcon />
          </IconButton>
        </Show>
      </header>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto">
        {/* Author */}
        <div class="px-4 pt-4">
          <button
            onClick={props.onAuthorClick}
            class="flex items-center gap-3 cursor-pointer"
          >
            <Avatar
              src={props.authorAvatarUrl}
              size="lg"
            />
            <div class="flex flex-col">
              <span class="text-base font-semibold text-[var(--text-primary)]">
                {props.authorName}
              </span>
              <Show when={props.authorHandle}>
                <span class="text-base text-[var(--text-muted)]">
                  @{props.authorHandle}
                </span>
              </Show>
            </div>
          </button>
        </div>

        {/* Post content */}
        <div class="px-4 py-4">
          {/* Text */}
          <Show when={props.text}>
            <p class="text-lg text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed mb-4">
              {props.text}
            </p>
          </Show>

          {/* Image - full, uncropped */}
          <Show when={props.imageUrl}>
            <button
              onClick={props.onImageClick}
              class="w-full rounded-md overflow-hidden cursor-pointer"
            >
              <img
                src={props.imageUrl}
                alt={props.imageAlt ?? 'Post image'}
                class="w-full h-auto object-contain bg-[var(--bg-elevated)]"
              />
            </button>
          </Show>
        </div>

        {/* Timestamp */}
        <div class="px-4 pb-3 border-b border-[var(--bg-highlight)]">
          <span class="text-base text-[var(--text-muted)]">
            {props.fullTimestamp || props.timestamp}
          </span>
        </div>

        {/* Engagement stats */}
        <div class="px-4 py-3 border-b border-[var(--bg-highlight)]">
          <div class="flex items-center gap-6">
            <Show when={props.likes !== undefined}>
              <span class="text-base">
                <span class="font-semibold text-[var(--text-primary)]">{props.likes}</span>
                <span class="text-[var(--text-muted)]"> likes</span>
              </span>
            </Show>
            <Show when={props.comments !== undefined}>
              <span class="text-base">
                <span class="font-semibold text-[var(--text-primary)]">{props.comments}</span>
                <span class="text-[var(--text-muted)]"> comments</span>
              </span>
            </Show>
          </div>
        </div>

        {/* Action bar */}
        <div class="px-4 py-2 border-b border-[var(--bg-highlight)]">
          <EngagementBar
            isLiked={props.isLiked}
            onLike={props.onLike}
            onComment={() => {}}
            rightSlot={
              <Show when={props.provenance}>
                <button
                  onClick={props.onProvenanceClick}
                  class="flex items-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <InfoIcon />
                </button>
              </Show>
            }
          />
        </div>

        {/* Comments section */}
        <div class="px-4">
          <Show when={props.commentsLoading}>
            <div class="py-8 text-center text-[var(--text-muted)]">
              Loading comments...
            </div>
          </Show>

          <Show when={!props.commentsLoading && (!props.commentList || props.commentList.length === 0)}>
            <div class="py-8 text-center text-[var(--text-muted)]">
              No comments yet. Be the first to comment!
            </div>
          </Show>

          <Show when={!props.commentsLoading && props.commentList && props.commentList.length > 0}>
            <div class="divide-y divide-[var(--bg-highlight)]">
              <For each={props.commentList}>
                {(comment) => (
                  <CommentItem
                    comment={comment}
                    onLike={() => props.onCommentLike?.(comment.id)}
                    onReply={() => props.onReply?.(comment.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Comment composer - fixed at bottom */}
      <MessageInput
        placeholder="Write a comment..."
        onSubmit={props.onSubmitComment}
      />
    </div>
  )
}
