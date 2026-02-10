import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { cn } from '../lib/classnames'
import { IconButton } from '../primitives/icon-button'
import { Check, Copy } from '../icons'

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
        <label class="text-base text-[var(--text-muted)] font-medium">
          Wallet Address
        </label>
      )}
      <div class="relative flex items-center">
        <input
          type="text"
          value={props.address}
          readOnly
          class={cn(
            'w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-full font-mono transition-colors',
            'border border-transparent hover:border-[var(--bg-highlight-hover)] focus:border-[var(--accent-blue)] focus:outline-none',
            props.variant === 'compact'
              ? 'text-base pl-5 pr-14 py-2.5'
              : 'text-base pl-6 pr-16 py-3'
          )}
        />
        <div class="absolute right-2">
          <IconButton
            onClick={handleCopy}
            variant="soft"
            size="md"
            aria-label={copied() ? 'Copied!' : 'Copy address'}
          >
            {copied() ? (
              <Check class="w-5 h-5" />
            ) : (
              <Copy class="w-5 h-5" />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
