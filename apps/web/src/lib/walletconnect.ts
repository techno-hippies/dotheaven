/**
 * WalletConnect provider for desktop clients.
 * Creates a WalletConnect EIP-1193 provider with QR modal,
 * wraps it in a viem WalletClient for use with Lit EOA auth.
 */

import { createWalletClient, custom, getAddress } from 'viem'
import { mainnet } from 'viem/chains'
import type { WalletClient } from 'viem'

const PROJECT_ID = 'ce42103ef9ca7f760e736b44f32e20b7'

let activeProvider: any = null
let activeWalletClient: WalletClient | null = null

/**
 * Connect via WalletConnect (shows QR modal).
 * Reuses an existing session if one is active.
 * Returns a viem WalletClient ready for Lit EOA auth.
 */
export async function connectWalletConnect(): Promise<WalletClient> {
  // Reuse active in-memory session
  if (activeProvider && activeProvider.session && activeWalletClient) {
    console.log('[WC] Reusing active WalletConnect session')
    return activeWalletClient
  }

  console.log('[WC] Importing EthereumProvider...')
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider')

  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [1],
    showQrModal: true,
    metadata: {
      name: 'Heaven',
      description: 'Heaven Desktop App',
      url: 'https://dotheaven.org',
      icons: ['https://dotheaven.org/images/heaven.png'],
    },
  })

  // If provider restored a session from storage, reuse it
  if (provider.session) {
    console.log('[WC] Restored existing session for', provider.accounts[0])
    activeProvider = provider
    const checksummedAddress = getAddress(provider.accounts[0])
    activeWalletClient = createWalletClient({
      account: checksummedAddress,
      chain: mainnet,
      transport: custom(provider),
    })
    return activeWalletClient
  }

  console.log('[WC] No existing session, showing QR...')

  provider.on('display_uri', (uri: string) => {
    console.log('[WC] display_uri fired, QR URI:', uri?.slice(0, 60) + '...')
  })
  provider.on('connect', () => console.log('[WC] connect event fired'))
  provider.on('disconnect', () => console.log('[WC] disconnect event fired'))

  // Timeout enable() — if relay is dead, don't hang forever
  const enablePromise = provider.enable()
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('WalletConnect timed out after 30s — relay may be down')), 30_000)
  )
  await Promise.race([enablePromise, timeoutPromise])
  console.log('[WC] enable() resolved, connected')
  activeProvider = provider

  const accounts = provider.accounts
  if (!accounts.length) {
    throw new Error('No accounts returned from WalletConnect')
  }

  const checksummedAddress = getAddress(accounts[0])

  const walletClient = createWalletClient({
    account: checksummedAddress,
    chain: mainnet,
    transport: custom(provider),
  })

  activeWalletClient = walletClient

  const invalidateCache = () => {
    activeProvider = null
    activeWalletClient = null
  }
  provider.on('disconnect', invalidateCache)
  provider.on('accountsChanged', invalidateCache)
  provider.on('chainChanged', invalidateCache)

  return walletClient
}

/**
 * Disconnect active WalletConnect session.
 */
export async function disconnectWalletConnect(): Promise<void> {
  if (activeProvider) {
    try {
      await activeProvider.disconnect()
    } catch {
      // ignore disconnect errors
    }
    activeProvider = null
    activeWalletClient = null
  }
}
