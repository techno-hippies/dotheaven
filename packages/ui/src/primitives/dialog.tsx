import type { Component, ComponentProps, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { Dialog as KobalteDialog } from '@kobalte/core/dialog'
import { cn } from '../lib/classnames'
import { IconButton } from './icon-button'
import { X } from '../icons'

/**
 * Dialog - Modal overlay component for displaying content that requires user attention.
 *
 * Usage:
 * ```tsx
 * <Dialog>
 *   <DialogTrigger>Open Dialog</DialogTrigger>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Dialog Title</DialogTitle>
 *       <DialogDescription>Dialog description text.</DialogDescription>
 *     </DialogHeader>
 *     <div>Dialog content goes here</div>
 *   </DialogContent>
 * </Dialog>
 * ```
 */

export const Dialog = KobalteDialog

export const DialogTrigger = KobalteDialog.Trigger

export const DialogPortal = KobalteDialog.Portal

export const DialogOverlay: Component<ComponentProps<typeof KobalteDialog.Overlay>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDialog.Overlay
      class={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        'data-[expanded]:animate-in data-[expanded]:fade-in-0',
        'data-[closed]:animate-out data-[closed]:fade-out-0',
        local.class
      )}
      {...others}
    />
  )
}

export const DialogContent: Component<
  ComponentProps<typeof KobalteDialog.Content> & { children?: JSX.Element }
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <KobalteDialog.Portal>
      <DialogOverlay />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <KobalteDialog.Content
          class={cn(
            'relative w-full max-w-lg bg-[var(--bg-surface)] rounded-md shadow-lg',
            'border border-[var(--border-subtle)]',
            'data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95',
            'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            'flex flex-col max-h-[90vh]',
            local.class
          )}
          {...others}
        >
          {local.children}
        </KobalteDialog.Content>
      </div>
    </KobalteDialog.Portal>
  )
}

export const DialogHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <div
      class={cn(
        'flex items-start justify-between gap-4 p-6 pb-2 flex-shrink-0',
        local.class
      )}
      {...others}
    >
      <div class="flex-1 space-y-1.5">
        {local.children}
      </div>
      <KobalteDialog.CloseButton
        as={(props: any) => (
          <IconButton
            {...props}
            variant="default"
            size="md"
            aria-label="Close dialog"
            class="focus-visible:ring-0 focus-visible:outline-none"
          >
            <X class="w-5 h-5" />
          </IconButton>
        )}
      />
    </div>
  )
}

export const DialogBody: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <div
      class={cn('px-6 py-4 overflow-y-auto flex-1 min-h-0', local.class)}
      {...others}
    >
      {local.children}
    </div>
  )
}

export const DialogFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <div
      class={cn(
        'flex items-center justify-end gap-3 p-6 pt-2 flex-shrink-0',
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  )
}

export const DialogTitle: Component<ComponentProps<typeof KobalteDialog.Title>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDialog.Title
      class={cn(
        'text-xl font-semibold text-[var(--text-primary)]',
        local.class
      )}
      {...others}
    />
  )
}

export const DialogDescription: Component<
  ComponentProps<typeof KobalteDialog.Description>
> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <KobalteDialog.Description
      class={cn(
        'text-base text-[var(--text-secondary)]',
        local.class
      )}
      {...others}
    />
  )
}

export const DialogCloseButton = KobalteDialog.CloseButton
