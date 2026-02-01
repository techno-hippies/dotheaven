import type { Component, JSX } from 'solid-js'
import { createMemo, createEffect, onMount, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { WalletAssets } from '@heaven/ui'
import { useAuth } from '../providers'
import {
  CHAINS,
  getNativeBalance,
  getErc20Balance,
  type ChainKey,
} from '../lib/web3'

// ============ Icons ============
const EthereumIcon = () => (
  <svg viewBox="0 0 32 32" class="w-12 h-12">
    <g fill="none" fill-rule="evenodd">
      <circle cx="16" cy="16" r="16" fill="#627EEA"/>
      <g fill="#FFF" fill-rule="nonzero">
        <path fill-opacity=".602" d="M16.498 4v8.87l7.497 3.35z"/>
        <path d="M16.498 4L9 16.22l7.498-3.35z"/>
        <path fill-opacity=".602" d="M16.498 21.968v6.027L24 17.616z"/>
        <path d="M16.498 27.995v-6.028L9 17.616z"/>
        <path fill-opacity=".2" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
        <path fill-opacity=".602" d="M9 16.22l7.498 4.353v-7.701z"/>
      </g>
    </g>
  </svg>
)

const MegaETHIcon = () => (
  <svg viewBox="0 0 100 100" class="w-12 h-12">
    <circle cx="50" cy="50" r="50" fill="#000"/>
    <circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" stroke-width="3"/>
    <text x="50" y="65" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">M</text>
    <circle cx="40" cy="75" r="3" fill="#fff"/>
    <circle cx="60" cy="75" r="3" fill="#fff"/>
  </svg>
)

const USDFCIcon = () => (
  <img src="/images/usdfc.png" alt="USDFC" class="w-12 h-12 object-contain" />
)

const USDMIcon = () => (
  <img src="/images/usdm.png" alt="USDM" class="w-12 h-12 object-contain" />
)

const FilecoinIcon = () => (
  <img src="/images/filecoin.png" alt="Filecoin" class="w-12 h-12 object-contain" />
)

// ============ Types ============
type AssetStatus = 'idle' | 'refreshing' | 'error'

interface AssetState {
  formatted?: string
  usd?: number
  updatedAt?: number
  status: AssetStatus
  error?: string
}

interface AssetConfig {
  id: string
  key: string
  name: string
  symbol: string
  chainKey: ChainKey
  icon: () => JSX.Element
  chainBadge: () => JSX.Element
  isNative: boolean
  tokenAddress?: string
  unitSymbol: string
  priceUsd: number // For testnets, mock prices
}

// ============ Cache Helpers ============
const CACHE_PREFIX = 'wallet_balances_v1'
const STALE_TIME_MS = 30_000 // 30 seconds
const TTL_MS = 10 * 60 * 1000 // 10 minutes

function cacheKey(pkp: string, assetKey: string) {
  return `${CACHE_PREFIX}:${pkp}:${assetKey}`
}

function readCache(pkp: string, assetKey: string): AssetState | null {
  try {
    const raw = localStorage.getItem(cacheKey(pkp, assetKey))
    if (!raw) return null
    const cached = JSON.parse(raw) as AssetState
    // Discard if too old
    if (cached.updatedAt && Date.now() - cached.updatedAt > TTL_MS) {
      localStorage.removeItem(cacheKey(pkp, assetKey))
      return null
    }
    return cached
  } catch {
    return null
  }
}

function writeCache(pkp: string, assetKey: string, value: AssetState) {
  try {
    localStorage.setItem(cacheKey(pkp, assetKey), JSON.stringify(value))
  } catch {}
}

function isStale(updatedAt?: number) {
  if (!updatedAt) return true
  return Date.now() - updatedAt > STALE_TIME_MS
}

// ============ Asset Definitions ============
const ASSET_CONFIGS: AssetConfig[] = [
  {
    id: 'fil-mainnet',
    key: 'fil:native',
    name: 'FIL',
    symbol: 'Filecoin',
    chainKey: 'fil',
    icon: FilecoinIcon,
    chainBadge: FilecoinIcon,
    isNative: true,
    unitSymbol: 'FIL',
    priceUsd: 5,
  },
  {
    id: 'usdfc-filecoin',
    key: 'fil:erc20:0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    name: 'USDFC',
    symbol: 'Filecoin',
    chainKey: 'fil',
    icon: USDFCIcon,
    chainBadge: FilecoinIcon,
    isNative: false,
    tokenAddress: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    unitSymbol: 'USDFC',
    priceUsd: 1,
  },
  {
    id: 'eth-sepolia',
    key: 'sepolia:native',
    name: 'ETH',
    symbol: 'Ethereum',
    chainKey: 'sepolia',
    icon: EthereumIcon,
    chainBadge: EthereumIcon,
    isNative: true,
    unitSymbol: 'ETH',
    priceUsd: 3090,
  },
  {
    id: 'eth-megaeth',
    key: 'mega:native',
    name: 'ETH',
    symbol: 'MegaETH',
    chainKey: 'mega',
    icon: EthereumIcon,
    chainBadge: MegaETHIcon,
    isNative: true,
    unitSymbol: 'ETH',
    priceUsd: 3090,
  },
  {
    id: 'usdm-megaeth',
    key: 'mega:erc20:0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7',
    name: 'USDM',
    symbol: 'MegaETH',
    chainKey: 'mega',
    icon: USDMIcon,
    chainBadge: MegaETHIcon,
    isNative: false,
    tokenAddress: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7',
    unitSymbol: 'USDM',
    priceUsd: 1,
  },
]

// ============ Component ============
export const WalletPage: Component = () => {
  const auth = useAuth()

  // Store for each asset's state
  const [assets, setAssets] = createStore<Record<string, AssetState>>({})

  // Track in-flight requests to dedupe
  const inflight = new Map<string, Promise<void>>()

  // Fetch a single asset
  async function refreshAsset(config: AssetConfig, pkp: string) {
    const { key, chainKey, isNative, tokenAddress, priceUsd } = config

    // Dedupe: if already fetching, return existing promise
    if (inflight.has(key)) return inflight.get(key)!

    // Mark as refreshing but keep existing values
    setAssets(key, (prev) => ({ ...prev, status: 'refreshing' as AssetStatus, error: undefined }))

    const promise = (async () => {
      try {
        const chain = CHAINS[chainKey]
        let formatted: string

        console.log(`[Wallet] Fetching ${key} for ${pkp}...`)

        if (isNative) {
          const result = await getNativeBalance(chain, pkp as `0x${string}`)
          formatted = result.formatted
          console.log(`[Wallet] ${key} native balance:`, result)
        } else if (tokenAddress) {
          const result = await getErc20Balance(chain, tokenAddress as `0x${string}`, pkp as `0x${string}`)
          formatted = result.formatted
          console.log(`[Wallet] ${key} token balance:`, result)
        } else {
          throw new Error('Invalid asset config')
        }

        const numericBalance = parseFloat(formatted)
        const usd = numericBalance * priceUsd

        const next: AssetState = {
          formatted,
          usd,
          updatedAt: Date.now(),
          status: 'idle',
        }
        console.log(`[Wallet] ${key} updated:`, next)
        setAssets(key, next)
        writeCache(pkp, key, next)
      } catch (e: any) {
        console.error(`[Wallet] Failed to fetch ${key}:`, e)
        setAssets(key, (prev) => ({
          ...prev,
          status: 'error' as AssetStatus,
          error: String(e?.message ?? e),
        }))
      } finally {
        inflight.delete(key)
      }
    })()

    inflight.set(key, promise)
    return promise
  }

  // Hydrate from cache and refresh stale data
  createEffect(() => {
    const pkp = auth.pkpAddress()
    console.log('[Wallet] pkpAddress:', pkp, 'isAuthenticated:', auth.isAuthenticated())
    if (!pkp) return

    const toRefresh: AssetConfig[] = []

    // Hydrate all assets from cache first
    for (const config of ASSET_CONFIGS) {
      const cached = readCache(pkp, config.key)
      console.log(`[Wallet] Cache for ${config.key}:`, cached)
      if (cached) {
        setAssets(config.key, cached)
      } else {
        setAssets(config.key, { status: 'idle' })
      }

      // Decide staleness from cache, not from reactive store
      if (!cached?.formatted || isStale(cached.updatedAt)) {
        toRefresh.push(config)
      }
    }

    console.log('[Wallet] Assets to refresh:', toRefresh.map(c => c.key))

    // Start refreshes
    for (const config of toRefresh) {
      refreshAsset(config, pkp)
    }
  })

  // Refresh on window focus if stale
  onMount(() => {
    const handleFocus = () => {
      const pkp = auth.pkpAddress()
      if (!pkp) return

      for (const config of ASSET_CONFIGS) {
        const state = assets[config.key]
        if (isStale(state?.updatedAt)) {
          refreshAsset(config, pkp)
        }
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  })

  // Derive total USD from all available balances
  const totalBalanceUSD = createMemo(() => {
    const values = Object.values(assets)
      .map((a) => a.usd)
      .filter((v): v is number => v !== undefined && !isNaN(v))

    if (values.length === 0) return '$—'

    const sum = values.reduce((s, u) => s + u, 0)
    return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  })

  // Build assets array for WalletAssets component
  const walletAssets = createMemo(() => {
    return ASSET_CONFIGS.map((config) => {
      const state = assets[config.key]
      const formatted = state?.formatted
      const numericBalance = formatted ? parseFloat(formatted) : 0
      const usd = state?.usd ?? 0

      return {
        id: config.id,
        name: config.name,
        symbol: config.symbol,
        icon: <config.icon />,
        chainBadge: <config.chainBadge />,
        balance: formatted ? numericBalance.toFixed(4) : '—',
        balanceUSD: formatted ? `$${usd.toFixed(2)}` : '$—', // Show $0.00 if we have data
        amount: formatted ? `${numericBalance.toFixed(4)} ${config.unitSymbol}` : `— ${config.unitSymbol}`,
        // For potential UI indicators
        _status: state?.status ?? 'idle',
        _error: state?.error,
      }
    })
  })

  return (
    <div class="h-full overflow-y-auto">
      <Show
        when={auth.isAuthenticated()}
        fallback={
            <div class="flex flex-col items-center justify-center min-h-[60vh] gap-6 py-8">
              <div class="text-center">
                <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2">
                  Sign In Required
                </h2>
                <p class="text-base text-[var(--text-secondary)]">
                  Please sign in with your passkey to view your wallet
                </p>
              </div>
            </div>
          }
        >
          <WalletAssets
            address={auth.pkpAddress() || '0x0000000000000000000000000000000000000000'}
            totalBalance={totalBalanceUSD()}
            assets={walletAssets()}
            onSend={() => console.log('Send clicked')}
            onReceive={() => console.log('Receive clicked')}
          />
        </Show>
    </div>
  )
}
