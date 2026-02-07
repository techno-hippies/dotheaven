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
  chainBadge?: JSX.Element
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
  /** When true, hides Send/Receive buttons (for viewing someone else's wallet) */
  readOnly?: boolean
  onSend?: () => void
  onReceive?: () => void
}

/** Reusable asset row */
const AssetRow: Component<{ asset: WalletAsset }> = (props) => (
  <div class="flex items-center gap-3 px-4 py-3 w-full">
    <div class="flex-shrink-0">
      <Avatar
        src={typeof props.asset.icon === 'string' ? props.asset.icon : undefined}
        fallback={typeof props.asset.icon !== 'string' ? props.asset.icon : undefined}
        alt={props.asset.name}
        size="lg"
        shape="circle"
        badge={props.asset.chainBadge}
      />
    </div>
    <div class="flex flex-col flex-1 min-w-0">
      <div class="text-base font-medium text-[var(--text-primary)]">{props.asset.name}</div>
      <div class="text-base text-[var(--text-muted)]">{props.asset.symbol}</div>
    </div>
    <div class="flex flex-col items-end flex-shrink-0">
      <div class="text-base font-medium text-[var(--text-primary)]">{props.asset.balanceUSD}</div>
      <div class="text-base text-[var(--text-muted)]">{props.asset.amount}</div>
    </div>
  </div>
)

/** Single wallet view (balance, address, actions, assets) */
const WalletView: Component<{
  address: string
  totalBalance: string
  assets: WalletAsset[]
  readOnly?: boolean
  onSend?: () => void
  onReceive?: () => void
}> = (props) => (
  <>
    {/* Header with balance */}
    <div class="flex flex-col items-center gap-6 px-4 py-12">
      <div class="flex flex-col items-center gap-3">
        <div class="text-sm text-[var(--text-muted)]">Total Balance</div>
        <div class="text-6xl font-bold text-[var(--text-primary)]">{props.totalBalance}</div>
      </div>
      <WalletAddress address={props.address} variant="compact" class="w-full max-w-lg" />
    </div>

    {/* Action buttons — hidden in read-only mode */}
    <Show when={!props.readOnly}>
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
    </Show>

    {/* Assets */}
    <div class="flex flex-col w-full">
      <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2 px-4">Assets</h2>
      <Show when={props.assets.length > 0} fallback={
        <div class="text-center py-8 text-[var(--text-muted)]">No assets found</div>
      }>
        <div class="flex flex-col gap-1">
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
    <div class={cn('flex flex-col w-full max-w-4xl mx-auto', props.class)}>
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
          readOnly={props.readOnly}
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
              readOnly={props.readOnly}
              onSend={props.onSend}
              onReceive={props.onReceive}
            />
          )
        })()}
      </Show>
    </div>
  )
}
