import type { Component, JSX } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { cn } from '../lib/classnames'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { IconButton } from '../primitives/icon-button'
import { ArrowUpRight, ArrowDownLeft, Copy, Check } from '../icons'

export interface WalletAsset {
  id: string
  name: string
  symbol: string
  icon: string | JSX.Element
  chainBadge?: JSX.Element
  balance: string
  balanceUSD: string
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

function shortenAddress(addr: string) {
  if (addr.length <= 13) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Reusable asset row */
const AssetRow: Component<{ asset: WalletAsset }> = (props) => (
  <div class="flex items-center gap-3 px-4 py-2.5 w-full hover:bg-[var(--bg-highlight-hover)] transition-colors">
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
      <div class="text-base text-[var(--text-muted)]">{props.asset.balance}</div>
    </div>
  </div>
)

/** Compact balance card with address + actions */
const BalanceCard: Component<{
  address: string
  totalBalance: string
  readOnly?: boolean
  onSend?: () => void
  onReceive?: () => void
}> = (props) => {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 mt-4">
      {/* Balance */}
      <div class="flex flex-col gap-1 mb-4">
        <div class="text-base text-[var(--text-muted)] uppercase tracking-wider">Total Balance</div>
        <div class="text-3xl font-bold text-[var(--text-primary)]">{props.totalBalance}</div>
      </div>

      {/* Address row */}
      <div class="flex items-center gap-2 mb-4">
        <span class="text-base font-mono text-[var(--text-muted)]">
          {shortenAddress(props.address)}
        </span>
        <IconButton
          onClick={handleCopy}
          variant="soft"
          size="md"
          aria-label={copied() ? 'Copied!' : 'Copy address'}
        >
          {copied() ? <Check class="w-5 h-5" /> : <Copy class="w-5 h-5" />}
        </IconButton>
      </div>

      {/* Action buttons */}
      <Show when={!props.readOnly}>
        <div class="flex items-center gap-3">
          <Button onClick={props.onReceive} class="gap-2 flex-1">
            <ArrowDownLeft class="w-5 h-5" />
            Receive
          </Button>
          <Button onClick={props.onSend} variant="secondary" class="gap-2 flex-1">
            <ArrowUpRight class="w-5 h-5" />
            Send
          </Button>
        </div>
      </Show>
    </div>
  )
}

/** Single wallet view (balance card + assets list) */
const WalletView: Component<{
  address: string
  totalBalance: string
  assets: WalletAsset[]
  readOnly?: boolean
  onSend?: () => void
  onReceive?: () => void
}> = (props) => (
  <>
    <BalanceCard
      address={props.address}
      totalBalance={props.totalBalance}
      readOnly={props.readOnly}
      onSend={props.onSend}
      onReceive={props.onReceive}
    />

    {/* Assets list */}
    <div class="flex flex-col w-full mt-6">
      <div class="flex items-center justify-between px-4 mb-2">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Assets</h2>
      </div>
      <Show when={props.assets.length > 0} fallback={
        <div class="text-center py-8 text-[var(--text-muted)]">No assets found</div>
      }>
        <div class="flex flex-col divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] overflow-hidden">
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
        <div class="flex items-center gap-1 mx-auto mt-4 p-1 rounded-full bg-[var(--bg-elevated)]">
          <button
            class={cn(
              'px-6 py-2 rounded-full text-base font-medium transition-colors',
              activeTab() === 'heaven'
                ? 'bg-[var(--bg-highlight-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            onClick={() => setActiveTab('heaven')}
          >
            Embedded
          </button>
          <button
            class={cn(
              'px-6 py-2 rounded-full text-base font-medium transition-colors',
              activeTab() === 'wallet'
                ? 'bg-[var(--bg-highlight-hover)] text-[var(--text-primary)]'
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
