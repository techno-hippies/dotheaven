import { createWalletClient, custom, getAddress, type WalletClient } from 'viem'
import { mainnet } from 'viem/chains'
import { getLitClient, getAuthManager } from './client'
import { cacheEoaAuthContext } from './auth-pkp'
import type { PKPInfo, AuthData } from './types'

// Relayer API for sponsored PKP minting (free on naga-dev)
const LIT_SPONSORSHIP_API_URL =
  import.meta.env.VITE_LIT_SPONSORSHIP_API_URL || 'https://lit-sponsorship-api.vercel.app'

/**
 * Connect to an injected wallet (MetaMask, Rabby, etc.) via window.ethereum.
 * Returns a viem WalletClient with account set for use with Lit's WalletClientAuthenticator.
 */
/**
 * Connect to an injected wallet (MetaMask, Rabby, etc.) via window.ethereum.
 * Returns a viem WalletClient with account set for use with Lit's WalletClientAuthenticator.
 */
async function getInjectedWalletClient() {
  const ethereum = (window as any).ethereum
  if (!ethereum) {
    throw new Error('No wallet extension found. Please install MetaMask or another Ethereum wallet.')
  }

  // Request account access
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
  if (!accounts.length) {
    throw new Error('No accounts available. Please unlock your wallet.')
  }

  // IMPORTANT: Must use getAddress() to properly checksum the address for SIWE
  // ethereum.request returns lowercase addresses, but SIWE requires EIP-55 checksummed addresses
  const checksummedAddress = getAddress(accounts[0])

  const walletClient = createWalletClient({
    account: checksummedAddress,
    chain: mainnet,
    transport: custom(ethereum),
  })

  return walletClient
}

/**
 * Register new PKP with EOA wallet via relayer.
 * Relayer pays gas (free on naga-dev), user's EOA is added as auth method.
 */
