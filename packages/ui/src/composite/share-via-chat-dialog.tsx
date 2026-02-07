import type { Component } from 'solid-js'
import { Show, For, createSignal, createMemo } from 'solid-js'
import { cn } from '../lib/utils'
import { useIsMobile } from '../lib/use-media-query'
import { MagnifyingGlass, Check } from '../icons'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '../primitives/dialog'
import {
  Drawer,
  DrawerContent,
} from '../primitives/drawer'

// ── Types ──────────────────────────────────────────────────────────

export interface ShareRecipient {
  /** Unique identifier (e.g. peer address) */
  id: string
  /** Display name */
  name: string
  /** Secondary handle text (e.g. truncated address) */
  handle?: string
  /** Avatar image URL */
  avatarUrl?: string
  /** Nationality flag badge */
  nationalityCode?: string
}

export interface ShareViaChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** List of available recipients (chat conversations) */
  recipients: ShareRecipient[]
  /** Called with selected recipient IDs when user clicks Send */
  onSend: (recipientIds: string[]) => void
  /** Whether the send is in progress */
  isSending?: boolean
}

// ── Inner content (shared between dialog + drawer) ──────────────

const ShareViaChatContent: Component<
  ShareViaChatDialogProps & { inputRef?: (el: HTMLInputElement) => void }
> = (props) => {
  const [query, setQuery] = createSignal('')
  const [selected, setSelected] = createSignal<Set<string>>(new Set())

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim()
    if (!q) return props.recipients
    return props.recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.handle && r.handle.toLowerCase().includes(q))
    )
  })

  const toggleRecipient = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = () => {
    const ids = Array.from(selected())
    if (ids.length > 0) props.onSend(ids)
  }

  return (
    <div class="flex flex-col h-full">
      {/* Search input */}
      <div class="px-1 pb-3">
        <div class="flex items-center gap-2 px-3 py-2.5 rounded-md border border-[var(--bg-highlight)] bg-[var(--bg-elevated)] focus-within:border-[var(--accent-purple)]">
          <MagnifyingGlass class="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={props.inputRef}
            type="text"
            placeholder="Search"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>
      </div>

      {/* Recipient list */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <For each={filtered()}>
          {(recipient) => {
            const isSelected = () => selected().has(recipient.id)
            return (
              <button
                type="button"
                class={cn(
                  'flex items-center w-full px-4 py-2.5 text-left cursor-pointer transition-colors',
                  isSelected()
                    ? 'bg-[var(--bg-highlight)]'
                    : 'hover:bg-[var(--bg-highlight-hover)]'
                )}
                onClick={() => toggleRecipient(recipient.id)}
              >
                <Avatar
                  src={recipient.avatarUrl}
                  size="md"
                  nationalityCode={recipient.nationalityCode}
                />
                <div class="flex flex-col min-w-0 ml-3 flex-1">
                  <span class="text-base font-medium text-[var(--text-primary)] truncate">
                    {recipient.name}
                  </span>
                  <Show when={recipient.handle}>
                    <span class="text-sm text-[var(--text-muted)] truncate">
                      {recipient.handle}
                    </span>
                  </Show>
                </div>
                <Show when={isSelected()}>
                  <div class="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-blue)] flex items-center justify-center ml-2">
                    <Check class="w-4 h-4 text-white" />
                  </div>
                </Show>
              </button>
            )
          }}
        </For>

        <Show when={filtered().length === 0}>
          <div class="flex items-center justify-center py-12 text-[var(--text-muted)] text-base">
            {query() ? 'No results' : 'No conversations yet'}
          </div>
        </Show>
      </div>

      {/* Footer with send button */}
      <div class="flex-shrink-0 px-1 pt-3 pb-1 border-t border-[var(--bg-highlight)]">
        <Button
          class="w-full"
          disabled={selected().size === 0 || props.isSending}
          loading={props.isSending}
          onClick={handleSend}
        >
          {selected().size === 0
            ? 'Select users'
            : `Send to ${selected().size} user${selected().size > 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  )
}

// ── Desktop dialog ──────────────────────────────────────────────

const ShareViaChatDesktop: Component<ShareViaChatDialogProps> = (props) => {
  let inputRef: HTMLInputElement | undefined

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <DialogContent class="max-w-sm flex flex-col" style={{ height: '480px' }}>
        <DialogHeader>
          <DialogTitle>Share cast</DialogTitle>
        </DialogHeader>
        <DialogBody class="flex-1 min-h-0 !pb-0">
          <ShareViaChatContent
            {...props}
            inputRef={(el) => {
              inputRef = el
              setTimeout(() => inputRef?.focus(), 50)
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

// ── Mobile drawer ───────────────────────────────────────────────

const ShareViaChatMobile: Component<ShareViaChatDialogProps> = (props) => {
  let inputRef: HTMLInputElement | undefined

  return (
    <Drawer
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <DrawerContent class="h-[85vh]">
        <div class="pt-4 pb-2 px-1">
          <h2 class="text-lg font-semibold text-[var(--text-primary)]">Share cast</h2>
        </div>
        <ShareViaChatContent
          {...props}
          inputRef={(el) => {
            inputRef = el
            setTimeout(() => inputRef?.focus(), 100)
          }}
        />
      </DrawerContent>
    </Drawer>
  )
}

// ── Main responsive export ──────────────────────────────────────

export const ShareViaChatDialog: Component<ShareViaChatDialogProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <Show
      when={isMobile()}
      fallback={<ShareViaChatDesktop {...props} />}
    >
      <ShareViaChatMobile {...props} />
    </Show>
  )
}
