import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { cn } from '../lib/utils'
import { IconButton } from '../primitives/icon-button'

export interface WalletAddressProps {
  class?: string
  address: string
  showLabel?: boolean
  variant?: 'default' | 'compact'
}

/**
 * WalletAddress component - displays wallet address in a copyable input field
 * Shows full address with copy button
 */
export const WalletAddress: Component<WalletAddressProps> = (props) => {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class={cn('flex flex-col gap-2', props.class)}>
      {props.showLabel && (
        <label class="text-sm text-[var(--text-muted)] font-medium">
          Wallet Address
        </label>
      )}
      <div class="relative flex items-center">
        <input
          type="text"
          value={props.address}
          readOnly
          class={cn(
            'w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-lg font-mono transition-colors',
            'border border-transparent hover:border-[var(--bg-highlight-hover)] focus:border-[var(--accent-blue)] focus:outline-none',
            props.variant === 'compact'
              ? 'text-sm pl-3 pr-12 py-2.5'
              : 'text-base pl-4 pr-14 py-3'
          )}
        />
        <div class="absolute right-1">
          <IconButton
            onClick={handleCopy}
            variant="soft"
            size="md"
            aria-label={copied() ? 'Copied!' : 'Copy address'}
          >
            {copied() ? (
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
