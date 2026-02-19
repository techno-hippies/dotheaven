import type { Component } from 'solid-js'
import { createMemo, createEffect, createSignal, onMount, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { createQuery } from '@tanstack/solid-query'
import {
  WalletAssets,
  PageHeader,
  type ConnectedWallet,
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@heaven/ui'
import { useI18n } from '@heaven/i18n/solid'
import { useAuth } from '../providers'
import { addToast, updateToast } from '../lib/toast'
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
const DEFAULT_TEMPO_KEY_MANAGER_URL = 'https://keys.tempo.xyz'
const DEFAULT_TEMPO_FEE_PAYER_URL = 'https://sponsor.moderato.tempo.xyz'
const DEFAULT_TEMPO_CHAIN_ID = 42431
const DEFAULT_TEMPO_PAYMENT_TOKEN = '0x20c0000000000000000000000000000000000001' as const
const DEFAULT_TEMPO_PAYMENT_DECIMALS = 6

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

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function extractTxHash(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== 'object') return undefined
  const value = receipt as { transactionHash?: unknown; hash?: unknown }
  if (typeof value.transactionHash === 'string') return value.transactionHash
  if (typeof value.hash === 'string') return value.hash
  return undefined
}

// ============ Component ============
export const WalletPage: Component = () => {
  const auth = useAuth()
  const embeddedAddress = () => auth.pkpAddress() ?? auth.eoaAddress()
  const canUseWalletActions = () => auth.isAuthenticated() || !!auth.tempoSession()
  const tempoKeyManagerUrl =
    import.meta.env.VITE_TEMPO_KEY_MANAGER_URL || DEFAULT_TEMPO_KEY_MANAGER_URL
  const tempoFeePayerUrl =
    import.meta.env.VITE_TEMPO_FEE_PAYER_URL || DEFAULT_TEMPO_FEE_PAYER_URL
  const tempoChainId = parseNumberEnv(
    import.meta.env.VITE_TEMPO_CHAIN_ID,
    DEFAULT_TEMPO_CHAIN_ID
  )
  const tempoRpId = import.meta.env.VITE_TEMPO_RP_ID || window.location.hostname
  const tempoPaymentDecimals = Math.max(
    0,
    parseNumberEnv(
      import.meta.env.VITE_TEMPO_PAYMENT_DECIMALS,
      DEFAULT_TEMPO_PAYMENT_DECIMALS
    )
  )
  const tempoPaymentTokenRaw =
    import.meta.env.VITE_TEMPO_PAYMENT_TOKEN || DEFAULT_TEMPO_PAYMENT_TOKEN
  const tempoPaymentToken: `0x${string}` = isHexAddress(tempoPaymentTokenRaw)
    ? tempoPaymentTokenRaw
    : DEFAULT_TEMPO_PAYMENT_TOKEN

  // Store for each asset's state
  const [assets, setAssets] = createStore<Record<string, AssetState>>({})
  const [sendDialogOpen, setSendDialogOpen] = createSignal(false)
  const [sendRecipient, setSendRecipient] = createSignal('')
  const [sendAmount, setSendAmount] = createSignal('100')
  const [isSubmittingSend, setIsSubmittingSend] = createSignal(false)
  const [sendError, setSendError] = createSignal<string | null>(null)

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
    const address = embeddedAddress()
    if (!address) return

    const toRefresh: AssetConfig[] = []

    // Hydrate all assets from cache first
    for (const config of ASSET_CONFIGS) {
      const cached = readCache(address, config.key)
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
      refreshAsset(config, address)
    }
  })

  // Refresh on window focus if stale
  onMount(() => {
    const handleFocus = () => {
      const address = embeddedAddress()
      if (!address) return

      for (const config of ASSET_CONFIGS) {
        const state = assets[config.key]
        if (isStale(state?.updatedAt)) {
          refreshAsset(config, address)
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

  function openSendDialog() {
    if (!canUseWalletActions()) {
      addToast('Sign in before sending funds.', 'error')
      return
    }
    setSendError(null)
    setSendRecipient(eoaAddr() || '0xbeefcafe54750903ac1c8909323af7beb21ea2cb')
    setSendAmount('100')
    setSendDialogOpen(true)
  }

  function handleSendDialogOpenChange(open: boolean) {
    if (!open && isSubmittingSend()) return
    setSendDialogOpen(open)
    if (!open) setSendError(null)
  }

  async function submitSponsoredSend(event: Event) {
    event.preventDefault()
    if (isSubmittingSend()) return

    const recipient = sendRecipient().trim()
    if (!isHexAddress(recipient)) {
      setSendError('Recipient must be a valid 0x address.')
      return
    }

    const amountNormalized = sendAmount().trim()
    if (!amountNormalized) {
      setSendError('Amount is required.')
      return
    }

    setSendError(null)
    setIsSubmittingSend(true)
    const toastId = addToast('Preparing sponsored transaction...', 'info', 0)

    try {
      const [{ sendSponsoredTokenTransfer }, { parseUnits }] = await Promise.all([
        import('../lib/tempo'),
        import('viem'),
      ])

      let amount: bigint
      try {
        amount = parseUnits(amountNormalized, tempoPaymentDecimals)
      } catch {
        throw new Error('Amount is invalid for the configured token decimals.')
      }

      if (amount <= 0n) {
        throw new Error('Amount must be greater than zero.')
      }

      const session = await auth.ensureTempoSession({
        chainId: tempoChainId,
        feePayerUrl: tempoFeePayerUrl,
        keyManagerUrl: tempoKeyManagerUrl,
        rpId: tempoRpId,
      })

      const result = await sendSponsoredTokenTransfer({
        amount,
        chainId: session.chainId,
        credentialId: session.credentialId,
        feePayerUrl: session.feePayerUrl,
        publicKey: session.publicKey,
        rpId: session.rpId,
        to: recipient,
        token: tempoPaymentToken,
      })

      const txHash = extractTxHash(result.receipt)
      if (txHash) {
        updateToast(toastId, `Sponsored send submitted (${shortHash(txHash)}).`, 'success', 6000)
      } else {
        updateToast(toastId, 'Sponsored send submitted.', 'success', 6000)
      }

      setSendDialogOpen(false)
      const address = embeddedAddress()
      if (address) {
        for (const config of ASSET_CONFIGS) {
          void refreshAsset(config, address)
        }
      }
    } catch (error: any) {
      console.error('[Wallet] Sponsored send failed:', error)
      const message = error instanceof Error ? error.message : 'Sponsored send failed.'
      setSendError(message)
      updateToast(toastId, `Sponsored send failed: ${message}`, 'error', 6000)
    } finally {
      setIsSubmittingSend(false)
    }
  }

  async function handleReceiveAddress() {
    const address = embeddedAddress() || auth.tempoSession()?.walletAddress
    if (!address) {
      addToast('No wallet address available.', 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(address)
      addToast('Wallet address copied.', 'success')
    } catch (error) {
      console.error('[Wallet] Failed to copy wallet address:', error)
      addToast('Failed to copy wallet address.', 'error')
    }
  }

  return (
    <div class="h-full overflow-y-auto">
      {/* Header — full-width border, content constrained */}
      <div class="border-b border-[var(--border-subtle)]">
        <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
          <PageHeader title={t('nav.wallet')} class="border-b-0 !px-0" />
        </div>
      </div>
      {/* Content — constrained */}
      <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
        <WalletAssets
          address={embeddedAddress() || '0x0000000000000000000000000000000000000000'}
          totalBalance={auth.isAuthenticated() ? totalBalanceUSD() : '$0.00'}
          assets={auth.isAuthenticated() ? walletAssets() : zeroAssets()}
          readOnly={!canUseWalletActions()}
          connectedWallet={connectedWallet()}
          onSend={() => {
            openSendDialog()
          }}
          onReceive={() => {
            void handleReceiveAddress()
          }}
        />
      </div>
      <Dialog open={sendDialogOpen()} onOpenChange={handleSendDialogOpenChange}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Sponsored Payment</DialogTitle>
            <DialogDescription>
              Token: {tempoPaymentToken}. Fees are sponsored by {tempoFeePayerUrl}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form id="sponsored-send-form" class="flex flex-col gap-3" onSubmit={(event) => {
              void submitSponsoredSend(event)
            }}>
              <div class="flex flex-col gap-1">
                <label class="text-sm text-[var(--text-secondary)]" for="send-recipient">Recipient address</label>
                <input
                  id="send-recipient"
                  type="text"
                  value={sendRecipient()}
                  onInput={(event) => setSendRecipient(event.currentTarget.value)}
                  placeholder="0x..."
                  class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                  autocomplete="off"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm text-[var(--text-secondary)]" for="send-amount">Amount</label>
                <input
                  id="send-amount"
                  type="text"
                  value={sendAmount()}
                  onInput={(event) => setSendAmount(event.currentTarget.value)}
                  placeholder="100"
                  inputmode="decimal"
                  class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                  autocomplete="off"
                />
              </div>
              <Show when={sendError()}>
                <p class="text-sm text-red-400">{sendError()}</p>
              </Show>
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(props: Record<string, unknown>) => (
                <Button {...props} variant="secondary" disabled={isSubmittingSend()}>
                  Cancel
                </Button>
              )}
            />
            <Button
              form="sponsored-send-form"
              type="submit"
              loading={isSubmittingSend()}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
