import type { Component, JSX } from 'solid-js'
import { For } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { WalletAddress } from './wallet-address'

export interface WalletAsset {
  id: string
  name: string
  symbol: string
  icon: string | JSX.Element
  chainBadge?: string | JSX.Element  // Chain icon shown as badge on bottom-right
  balance: string
  balanceUSD: string
  amount: string
}

export interface WalletAssetsProps {
  class?: string
  address: string
  totalBalance: string
  assets: WalletAsset[]
  onSend?: () => void
  onReceive?: () => void
}

/**
 * WalletAssets component - displays wallet balance and asset list
 * Used for crypto wallet interfaces with proper alignment and Heaven Dark theme
 */
export const WalletAssets: Component<WalletAssetsProps> = (props) => {
  return (
    <div class={cn('flex flex-col w-full max-w-4xl mx-auto min-h-screen px-8', props.class)}>
      {/* Header with balance */}
      <div class="flex flex-col items-center gap-6 py-12">
        <div class="flex flex-col items-center gap-3">
          <div class="text-sm text-[var(--text-muted)]">Total Balance</div>
          <div class="text-6xl font-bold text-[var(--text-primary)]">{props.totalBalance}</div>
        </div>

        {/* Wallet address with copy */}
        <WalletAddress address={props.address} variant="compact" class="w-full max-w-lg" />
      </div>

      {/* Action buttons */}
      <div class="flex items-center justify-center gap-4 pb-12">
        <Button
          onClick={props.onSend}
          class="gap-2 w-40"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 17L17 7M17 7H7M17 7v10"/>
          </svg>
          Send
        </Button>
        <Button
          onClick={props.onReceive}
          variant="secondary"
          class="gap-2 w-40"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 7L7 17M7 17h10M7 17V7"/>
          </svg>
          Receive
        </Button>
      </div>

      {/* Assets section */}
      <div class="flex flex-col w-full">
        <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-4">Your Assets</h2>

        <div class="flex flex-col gap-3">
          <For each={props.assets}>
            {(asset) => (
              <div class="flex items-center gap-6 p-5 rounded-lg bg-[var(--bg-elevated)] w-full cursor-default">
                {/* Icon - fixed size container with chain badge */}
                <div class="flex-shrink-0 relative">
                  {typeof asset.icon === 'string' ? (
                    <Avatar
                      src={asset.icon}
                      alt={asset.name}
                      size="xl"
                      shape="circle"
                    />
                  ) : (
                    <div class="w-16 h-16 flex items-center justify-center bg-[var(--bg-elevated)] rounded-full">
                      {asset.icon}
                    </div>
                  )}

                  {/* Chain badge - bottom right overlay */}
                  {asset.chainBadge && (
                    <div class="absolute -bottom-1 -right-1 w-7 h-7 bg-[var(--bg-elevated)] rounded-lg flex items-center justify-center border-2 border-[var(--bg-surface)]">
                      {typeof asset.chainBadge === 'string' ? (
                        <img src={asset.chainBadge} alt="chain" class="w-5 h-5" />
                      ) : (
                        <div class="w-5 h-5 flex items-center justify-center">
                          {asset.chainBadge}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Name and symbol - aligned left */}
                <div class="flex flex-col flex-1 min-w-0">
                  <div class="text-lg font-medium text-[var(--text-primary)]">
                    {asset.name}
                  </div>
                  <div class="text-base text-[var(--text-muted)]">
                    {asset.symbol}
                  </div>
                </div>

                {/* Balance - aligned right */}
                <div class="flex flex-col items-end flex-shrink-0">
                  <div class="text-lg font-medium text-[var(--text-primary)]">
                    {asset.balanceUSD}
                  </div>
                  <div class="text-base text-[var(--text-muted)]">
                    {asset.amount}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
