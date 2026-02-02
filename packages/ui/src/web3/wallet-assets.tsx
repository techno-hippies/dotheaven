import type { Component, JSX } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { WalletAddress } from './wallet-address'

export interface WalletAsset {
  id: string
  name: string
  symbol: string
  icon: string | JSX.Element
  chainBadge?: string | JSX.Element
  balance: string
  balanceUSD: string
  amount: string
}

export interface ConnectedWallet {
  address: string
  ensName?: string
  ensAvatar?: string
  assets?: WalletAsset[]
  totalBalance?: string
}

export interface WalletAssetsProps {
  class?: string
  address: string
  totalBalance: string
  assets: WalletAsset[]
  connectedWallet?: ConnectedWallet
  onSend?: () => void
  onReceive?: () => void
}

/** Reusable asset row */
const AssetRow: Component<{ asset: WalletAsset }> = (props) => (
  <div class="flex items-center gap-6 p-5 rounded-md bg-[var(--bg-elevated)] w-full cursor-default">
    <div class="flex-shrink-0 relative">
      {typeof props.asset.icon === 'string' ? (
        <Avatar src={props.asset.icon} alt={props.asset.name} size="xl" shape="circle" />
      ) : (
        <div class="w-16 h-16 flex items-center justify-center bg-[var(--bg-elevated)] rounded-full">
          {props.asset.icon}
        </div>
      )}
      {props.asset.chainBadge && (
        <div class="absolute -bottom-1 -right-1 w-7 h-7 bg-[var(--bg-elevated)] rounded-md flex items-center justify-center border-2 border-[var(--bg-surface)]">
          {typeof props.asset.chainBadge === 'string' ? (
            <img src={props.asset.chainBadge} alt="chain" class="w-5 h-5" />
          ) : (
            <div class="w-5 h-5 flex items-center justify-center">{props.asset.chainBadge}</div>
          )}
        </div>
      )}
    </div>
    <div class="flex flex-col flex-1 min-w-0">
      <div class="text-lg font-medium text-[var(--text-primary)]">{props.asset.name}</div>
      <div class="text-base text-[var(--text-muted)]">{props.asset.symbol}</div>
    </div>
    <div class="flex flex-col items-end flex-shrink-0">
      <div class="text-lg font-medium text-[var(--text-primary)]">{props.asset.balanceUSD}</div>
      <div class="text-base text-[var(--text-muted)]">{props.asset.amount}</div>
    </div>
  </div>
)

/** Single wallet view (balance, address, actions, assets) */
const WalletView: Component<{
  address: string
  totalBalance: string
  assets: WalletAsset[]
  onSend?: () => void
  onReceive?: () => void
}> = (props) => (
  <>
    {/* Header with balance */}
    <div class="flex flex-col items-center gap-6 py-12">
      <div class="flex flex-col items-center gap-3">
        <div class="text-sm text-[var(--text-muted)]">Total Balance</div>
        <div class="text-6xl font-bold text-[var(--text-primary)]">{props.totalBalance}</div>
      </div>
      <WalletAddress address={props.address} variant="compact" class="w-full max-w-lg" />
    </div>

    {/* Action buttons */}
    <div class="flex items-center justify-center gap-4 pb-12">
      <Button onClick={props.onSend} class="gap-2 w-40">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M7 17L17 7M17 7H7M17 7v10"/>
        </svg>
        Send
      </Button>
      <Button onClick={props.onReceive} variant="secondary" class="gap-2 w-40">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 7L7 17M7 17h10M7 17V7"/>
        </svg>
        Receive
      </Button>
    </div>

    {/* Assets */}
    <div class="flex flex-col w-full">
      <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-4">Assets</h2>
      <Show when={props.assets.length > 0} fallback={
        <div class="text-center py-8 text-[var(--text-muted)]">No assets found</div>
      }>
        <div class="flex flex-col gap-3">
          <For each={props.assets}>
            {(asset) => <AssetRow asset={asset} />}
          </For>
        </div>
      </Show>
    </div>
  </>
)

/**
 * WalletAssets component - displays wallet balance and asset list
 * When connectedWallet is provided, shows tabs to switch between Heaven (PKP) and Wallet (EOA)
 */
export const WalletAssets: Component<WalletAssetsProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'heaven' | 'wallet'>('heaven')

  return (
    <div class={cn('flex flex-col w-full max-w-4xl mx-auto min-h-screen px-8', props.class)}>
      {/* Tabs - only shown for EOA users */}
      <Show when={props.connectedWallet}>
        <div class="flex items-center gap-1 mx-auto mt-6 p-1 rounded-md bg-[var(--bg-elevated)]">
          <button
            class={cn(
              'px-6 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab() === 'heaven'
                ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            onClick={() => setActiveTab('heaven')}
          >
            Embedded
          </button>
          <button
            class={cn(
              'px-6 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab() === 'wallet'
                ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            onClick={() => setActiveTab('wallet')}
          >
            EOA
          </button>
        </div>
      </Show>

      {/* Heaven tab (or only view for passkey users) */}
      <Show when={!props.connectedWallet || activeTab() === 'heaven'}>
        <WalletView
          address={props.address}
          totalBalance={props.totalBalance}
          assets={props.assets}
          onSend={props.onSend}
          onReceive={props.onReceive}
        />
      </Show>

      {/* Wallet tab (EOA) */}
      <Show when={props.connectedWallet && activeTab() === 'wallet'}>
        {(() => {
          const w = props.connectedWallet!
          return (
            <WalletView
              address={w.address}
              totalBalance={w.totalBalance || '$—'}
              assets={w.assets || []}
              onSend={props.onSend}
              onReceive={props.onReceive}
            />
          )
        })()}
      </Show>
    </div>
  )
}
