import type { Component } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn, Button, type ButtonProps } from '@heaven/ui'

export interface FollowButtonProps {
  class?: string
  isFollowing?: boolean
  onClick?: () => void
  size?: ButtonProps['size']
}

/**
 * FollowButton - Compact follow/following toggle button.
 * Uses default Button for "Follow", outline Button for "Following".
 */
export const FollowButton: Component<FollowButtonProps> = (props) => {
  const [local] = splitProps(props, ['class', 'isFollowing', 'onClick', 'size'])

  return (
    <Button
      variant={local.isFollowing ? 'outline' : 'default'}
      size={local.size ?? 'sm'}
      onClick={local.onClick}
      class={cn(local.class)}
    >
      {local.isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
