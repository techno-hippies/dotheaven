import type { Component } from 'solid-js'
import { createSignal, Show, For } from 'solid-js'
import { cn } from '../../lib/classnames'
import { IconButton } from '../../primitives/icon-button'
import { ChevronLeft, PaperPlaneTilt } from '../../icons'
import { PageHeader } from '../shared/page-header'
import { FeedPost, type FeedPostProps } from './feed-post'
import { CommentItem, type CommentItemProps, CommentSection } from './comment-item'

export interface PostDetailViewProps {
  class?: string
  post: FeedPostProps
  comments: CommentItemProps[]
  onBack: () => void
  onSubmitComment?: (text: string) => void
}

const SendIcon = () => <PaperPlaneTilt class="w-5 h-5" />

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
      <PageHeader
        compact
        title="Post"
        leftSlot={
          <IconButton variant="soft" size="md" aria-label="Back" onClick={props.onBack}>
            <ChevronLeft class="w-5 h-5" />
          </IconButton>
        }
      />

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
              <p class="text-base text-[var(--text-muted)] py-4 text-center">No comments yet</p>
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
