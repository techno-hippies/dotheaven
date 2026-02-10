import type { Component } from 'solid-js'
import { createMemo, createEffect, onMount } from 'solid-js'
import { createStore } from 'solid-js/store'
import { createQuery } from '@tanstack/solid-query'
import { WalletAssets, PageHeader, type ConnectedWallet } from '@heaven/ui'
import { useI18n } from '@heaven/i18n/solid'
import { useAuth } from '../providers'
import { getEnsProfile } from '../lib/heaven/avatar-resolver'
import {
  CHAINS,
  getNativeBalance,
  getErc20Balance,
} from '../lib/web3'
import { ASSET_CONFIGS, type AssetConfig } from '../lib/wallet-assets'

// ============ Types ============
type AssetStatus = 'idle' | 'refreshing' | 'error'

interface AssetState {
  formatted?: string
  usd?: number
  updatedAt?: number
  status: AssetStatus
  error?: string
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

        if (isNative) {
          const result = await getNativeBalance(chain, pkp as `0x${string}`)
          formatted = result.formatted
        } else if (tokenAddress) {
          const result = await getErc20Balance(chain, tokenAddress as `0x${string}`, pkp as `0x${string}`)
          formatted = result.formatted
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
    if (!pkp) return

    const toRefresh: AssetConfig[] = []

    // Hydrate all assets from cache first
    for (const config of ASSET_CONFIGS) {
      const cached = readCache(pkp, config.key)
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

  // EOA / ENS data for connected wallet tab
  const eoaAddr = () => auth.eoaAddress()
  const ensQuery = createQuery(() => ({
    queryKey: ['ensProfile', eoaAddr()],
    queryFn: () => getEnsProfile(eoaAddr()!),
    get enabled() { return !!eoaAddr() },
    staleTime: 1000 * 60 * 30,
  }))

  // EOA balances (same assets as embedded wallet)
  const [eoaAssets, setEoaAssets] = createStore<Record<string, AssetState>>({})
  const EOA_ASSET_CONFIGS = ASSET_CONFIGS

  createEffect(() => {
    const eoa = eoaAddr()
    if (!eoa) return
    for (const config of EOA_ASSET_CONFIGS) {
      const cached = readCache(eoa, config.key)
      if (cached) {
        setEoaAssets(config.key, cached)
      } else {
        setEoaAssets(config.key, { status: 'idle' })
      }
      if (!cached?.formatted || isStale(cached.updatedAt)) {
        const { key, chainKey, isNative, tokenAddress, priceUsd } = config
        ;(async () => {
          setEoaAssets(key, (prev) => ({ ...prev, status: 'refreshing' as AssetStatus }))
          try {
            const chain = CHAINS[chainKey]
            let formatted: string
            if (isNative) {
              const result = await getNativeBalance(chain, eoa as `0x${string}`)
              formatted = result.formatted
            } else if (tokenAddress) {
              const result = await getErc20Balance(chain, tokenAddress as `0x${string}`, eoa as `0x${string}`)
              formatted = result.formatted
            } else {
              throw new Error('Invalid asset config')
            }
            const numericBalance = parseFloat(formatted)
            const next: AssetState = {
              formatted,
              usd: numericBalance * priceUsd,
              updatedAt: Date.now(),
              status: 'idle',
            }
            setEoaAssets(key, next)
            writeCache(eoa, key, next)
          } catch (e: any) {
            setEoaAssets(key, (prev) => ({ ...prev, status: 'error' as AssetStatus, error: String(e?.message ?? e) }))
          }
        })()
      }
    }
  })

  const eoaWalletAssets = createMemo(() =>
    EOA_ASSET_CONFIGS.map((config) => {
      const state = eoaAssets[config.key]
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
        balanceUSD: formatted ? `$${usd.toFixed(2)}` : '$—',
      }
    })
  )

  const eoaTotalUSD = createMemo(() => {
    const values = Object.values(eoaAssets)
      .map((a) => a.usd)
      .filter((v): v is number => v !== undefined && !isNaN(v))
    if (values.length === 0) return '$—'
    const sum = values.reduce((s, u) => s + u, 0)
    return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  })

  const connectedWallet = createMemo((): ConnectedWallet | undefined => {
    const eoa = eoaAddr()
    if (!eoa) return undefined
    const ens = ensQuery.data
    return {
      address: eoa,
      ensName: ens?.name ?? undefined,
      ensAvatar: ens?.avatar ?? undefined,
      assets: eoaWalletAssets(),
      totalBalance: eoaTotalUSD(),
    }
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
        balanceUSD: formatted ? `$${usd.toFixed(2)}` : '$—',
        // For potential UI indicators
        _status: state?.status ?? 'idle',
        _error: state?.error,
      }
    })
  })

  // Zero-state assets for unauthenticated users
  const zeroAssets = createMemo(() =>
    ASSET_CONFIGS.map((config) => ({
      id: config.id,
      name: config.name,
      symbol: config.symbol,
      icon: <config.icon />,
      chainBadge: <config.chainBadge />,
      balance: '0.0000',
      balanceUSD: '$0.00',
      _status: 'idle' as const,
    }))
  )

  const { t } = useI18n()

  return (
    <div class="h-full overflow-y-auto">
      <PageHeader title={t('nav.wallet')} />
      <WalletAssets
        address={auth.pkpAddress() || '0x0000000000000000000000000000000000000000'}
        totalBalance={auth.isAuthenticated() ? totalBalanceUSD() : '$0.00'}
        assets={auth.isAuthenticated() ? walletAssets() : zeroAssets()}
        connectedWallet={connectedWallet()}
        onSend={() => console.log('Send clicked')}
        onReceive={() => console.log('Receive clicked')}
      />
    </div>
  )
}
