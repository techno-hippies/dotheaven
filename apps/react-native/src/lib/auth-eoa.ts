/**
 * EOA (Externally Owned Account) authentication for React Native.
 *
 * Flow:
 * 1. User taps "Sign Up" / "Log In"
 * 2. WalletConnect opens their mobile wallet (MetaMask, Rainbow, etc.)
 * 3. Wallet signs a SIWE message
 * 4. For registration: relayer mints a PKP (free, relayer pays gas)
 * 5. Auth data stored locally
 */

import { getAddress, type WalletClient } from 'viem';
import { connectWalletConnect } from './walletconnect';

const LIT_SPONSORSHIP_API_URL = 'https://lit-relayer.vercel.app';

export interface PKPInfo {
  publicKey: string;
  ethAddress: string;
  tokenId?: string;
}

export interface AuthData {
  authMethodType: number;
  authMethodId: string;
  accessToken?: string;
  [key: string]: any;
}

/**
 * Register a new PKP with an EOA wallet via WalletConnect.
 * Relayer pays gas (free on naga-dev), user's EOA is added as auth method.
 */
export async function registerWithEOA(): Promise<{
  pkpInfo: PKPInfo;
  authData: AuthData;
  eoaAddress: string;
}> {
  console.log('[Auth] Starting EOA registration via WalletConnect...');

  // Step 1: Connect wallet via WalletConnect deeplink
  const walletClient = await connectWalletConnect();
  const address = walletClient.account?.address;

  if (!address) {
    throw new Error('No account address from wallet');
  }

  console.log('[Auth] Connected wallet:', address);

  // Step 2: Call relayer to mint PKP (relayer pays gas)
  console.log('[Auth] Requesting PKP mint from relayer...');
  const response = await fetch(`${LIT_SPONSORSHIP_API_URL}/api/mint-user-pkp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress: address }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to mint PKP: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Auth] PKP minted:', {
    existing: data.existing,
    pkpEthAddress: data.pkpEthAddress,
  });

  const pkpInfo: PKPInfo = {
    publicKey: data.pkpPublicKey,
    ethAddress: data.pkpEthAddress,
    tokenId: data.pkpTokenId,
  };

  // Step 3: Create SIWE auth data
  // For mobile, we create a simplified auth data record.
  // The WalletClientAuthenticator from @lit-protocol/auth requires browser globals
  // that may not be available in RN. Instead, we sign a SIWE message directly
  // and store the auth method info.
  console.log('[Auth] Signing SIWE message...');
  const authData = await createSIWEAuthData(walletClient, address);

  console.log('[Auth] Registration complete');
  return { pkpInfo, authData, eoaAddress: address };
}

/**
 * Sign in with an existing EOA wallet.
 * Authenticates via SIWE signature and looks up the associated PKP.
 */
export async function authenticateWithEOA(): Promise<{
  pkpInfo: PKPInfo;
  authData: AuthData;
  eoaAddress: string;
}> {
  console.log('[Auth] Starting EOA authentication via WalletConnect...');

  // Step 1: Connect wallet via WalletConnect deeplink
  const walletClient = await connectWalletConnect();
  const address = walletClient.account?.address;

  if (!address) {
    throw new Error('No account address from wallet');
  }

  console.log('[Auth] Connected wallet:', address);

  // Step 2: Create SIWE auth data
  console.log('[Auth] Signing SIWE message...');
  const authData = await createSIWEAuthData(walletClient, address);

  // Step 3: Look up PKPs for this wallet via relayer
  // The relayer's mint endpoint returns existing PKP if one exists
  console.log('[Auth] Looking up PKP for wallet...');
  const response = await fetch(`${LIT_SPONSORSHIP_API_URL}/api/mint-user-pkp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress: address }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to lookup PKP: ${response.status}`);
  }

  const data = await response.json();

  if (!data.pkpPublicKey) {
    throw new Error('No PKP found for this wallet. Please register first.');
  }

  console.log('[Auth] Found PKP:', data.pkpEthAddress, data.existing ? '(existing)' : '(new)');

  const pkpInfo: PKPInfo = {
    publicKey: data.pkpPublicKey,
    ethAddress: data.pkpEthAddress,
    tokenId: data.pkpTokenId,
  };

  return { pkpInfo, authData, eoaAddress: address };
}

/**
 * Create SIWE auth data by signing a message with the wallet.
 * This creates the auth method data needed for Lit Protocol.
 */
async function createSIWEAuthData(
  walletClient: WalletClient,
  address: `0x${string}`
): Promise<AuthData> {
  const checksummedAddress = getAddress(address);
  const expiration = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days
  const nonce = Math.random().toString(36).slice(2);

  // SIWE message format (EIP-4361)
  const message = [
    `dotheaven.org wants you to sign in with your Ethereum account:`,
    checksummedAddress,
    '',
    'Authorize Heaven session',
    '',
    `URI: https://dotheaven.org`,
    `Version: 1`,
    `Chain ID: 1`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    `Expiration Time: ${expiration}`,
  ].join('\n');

  const signature = await walletClient.signMessage({
    account: checksummedAddress,
    message,
  });

  return {
    authMethodType: 1, // AUTH_METHOD_TYPE_ETH_WALLET
    authMethodId: address.toLowerCase(),
    accessToken: JSON.stringify({
      sig: signature,
      derivedVia: 'web3.eth.personal.sign',
      signedMessage: message,
      address: checksummedAddress,
    }),
  };
}
