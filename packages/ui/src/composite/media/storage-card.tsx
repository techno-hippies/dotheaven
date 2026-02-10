import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { Button } from '../../primitives/button'
import { useIsMobile } from '../../lib/use-media-query'
import { Plus, Warning } from '../../icons'

export interface StorageStatus {
  balance: string
  balanceRaw: bigint
  operatorApproved: boolean
  monthlyCost: string
  daysRemaining: number | null
  ready: boolean
}

export interface StorageCardProps {
  status: StorageStatus | null
  loading: boolean
  error: string | null
  onAddFunds: () => void
  /** Optional footer text shown below the card */
  footerText?: string
}


export const StorageCard: Component<StorageCardProps> = (props) => {
  const isMobile = useIsMobile()

  const daysColor = () => {
    const days = props.status?.daysRemaining
    if (days == null) return 'text-[var(--text-primary)]'
    if (days < 7) return 'text-amber-400'
    if (days > 30) return 'text-green-400'
    return 'text-[var(--text-primary)]'
  }

  const formatDays = () => {
    const days = props.status?.daysRemaining
    if (days == null) return '—'
    return days.toLocaleString()
  }

  return (
    <div>
      {/* Top row: Add Funds button right-aligned */}
      <div class="flex items-center justify-end mb-4">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus class="w-3.5 h-3.5" />}
          onClick={props.onAddFunds}
        >
          Add Funds
        </Button>
      </div>

      {/* Loading state */}
      <Show when={props.loading && !props.status}>
        <div class="text-[var(--text-muted)] text-base">Loading storage status...</div>
      </Show>

      {/* Error state */}
      <Show when={props.error && !props.status}>
        <div class="text-[var(--text-muted)] text-base">{props.error}</div>
      </Show>

      {/* Stats in rounded boxes */}
      <Show when={props.status}>
        {(status) => (
          <>
            <div class={`grid ${isMobile() ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-3'}`}>
              <div class="rounded-md bg-[var(--bg-elevated)] p-4">
                <div class="text-xl font-bold text-[var(--text-primary)]">{status().balance}</div>
                <div class="text-base text-[var(--text-muted)] mt-1">Balance</div>
              </div>
              <div class="rounded-md bg-[var(--bg-elevated)] p-4">
                <div class="text-xl font-bold text-[var(--text-primary)]">{status().monthlyCost}</div>
                <div class="text-base text-[var(--text-muted)] mt-1">Monthly</div>
              </div>
              <div class="rounded-md bg-[var(--bg-elevated)] p-4">
                <div class={`text-xl font-bold ${daysColor()}`}>{formatDays()}</div>
                <div class="text-base text-[var(--text-muted)] mt-1">Days Left</div>
              </div>
            </div>

            {/* Low balance warning */}
            <Show when={status().daysRemaining !== null && status().daysRemaining! < 7 && status().daysRemaining! > 0}>
              <div class="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 mt-3 flex items-center gap-2">
                <Warning class="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span class="text-base text-amber-400">
                  Low balance — your uploads may be interrupted soon.
                </span>
              </div>
            </Show>
          </>
        )}
      </Show>

      {/* Footer text */}
      <Show when={props.footerText}>
        <p class="text-base text-[var(--text-muted)] mt-3">{props.footerText}</p>
      </Show>
    </div>
  )
}
