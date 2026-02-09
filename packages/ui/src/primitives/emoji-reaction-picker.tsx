import type { Component } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { cn } from '../lib/classnames'
import { Smiley } from '../icons'

/** Default quick-access emoji set */
const DEFAULT_EMOJI = ['❤️', '🔥', '😂', '👏', '😍', '💀'] as const

export interface EmojiReactionPickerProps {
  /** Emoji set to display. Defaults to heart, fire, laugh, clap, heart-eyes, skull */
  emoji?: string[]
  /** Called when an emoji is tapped — fires the reaction and dismisses */
  onReact?: (emoji: string) => void
  /** Additional class for the trigger button */
  class?: string
}

/**
 * Emoji reaction button with popover picker.
 * Tap the smiley button → picker strip appears above → tap emoji → fires onReact and dismisses.
 * Reusable for room reactions and feed post reactions.
 */
export const EmojiReactionPicker: Component<EmojiReactionPickerProps> = (props) => {
  const [open, setOpen] = createSignal(false)
  const emoji = () => props.emoji ?? [...DEFAULT_EMOJI]

  const handleReact = (e: string) => {
    props.onReact?.(e)
    setOpen(false)
  }

  return (
    <div class="relative inline-flex">
      {/* Picker popover — appears above the button */}
      <Show when={open()}>
        {/* Backdrop to dismiss */}
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div class="flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] p-1 shadow-lg border border-[var(--border-subtle)]">
            <For each={emoji()}>
              {(e) => (
                <button
                  type="button"
                  class="w-10 h-10 flex items-center justify-center rounded-full text-lg cursor-pointer bg-transparent border-none hover:bg-[var(--bg-highlight-hover)] transition-colors active:scale-125"
                  onClick={() => handleReact(e)}
                >
                  {e}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Trigger button */}
      <button
        type="button"
        class={cn(
          'inline-flex items-center justify-center w-12 h-12 rounded-full cursor-pointer border-none transition-colors',
          open()
            ? 'bg-[var(--bg-highlight-hover)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)]',
          props.class,
        )}
        onClick={() => setOpen(!open())}
        aria-label="React with emoji"
      >
        <Smiley class="w-6 h-6" />
      </button>
    </div>
  )
}
