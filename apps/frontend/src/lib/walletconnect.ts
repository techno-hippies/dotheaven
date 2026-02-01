/**
 * WalletConnect provider for Tauri desktop app.
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
  // Reuse active session if provider is still connected
  if (activeProvider && activeProvider.session && activeWalletClient) {
    console.log('[WC] Reusing active WalletConnect session')
    return activeWalletClient
  }

  const { EthereumProvider } = await import('@walletconnect/ethereum-provider')

  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [1], // mainnet — needed for SIWE
    showQrModal: true,
    metadata: {
      name: 'Heaven',
      description: 'Heaven Desktop App',
      url: 'https://dotheaven.org',
      icons: ['https://dotheaven.org/images/heaven.png'],
    },
  })

  await provider.enable()
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

  // Invalidate cached client on account/chain change or disconnect
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
