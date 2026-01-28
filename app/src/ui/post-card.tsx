import type { Component, JSX } from 'solid-js'
import { splitProps, Show } from 'solid-js'
import { cn } from '@/lib/utils'
import { UserHandle } from './user-handle'
import { EngagementBar, type EngagementAction } from './engagement-bar'

export interface PostCardProps {
  class?: string
  // Author info
  authorName: string
  authorHandle?: string
  authorAvatarSrc?: string
  authorAvatarFallback?: JSX.Element
  // Content
  content: string
  // Engagement
  engagementActions?: EngagementAction[]
  // Actions
  headerAction?: JSX.Element
  // Children (for comments section, etc.)
  children?: JSX.Element
}

/**
 * PostCard - Social media post card with author header, content, and engagement bar.
 * Composable: accepts children for comment sections or other nested content.
 */
export const PostCard: Component<PostCardProps> = (props) => {
  const [local] = splitProps(props, [
    'class',
    'authorName',
    'authorHandle',
    'authorAvatarSrc',
    'authorAvatarFallback',
    'content',
    'engagementActions',
    'headerAction',
    'children',
  ])

  return (
    <div class={cn('flex flex-col gap-3', local.class)}>
      {/* Author Header */}
      <UserHandle
        name={local.authorName}
        handle={local.authorHandle}
        avatarSrc={local.authorAvatarSrc}
        avatarFallback={local.authorAvatarFallback}
        action={local.headerAction}
        size="md"
      />

      {/* Content */}
      <p class="text-sm text-[var(--text-primary)] leading-relaxed">
        {local.content}
      </p>

      {/* Engagement Bar */}
      <Show when={local.engagementActions && local.engagementActions.length > 0}>
        <EngagementBar actions={local.engagementActions!} />
      </Show>

      {/* Children (comments, etc.) */}
      <Show when={local.children}>
        {local.children}
      </Show>
    </div>
  )
}
