import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/lib/utils'
import { IconButton } from './icon-button'

export interface EngagementAction {
  icon: JSX.Element
  count?: number | string
  label: string
  onClick?: () => void
  active?: boolean
}

export interface EngagementBarProps {
  class?: string
  actions: EngagementAction[]
  size?: 'sm' | 'md'
}

/**
 * EngagementBar - Reusable like/comment/share row for social interactions.
 * Displays a horizontal row of action buttons with icons and counts.
 */
export const EngagementBar: Component<EngagementBarProps> = (props) => {
  const [local] = splitProps(props, ['class', 'actions', 'size'])
  const size = () => local.size ?? 'md'

  return (
    <div
      class={cn(
        'flex items-center gap-4',
        size() === 'sm' ? 'text-xs' : 'text-sm',
        local.class
      )}
    >
      {local.actions.map((action) => (
        <div class="flex items-center gap-1.5">
          <IconButton
            variant="ghost"
            size="md"
            onClick={action.onClick}
            aria-label={action.label}
            class={cn(
              action.active && 'text-[var(--accent-primary)] hover:text-[var(--accent-primary)]'
            )}
          >
            <span class={cn(size() === 'sm' ? 'w-4 h-4' : 'w-5 h-5')}>
              {action.icon}
            </span>
          </IconButton>
          {action.count !== undefined && (
            <span class="text-[var(--text-secondary)]">{action.count}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Pre-built icons for common actions
export const HeartIcon: Component<{ filled?: boolean }> = (props) => (
  <svg viewBox="0 0 256 256" fill="currentColor">
    {props.filled ? (
      <path d="M240,94c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,220.66,16,164,16,94A62.07,62.07,0,0,1,78,32c20.65,0,38.73,8.88,50,23.89C139.27,40.88,157.35,32,178,32A62.07,62.07,0,0,1,240,94Z" />
    ) : (
      <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32ZM128,206.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.24,196.15,128,206.8Z" />
    )}
  </svg>
)

export const CommentIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export const ShareIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16,6 12,2 8,6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)