export async function registerWithEOA(externalWalletClient?: WalletClient): Promise<{
  pkpInfo: PKPInfo
  authData: AuthData
}> {
  console.log('[Lit] Registering with EOA via relayer...')

  const walletClient = externalWalletClient ?? await getInjectedWalletClient()
  const address = walletClient.account?.address

  if (!address) {
    throw new Error('No account address in wallet client')
  }

  console.log('[Lit] Requesting PKP mint for EOA:', address)
  console.log('[Lit] Relayer URL:', LIT_SPONSORSHIP_API_URL)

  // Call relayer API to mint PKP (relayer pays gas - FREE on naga-dev)
  const response = await fetch(`${LIT_SPONSORSHIP_API_URL}/api/mint-user-pkp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress: address }),
  })

  console.log('[Lit] Relayer response status:', response.status)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[Lit] Relayer API error:', errorData)
    throw new Error(errorData.error || `Failed to mint PKP: ${response.status}`)
  }

  const data = await response.json()
  console.log('[Lit] PKP minted via relayer:', {
    existing: data.existing,
    pkpEthAddress: data.pkpEthAddress,
  })

  const pkpInfo: PKPInfo = {
    publicKey: data.pkpPublicKey,
    ethAddress: data.pkpEthAddress as `0x${string}`,
    tokenId: data.pkpTokenId,
  }

  // Create EOA Auth Context (NEW AUTH CONTEXT FLOW)
  // This handles SIWE message creation, wallet signing, and session capabilities
  console.log('[Lit] Creating EOA auth context...')
  console.log('[Lit] This will prompt your wallet to sign a SIWE message')
  const litClient = await getLitClient()
  const authManager = getAuthManager()

  console.log('[Lit] Requesting SIWE signature from wallet...')
  const eoaAuthContext = await authManager.createEoaAuthContext({
    config: { account: walletClient },
    authConfig: {
      domain: typeof window !== 'undefined' ? window.location.host : 'localhost',
      statement: 'Authorize Heaven session',
      resources: [
        ['pkp-signing', '*'],
        ['lit-action-execution', '*'],
        ['access-control-condition-decryption', '*'],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
    },
    litClient,
  })
  console.log('[Lit] ✓ SIWE signature received from wallet')

  console.log('[Lit] ✓ PKP registration complete')

  // DEBUG: Inspect full eoaAuthContext structure
  console.log('[Lit] EOA Auth Context keys:', Object.keys(eoaAuthContext))
  console.log('[Lit] EOA Auth Context full object:', eoaAuthContext)
  console.log('[Lit] EOA Auth Context.authData type:', typeof eoaAuthContext.authData)
  console.log('[Lit] EOA Auth Context.authData:', eoaAuthContext.authData)

  // Cache the ENTIRE eoaAuthContext for later use
  // This is critical - we must reuse the session key pair from this context
  cacheEoaAuthContext(pkpInfo.publicKey, eoaAuthContext)

  // Extract authData from EOA context
  const authData: AuthData = {
    ...eoaAuthContext.authData as AuthData,
  }

  console.log('[Lit] Registration authData keys:', Object.keys(authData))
  console.log('[Lit] Registration authData full:', authData)
  console.log('[Lit] Cached EOA auth context for PKP:', pkpInfo.publicKey)

  return { pkpInfo, authData }
}

/**
 * Sign in with an existing EOA wallet.
 * Authenticates via SIWE signature and looks up the associated PKP.
 */
export async function authenticateWithEOA(externalWalletClient?: WalletClient): Promise<{
  pkpInfo: PKPInfo
  authData: AuthData
}> {
  console.log('[Lit] Authenticating with EOA...')

  const walletClient = externalWalletClient ?? await getInjectedWalletClient()
  const address = walletClient.account?.address

  if (!address) {
    throw new Error('No account in wallet client')
  }

  // Create EOA Auth Context (NEW AUTH CONTEXT FLOW)
  console.log('[Lit] Creating EOA auth context...')
  const litClient = await getLitClient()
  const authManager = getAuthManager()

  const eoaAuthContext = await authManager.createEoaAuthContext({
    config: { account: walletClient },
    authConfig: {
      domain: typeof window !== 'undefined' ? window.location.host : 'localhost',
      statement: 'Authorize Heaven session',
      resources: [
        ['pkp-signing', '*'],
        ['lit-action-execution', '*'],
        ['access-control-condition-decryption', '*'],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
    },
    litClient,
  })

  // DEBUG: Inspect full eoaAuthContext structure
  console.log('[Lit] EOA Auth Context keys:', Object.keys(eoaAuthContext))
  console.log('[Lit] EOA Auth Context full object:', eoaAuthContext)
  console.log('[Lit] EOA Auth Context.authData type:', typeof eoaAuthContext.authData)
  console.log('[Lit] EOA Auth Context.authData:', eoaAuthContext.authData)

  // Extract authData from EOA context (needed for PKP lookup)
  const authData: AuthData = {
    ...eoaAuthContext.authData as AuthData,
  }

  // IMPORTANT: For EOA auth, authMethodId must be the lowercase address
  // The SIWE auth context generates a hash, but the relayer uses the address
  // We must use the address to find PKPs registered by the relayer
  const pkpsResult = await litClient.viewPKPsByAuthData({
    authData: {
      authMethodType: 1, // AUTH_METHOD_TYPE_ETH_WALLET
      authMethodId: address.toLowerCase(), // Use address, not SIWE hash
    },
    pagination: { limit: 5, offset: 0 },
  })

  console.log('[Lit] Found PKPs for EOA:', pkpsResult)

  if (!pkpsResult?.pkps?.length) {
    throw new Error('No PKP found for this wallet. Please register first.')
  }

  const pkp = pkpsResult.pkps[0]
  const pkpInfo: PKPInfo = {
    publicKey: pkp.pubkey,
    ethAddress: pkp.ethAddress as `0x${string}`,
    tokenId: pkp.tokenId.toString(),
  }

  // Cache the ENTIRE eoaAuthContext for later use
  // This is critical - we must reuse the session key pair from this context
  cacheEoaAuthContext(pkpInfo.publicKey, eoaAuthContext)

  console.log('[Lit] Using PKP:', pkpInfo.ethAddress)
  console.log('[Lit] Login authData keys:', Object.keys(authData))
  console.log('[Lit] Login authData full:', authData)
  console.log('[Lit] Cached EOA auth context for PKP:', pkpInfo.publicKey)

  return { pkpInfo, authData }
}
