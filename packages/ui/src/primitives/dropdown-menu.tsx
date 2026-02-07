import type { Component, ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { DropdownMenu as KobalteDropdownMenu } from '@kobalte/core/dropdown-menu'
import { cn } from '../lib/classnames'

/**
 * DropdownMenu - Styled wrapper around Kobalte's DropdownMenu.
 *
 * Usage:
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger>Options</DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem onSelect={() => console.log('clicked')}>
 *       Item 1
 *     </DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem>Item 2</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */

export const DropdownMenu = KobalteDropdownMenu

export const DropdownMenuTrigger = KobalteDropdownMenu.Trigger

export const DropdownMenuPortal = KobalteDropdownMenu.Portal

export const DropdownMenuSub = KobalteDropdownMenu.Sub

export const DropdownMenuSubTrigger: Component<
  ComponentProps<typeof KobalteDropdownMenu.SubTrigger>
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <KobalteDropdownMenu.SubTrigger
      class={cn(
        'flex items-center gap-2 px-3 py-2 text-base text-[var(--text-primary)] cursor-pointer',
        'hover:bg-[var(--bg-highlight-hover)] data-[highlighted]:bg-[var(--bg-highlight-hover)]',
        'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
        local.class
      )}
      {...others}
    >
      {local.children}
    </KobalteDropdownMenu.SubTrigger>
  )
}

export const DropdownMenuSubContent: Component<
  ComponentProps<typeof KobalteDropdownMenu.SubContent>
> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDropdownMenu.SubContent
      class={cn(
        'min-w-[180px] bg-[var(--bg-surface)] rounded-md shadow-lg border border-[var(--bg-highlight)] overflow-hidden',
        'animate-in fade-in-0 zoom-in-95',
        'origin-[var(--kb-menu-content-transform-origin)]',
        local.class
      )}
      {...others}
    />
  )
}

export const DropdownMenuContent: Component<
  ComponentProps<typeof KobalteDropdownMenu.Content>
> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDropdownMenu.Portal>
      <KobalteDropdownMenu.Content
        class={cn(
          'min-w-[180px] bg-[var(--bg-surface)] rounded-md shadow-lg border border-[var(--bg-highlight)] z-50 overflow-hidden',
          'animate-in fade-in-0 zoom-in-95',
          'origin-[var(--kb-menu-content-transform-origin)]',
          local.class
        )}
        {...others}
      />
    </KobalteDropdownMenu.Portal>
  )
}

export const DropdownMenuItem: Component<
  ComponentProps<typeof KobalteDropdownMenu.Item>
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <KobalteDropdownMenu.Item
      class={cn(
        'flex items-center gap-2 px-3 py-2 text-base text-[var(--text-primary)] cursor-pointer outline-none',
        'hover:bg-[var(--bg-highlight-hover)] data-[highlighted]:bg-[var(--bg-highlight-hover)]',
        'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
        local.class
      )}
      {...others}
    >
      {local.children}
    </KobalteDropdownMenu.Item>
  )
}

export const DropdownMenuSeparator: Component<
  ComponentProps<typeof KobalteDropdownMenu.Separator>
> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDropdownMenu.Separator
      class={cn('h-px bg-[var(--bg-highlight)]', local.class)}
      {...others}
    />
  )
}

export const DropdownMenuGroup = KobalteDropdownMenu.Group

export const DropdownMenuGroupLabel: Component<
  ComponentProps<typeof KobalteDropdownMenu.GroupLabel>
> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDropdownMenu.GroupLabel
      class={cn('px-3 py-2 text-xs font-semibold text-[var(--text-muted)]', local.class)}
      {...others}
    />
  )
}

export const DropdownMenuCheckboxItem: Component<
  ComponentProps<typeof KobalteDropdownMenu.CheckboxItem>
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <KobalteDropdownMenu.CheckboxItem
      class={cn(
        'flex items-center gap-2 px-3 py-2 text-base text-[var(--text-primary)] cursor-pointer outline-none',
        'hover:bg-[var(--bg-highlight-hover)] data-[highlighted]:bg-[var(--bg-highlight-hover)]',
        'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
        local.class
      )}
      {...others}
    >
      {local.children}
    </KobalteDropdownMenu.CheckboxItem>
  )
}

export const DropdownMenuRadioGroup = KobalteDropdownMenu.RadioGroup

export const DropdownMenuRadioItem: Component<
  ComponentProps<typeof KobalteDropdownMenu.RadioItem>
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <KobalteDropdownMenu.RadioItem
      class={cn(
        'flex items-center gap-2 px-3 py-2 text-base text-[var(--text-primary)] cursor-pointer outline-none',
        'hover:bg-[var(--bg-highlight-hover)] data-[highlighted]:bg-[var(--bg-highlight-hover)]',
        'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
        local.class
      )}
      {...others}
    >
      {local.children}
    </KobalteDropdownMenu.RadioItem>
  )
}

export const DropdownMenuItemIndicator = KobalteDropdownMenu.ItemIndicator

export const DropdownMenuItemLabel = KobalteDropdownMenu.ItemLabel

export const DropdownMenuItemDescription = KobalteDropdownMenu.ItemDescription
