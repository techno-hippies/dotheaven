import type { Component } from 'solid-js'
import { createSignal, Show, For } from 'solid-js'
import { cn } from '../../lib/utils'
import { IconButton } from '../../primitives/icon-button'
import { ChevronLeft } from '../../icons'
import { FeedPost, type FeedPostProps } from './feed-post'
import { CommentItem, type CommentItemProps, CommentSection } from './comment-item'

export interface PostDetailViewProps {
  class?: string
  post: FeedPostProps
  comments: CommentItemProps[]
  onBack: () => void
  onSubmitComment?: (text: string) => void
}

const SendIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M227.32,28.68a16,16,0,0,0-15.66-4.08l-.15,0L19.57,82.84a16,16,0,0,0-2.49,29.8L102,154l41.3,84.87A15.86,15.86,0,0,0,157.74,248q.69,0,1.38-.06a15.88,15.88,0,0,0,14-11.51l58.2-191.94c0-.05,0-.1,0-.15A16,16,0,0,0,227.32,28.68ZM157.83,231.85l-.05.14,0-.07-40.06-82.3,48-48a8,8,0,0,0-11.31-11.31l-48,48L24.08,98.25l-.07,0,.14,0L216,40Z" />
  </svg>
)

export const PostDetailView: Component<PostDetailViewProps> = (props) => {
  const [commentText, setCommentText] = createSignal('')

  const handleSubmit = () => {
    const text = commentText().trim()
    if (!text) return
    props.onSubmitComment?.(text)
    setCommentText('')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div class={cn('flex flex-col h-full', props.class)}>
      {/* Sticky header */}
      <div class="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
        <IconButton
          variant="soft"
          size="md"
          aria-label="Back"
          onClick={props.onBack}
        >
          <ChevronLeft class="w-5 h-5" />
        </IconButton>
        <span class="text-base font-semibold text-[var(--text-primary)]">Post</span>
      </div>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto">
        <FeedPost {...props.post} />

        {/* Divider */}
        <div class="border-t border-[var(--border-subtle)]" />

        {/* Comments */}
        <div class="p-4">
          <Show
            when={props.comments.length > 0}
            fallback={
              <p class="text-sm text-[var(--text-muted)] py-4 text-center">No comments yet</p>
            }
          >
            <CommentSection>
              <For each={props.comments}>
                {(comment) => (
                  <CommentItem
                    authorName={comment.authorName}
                    avatarSrc={comment.avatarSrc}
                  >
                    {comment.children}
                  </CommentItem>
                )}
              </For>
            </CommentSection>
          </Show>
        </div>

        {/* Bottom spacer for input clearance */}
        <div class="h-20" />
      </div>

      {/* Sticky bottom comment input */}
      <Show when={props.onSubmitComment}>
        <div class="flex items-center gap-3 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
          <input
            type="text"
            placeholder="Add a comment..."
            value={commentText()}
            onInput={(e) => setCommentText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            class="flex-1 bg-[var(--bg-elevated)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-full border-none outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50"
          />
          <IconButton
            variant="send"
            size="xl"
            aria-label="Send comment"
            disabled={!commentText().trim()}
            onClick={handleSubmit}
            class="flex-shrink-0"
          >
            <SendIcon />
          </IconButton>
        </div>
      </Show>
    </div>
  )
}
