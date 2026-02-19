import type { Component } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { WalletAssets, type WalletAsset } from '@heaven/ui'
import { ASSET_CONFIGS } from '../lib/wallet-assets'
import { CHAINS, getNativeBalance, getErc20Balance } from '../lib/web3'

/** Wallet tab content — fetches balances for any address (read-only) */
export const ProfileWalletTab: Component<{ address: string }> = (props) => {
  const balancesQuery = createQuery(() => ({
    queryKey: ['walletBalances', props.address],
    queryFn: async () => {
      const results = await Promise.allSettled(
        ASSET_CONFIGS.map(async (config) => {
          const chain = CHAINS[config.chainKey]
          let formatted: string
          if (config.isNative) {
            const result = await getNativeBalance(chain, props.address as `0x${string}`)
            formatted = result.formatted
          } else {
            const result = await getErc20Balance(chain, config.tokenAddress! as `0x${string}`, props.address as `0x${string}`)
            formatted = result.formatted
          }
          const num = parseFloat(formatted)
          return { key: config.key, formatted, usd: num * config.priceUsd }
        })
      )
      const map: Record<string, { formatted: string; usd: number }> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') map[ASSET_CONFIGS[i].key] = r.value
      })
      return map
    },
    get enabled() { return !!props.address },
    staleTime: 30_000,
  }))

  const assets = (): WalletAsset[] =>
    ASSET_CONFIGS.map((config) => {
      const data = balancesQuery.data?.[config.key]
      const num = data ? parseFloat(data.formatted) : 0
      const usd = data?.usd ?? 0
      return {
        id: config.id,
        name: config.name,
        symbol: config.symbol,
        icon: <config.icon />,
        chainBadge: <config.chainBadge />,
        balance: data ? num.toFixed(4) : '—',
        balanceUSD: data ? `$${usd.toFixed(2)}` : '$—',
      }
    })

  const totalUsd = () => {
    if (!balancesQuery.data) return '$—'
    const sum = Object.values(balancesQuery.data).reduce((s, v) => s + v.usd, 0)
    return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <WalletAssets
      address={props.address}
      totalBalance={totalUsd()}
      assets={assets()}
      readOnly
    />
  )
}
