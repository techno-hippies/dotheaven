import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { cn } from '../../lib/utils'
import { Avatar } from '../../primitives/avatar'
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
      'flex gap-3 p-4 border-b border-[var(--bg-highlight)]',
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
              <button
                type="button"
                class="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer"
                onClick={() => props.onAddMedia?.()}
              >
                <Image class="w-5 h-5" />
              </button>
            </div>
            <button
              type="button"
              disabled={!text().trim()}
              class={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer',
                text().trim()
                  ? 'bg-[var(--accent-blue)] text-white hover:opacity-90'
                  : 'bg-[var(--bg-highlight)] text-[var(--text-muted)] cursor-not-allowed',
              )}
              onClick={handlePost}
            >
              Post
            </button>
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
            <button
              type="button"
              class="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer"
              onClick={() => props.onAddMedia?.()}
            >
              <Image class="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={!text().trim()}
              class={cn(
                'px-5 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer',
                text().trim()
                  ? 'bg-[var(--accent-blue)] text-white hover:opacity-90'
                  : 'bg-[var(--bg-highlight)] text-[var(--text-muted)] cursor-not-allowed',
              )}
              onClick={handlePost}
            >
              Post
            </button>
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
