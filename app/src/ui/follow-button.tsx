import type { Component } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface FollowButtonProps {
  class?: string
  isFollowing?: boolean
  onClick?: () => void
}

/**
 * FollowButton - Compact follow/following toggle button.
 * Uses default Button for "Follow", outline Button for "Following".
 */
export const FollowButton: Component<FollowButtonProps> = (props) => {
  const [local] = splitProps(props, ['class', 'isFollowing', 'onClick'])

  return (
    <Button
      variant={local.isFollowing ? 'outline' : 'default'}
      size="sm"
      onClick={local.onClick}
      class={cn(local.class)}
    >
      {local.isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
