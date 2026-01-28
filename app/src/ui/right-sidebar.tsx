import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/lib/utils'
import { NowPlaying, type NowPlayingProps } from './now-playing'
import { PostCard, type PostCardProps } from './post-card'
import { CommentItem, CommentSection, type CommentItemProps } from './comment-item'
import { FollowButton } from './follow-button'
import { HeartIcon, CommentIcon, ShareIcon, type EngagementAction } from './engagement-bar'

export interface RightSidebarProps {
  class?: string
  children?: JSX.Element
}

/**
 * RightSidebar - Container for the right sidebar content.
 * Use with RightPanel from layout components for proper positioning.
 */
export const RightSidebar: Component<RightSidebarProps> = (props) => {
  const [local] = splitProps(props, ['class', 'children'])

  return (
    <div class={cn('flex flex-col h-full p-5 gap-6 overflow-y-auto', local.class)}>
      {local.children}
    </div>
  )
}

/**
 * RightSidebarSection - Section divider within the sidebar.
 */
export const RightSidebarSection: Component<{
  class?: string
  children: JSX.Element
}> = (props) => (
  <div class={cn('pb-6 border-b border-[var(--border-subtle)] last:border-b-0 last:pb-0', props.class)}>
    {props.children}
  </div>
)

// Re-export components for convenience when using RightSidebar
export { NowPlaying, PostCard, CommentItem, CommentSection, FollowButton }
export { HeartIcon, CommentIcon, ShareIcon }
export type { NowPlayingProps, PostCardProps, CommentItemProps, EngagementAction }
