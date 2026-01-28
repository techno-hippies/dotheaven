import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, Avatar } from '@heaven/ui'

const userHandleVariants = cva('flex items-center gap-2', {
  variants: {
    size: {
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-3',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const avatarSizeMap = {
  sm: 'sm' as const,
  md: 'md' as const,
  lg: 'lg' as const,
}

const textSizeMap = {
  sm: { name: 'text-sm', handle: 'text-xs' },
  md: { name: 'text-sm', handle: 'text-sm' },
  lg: { name: 'text-base', handle: 'text-sm' },
}

export interface UserHandleProps extends VariantProps<typeof userHandleVariants> {
  class?: string
  name: string
  handle?: string
  avatarSrc?: string
  avatarFallback?: JSX.Element
  action?: JSX.Element
  onClick?: () => void
}

/**
 * UserHandle - Avatar + name + handle combo, commonly used for post headers and user references.
 * Includes optional action slot (e.g., follow button).
 */
export const UserHandle: Component<UserHandleProps> = (props) => {
  const [local] = splitProps(props, ['class', 'name', 'handle', 'avatarSrc', 'avatarFallback', 'action', 'onClick', 'size'])
  const size = () => local.size ?? 'md'

  return (
    <div
      class={cn(userHandleVariants({ size: size() }), local.class)}
      onClick={local.onClick}
      role={local.onClick ? 'button' : undefined}
      tabIndex={local.onClick ? 0 : undefined}
    >
      <Avatar
        src={local.avatarSrc}
        size={avatarSizeMap[size()]}
        shape="circle"
        fallback={local.avatarFallback}
      />
      <div class="flex flex-col flex-1 min-w-0">
        <span class={cn('font-medium text-[var(--text-primary)] truncate', textSizeMap[size()].name)}>
          {local.name}
        </span>
        {local.handle && (
          <span class={cn('text-[var(--text-muted)] truncate', textSizeMap[size()].handle)}>
            @{local.handle}
          </span>
        )}
      </div>
      {local.action && (
        <div class="flex-shrink-0">
          {local.action}
        </div>
      )}
    </div>
  )
}
