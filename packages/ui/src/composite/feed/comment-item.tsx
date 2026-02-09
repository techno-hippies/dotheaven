import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'

export interface CommentItemProps {
  class?: string
  authorName: string
  avatarSrc?: string
  avatarFallback?: JSX.Element
  children: JSX.Element
}

export const CommentItem: Component<CommentItemProps> = (props) => {
  const [local] = splitProps(props, ['class', 'authorName', 'avatarSrc', 'avatarFallback', 'children'])

  return (
    <div class={cn('flex items-start gap-3', local.class)}>
      <Avatar
        src={local.avatarSrc}
        size="sm"
        shape="circle"
        fallback={local.avatarFallback}
        class="flex-shrink-0"
      />
      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <span class="font-medium text-base text-[var(--text-secondary)]">{local.authorName}</span>
        <p class="text-base leading-relaxed text-[var(--text-primary)]">{local.children}</p>
      </div>
    </div>
  )
}

export interface CommentSectionProps {
  class?: string
  title?: string
  children: JSX.Element
}

export const CommentSection: Component<CommentSectionProps> = (props) => {
  const [local] = splitProps(props, ['class', 'title', 'children'])

  return (
    <div class={cn('flex flex-col gap-3', local.class)}>
      {local.title && (
        <h4 class="text-base font-medium text-[var(--text-primary)]">{local.title}</h4>
      )}
      <div class="flex flex-col gap-2">
        {local.children}
      </div>
    </div>
  )
}
