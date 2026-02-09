/**
 * WalletConnect v2 for React Native.
 * Creates a WalletConnect EIP-1193 provider that deeplinks to mobile wallets
 * (MetaMask, Rainbow, Trust, etc.), then wraps it in a viem WalletClient.
 */

import { Linking } from 'react-native';
import { createWalletClient, custom, getAddress } from 'viem';
import { mainnet } from 'viem/chains';
import type { WalletClient } from 'viem';

const PROJECT_ID = 'ce42103ef9ca7f760e736b44f32e20b7';

let activeProvider: any = null;
let activeWalletClient: WalletClient | null = null;

/**
 * Connect via WalletConnect.
 * Opens the user's mobile wallet (MetaMask, Rainbow, etc.) via deeplink.
 * Returns a viem WalletClient ready for SIWE signing.
 */
export async function connectWalletConnect(): Promise<WalletClient> {
  // Reuse active in-memory session
  if (activeProvider?.session && activeWalletClient) {
    console.log('[WC] Reusing active WalletConnect session');
    return activeWalletClient;
  }

  console.log('[WC] Importing EthereumProvider...');
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [1],
    showQrModal: false, // No QR modal in RN — we handle deeplinks
    metadata: {
      name: 'Heaven',
      description: 'Heaven Mobile App',
      url: 'https://dotheaven.org',
      icons: ['https://dotheaven.org/images/heaven.png'],
    },
  });

  // If provider restored a session from storage, reuse it
  if (provider.session) {
    console.log('[WC] Restored existing session for', provider.accounts[0]);
    activeProvider = provider;
    const checksummedAddress = getAddress(provider.accounts[0]);
    activeWalletClient = createWalletClient({
      account: checksummedAddress,
      chain: mainnet,
      transport: custom(provider),
    });
    return activeWalletClient;
  }

  console.log('[WC] No existing session, initiating new connection...');

  // When WalletConnect generates a URI, open the wallet via deeplink
  provider.on('display_uri', (uri: string) => {
    console.log('[WC] display_uri fired, opening wallet...');
    // Universal deeplink — opens whichever wallet the user has installed
    // Most wallets register for the wc: URI scheme
    Linking.openURL(uri).catch((err) => {
      console.error('[WC] Failed to open wallet:', err);
    });
  });

  provider.on('connect', () => console.log('[WC] connect event fired'));
  provider.on('disconnect', () => {
    console.log('[WC] disconnect event fired');
    activeProvider = null;
    activeWalletClient = null;
  });

  // Enable with timeout
  const enablePromise = provider.enable();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('WalletConnect timed out after 60s — please try again')),
      60_000
    )
  );
  await Promise.race([enablePromise, timeoutPromise]);
  console.log('[WC] enable() resolved, connected');
  activeProvider = provider;

  const accounts = provider.accounts;
  if (!accounts.length) {
    throw new Error('No accounts returned from WalletConnect');
  }

  const checksummedAddress = getAddress(accounts[0]);

  const walletClient = createWalletClient({
    account: checksummedAddress,
    chain: mainnet,
    transport: custom(provider),
  });

  activeWalletClient = walletClient;

  const invalidateCache = () => {
    activeProvider = null;
    activeWalletClient = null;
  };
  provider.on('disconnect', invalidateCache);
  provider.on('accountsChanged', invalidateCache);
  provider.on('chainChanged', invalidateCache);

  return walletClient;
}

/**
 * Disconnect active WalletConnect session.
 */
export async function disconnectWalletConnect(): Promise<void> {
  if (activeProvider) {
    try {
      await activeProvider.disconnect();
    } catch {
      // ignore disconnect errors
    }
    activeProvider = null;
    activeWalletClient = null;
  }
}
