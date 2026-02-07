import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'
import { IconButton } from '../../primitives/icon-button'
import { Button } from '../../primitives/button'
import { Drawer, DrawerContent } from '../../primitives/drawer'
import { Image, Plus } from '../../icons'

// ── Desktop Compose Box (inline at top of feed) ────────────────────────

export interface ComposeBoxProps {
  avatarUrl?: string
  placeholder?: string
  onPost?: (text: string) => void
  onAddMedia?: () => void
  class?: string
}

export const ComposeBox: Component<ComposeBoxProps> = (props) => {
  const [text, setText] = createSignal('')
  const [focused, setFocused] = createSignal(false)

  const handlePost = () => {
    const val = text().trim()
    if (!val) return
    props.onPost?.(val)
    setText('')
    setFocused(false)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handlePost()
    }
  }

  return (
    <div class={cn(
      'flex gap-3 p-4 border-b border-[var(--border-subtle)]',
      props.class,
    )}>
      <Avatar src={props.avatarUrl} size="md" />
      <div class="flex-1 flex flex-col gap-3">
        <textarea
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder ?? "What's on your mind?"}
          rows={focused() || text() ? 3 : 1}
          class={cn(
            'w-full resize-none bg-transparent text-[var(--text-primary)] text-base',
            'placeholder:text-[var(--text-muted)] outline-none',
            'transition-[height] duration-150',
          )}
        />
        <Show when={focused() || text()}>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
              <IconButton
                variant="soft"
                size="md"
                aria-label="Add media"
                onClick={() => props.onAddMedia?.()}
              >
                <Image class="w-5 h-5" />
              </IconButton>
            </div>
            <Button
              variant="default"
              size="sm"
              disabled={!text().trim()}
              onClick={handlePost}
            >
              Post
            </Button>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ── Mobile FAB (floating action button) ────────────────────────────────

export interface ComposeFabProps {
  onClick?: () => void
  class?: string
}

export const ComposeFab: Component<ComposeFabProps> = (props) => {
  return (
    <button
      type="button"
      class={cn(
        'fixed bottom-20 right-4 z-40',
        'w-14 h-14 rounded-full',
        'bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)]',
        'flex items-center justify-center',
        'shadow-lg shadow-black/30',
        'transition-colors cursor-pointer',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      <Plus class="w-7 h-7 text-white" />
    </button>
  )
}

// ── Mobile Compose Drawer (bottom sheet) ───────────────────────────────

export interface ComposeDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  avatarUrl?: string
  placeholder?: string
  onPost?: (text: string) => void
  onAddMedia?: () => void
}

export const ComposeDrawer: Component<ComposeDrawerProps> = (props) => {
  const [text, setText] = createSignal('')

  const handlePost = () => {
    const val = text().trim()
    if (!val) return
    props.onPost?.(val)
    setText('')
    props.onOpenChange(false)
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent
        showHandle
        footer={
          <div class="flex items-center justify-between">
            <IconButton
              variant="soft"
              size="md"
              aria-label="Add media"
              onClick={() => props.onAddMedia?.()}
            >
              <Image class="w-5 h-5" />
            </IconButton>
            <Button
              variant="default"
              size="sm"
              disabled={!text().trim()}
              onClick={handlePost}
            >
              Post
            </Button>
          </div>
        }
      >
        <div class="flex gap-3 pt-2">
          <Avatar src={props.avatarUrl} size="md" />
          <textarea
            ref={(el) => setTimeout(() => el.focus(), 100)}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder={props.placeholder ?? "What's on your mind?"}
            rows={4}
            class="w-full flex-1 resize-none bg-transparent text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
