import { createWalletClient, custom, getAddress, keccak256, stringToBytes, type WalletClient } from 'viem'
import { mainnet } from 'viem/chains'
import { WalletClientAuthenticator } from '@lit-protocol/auth'
import { getLitClient } from './client'
import { LIT_CONFIG } from './config'
import type { PKPInfo, AuthData } from './types'

// Relayer API for sponsored PKP minting (naga-test)
const LIT_SPONSORSHIP_API_URL =
  import.meta.env.VITE_LIT_SPONSORSHIP_API_URL || 'https://lit-relayer.vercel.app'

const AUTH_METHOD_TYPE_ETH_WALLET = 1

// Legacy behavior: some old PKPs were minted with authMethodId=address.toLowerCase()
// Enable only for compatibility when needed.
const ENABLE_LEGACY_EOA_AUTH_FALLBACK =
  import.meta.env.VITE_LIT_EOA_LEGACY_AUTH_FALLBACK === 'true'

function deriveEoaAuthMethodId(address: `0x${string}`): `0x${string}` {
  const checksumAddress = getAddress(address)
  return keccak256(stringToBytes(`${checksumAddress}:lit`))
}

function deriveLegacyEoaAuthMethodId(address: `0x${string}`): `0x${string}` {
  return address.toLowerCase() as `0x${string}`
}

function asBigInt(value: unknown): bigint {
  try {
    if (typeof value === 'bigint') return value
    return BigInt(String(value))
  } catch {
    return 0n
  }
}

function tokenIdEquals(a: unknown, b: unknown): boolean {
  return asBigInt(a) === asBigInt(b)
}

function toTokenIdString(tokenId: unknown): string {
  if (typeof tokenId === 'string') return tokenId
  if (typeof tokenId === 'number' || typeof tokenId === 'bigint') return tokenId.toString()
  if (tokenId && typeof (tokenId as any).toString === 'function') {
    return (tokenId as any).toString()
  }
  return ''
}

function hasPersonalSignScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes('personal-sign')
}

async function getEoaAuthMethodScopesForPkp(
  litClient: Awaited<ReturnType<typeof getLitClient>>,
  tokenId: string,
  authMethodId: string,
): Promise<string[] | null> {
  try {
    const permissions = await litClient.viewPKPPermissions({ tokenId })
    const authMethods = Array.isArray(permissions?.authMethods) ? permissions.authMethods : []
    const target = authMethods.find((method: any) => {
      const methodType = asBigInt(method?.authMethodType)
      const methodId = String(method?.id ?? '').toLowerCase()
      return methodType === BigInt(AUTH_METHOD_TYPE_ETH_WALLET) && methodId === authMethodId.toLowerCase()
    })
    if (!target) return []
    const scopes = Array.isArray(target?.scopes) ? target.scopes : []
    return scopes.filter((scope: unknown): scope is string => typeof scope === 'string')
  } catch (error) {
    console.warn('[Lit] Failed to inspect PKP permissions for tokenId', tokenId, error)
    return null
  }
}

async function pickPkpWithRequiredEoaScope(
  litClient: Awaited<ReturnType<typeof getLitClient>>,
  pkps: any[],
  authMethodId: string,
): Promise<{ pkp: any; scopeStatus: 'has-required' | 'missing-required' | 'unknown' }> {
  const sorted = [...pkps].sort((a, b) => {
    const aTokenId = asBigInt(a?.tokenId)
    const bTokenId = asBigInt(b?.tokenId)
    if (aTokenId === bTokenId) return 0
    return aTokenId > bTokenId ? -1 : 1
  })
  const fallback = sorted[0]
  let checkedCount = 0

  for (const pkp of sorted) {
    const tokenId = toTokenIdString(pkp?.tokenId)
    if (!tokenId) continue

    const scopes = await getEoaAuthMethodScopesForPkp(litClient, tokenId, authMethodId)
    if (scopes === null) {
      continue
    }
    checkedCount += 1

    if (hasPersonalSignScope(scopes)) {
      return { pkp, scopeStatus: 'has-required' }
    }
  }

  if (checkedCount > 0) {
    return { pkp: fallback, scopeStatus: 'missing-required' }
  }

  return { pkp: fallback, scopeStatus: 'unknown' }
}

async function findPkpsByEoa(
  litClient: Awaited<ReturnType<typeof getLitClient>>,
  canonicalAuthMethodId: `0x${string}`,
  address: `0x${string}`,
) {
  const queryByAuthMethodId = (authMethodId: `0x${string}`) =>
    litClient.viewPKPsByAuthData({
      authData: {
        authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
        authMethodId,
      },
      pagination: { limit: 10, offset: 0 },
    })

  let pkpsResult = await queryByAuthMethodId(canonicalAuthMethodId)
  const primaryCount = pkpsResult?.pkps?.length ?? 0
  console.log('[Lit] Canonical authMethodId lookup result:', primaryCount, 'PKPs')

  if (primaryCount > 0) {
    return {
      pkpsResult,
      matchedAuthMethodId: canonicalAuthMethodId,
      usedLegacyFallback: false,
    }
  }

  const legacyAuthMethodId = deriveLegacyEoaAuthMethodId(address)
  if (!ENABLE_LEGACY_EOA_AUTH_FALLBACK || legacyAuthMethodId === canonicalAuthMethodId) {
    if (!ENABLE_LEGACY_EOA_AUTH_FALLBACK) {
      console.log('[Lit] Legacy EOA auth fallback disabled; skipping raw-address lookup')
    }
    return {
      pkpsResult,
      matchedAuthMethodId: canonicalAuthMethodId,
      usedLegacyFallback: false,
    }
  }

  console.warn('[Lit] No PKP found for canonical authMethodId, trying legacy raw-address fallback')
  pkpsResult = await queryByAuthMethodId(legacyAuthMethodId)
  const fallbackCount = pkpsResult?.pkps?.length ?? 0
  console.log('[Lit] Legacy fallback lookup result:', fallbackCount, 'PKPs')

  return {
    pkpsResult,
    matchedAuthMethodId: fallbackCount > 0 ? legacyAuthMethodId : canonicalAuthMethodId,
    usedLegacyFallback: fallbackCount > 0,
  }
}

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
  eoaAddress: `0x${string}`
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
    body: JSON.stringify({
      userAddress: address,
      litNetwork: LIT_CONFIG.networkName,
    }),
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
    network: data.network,
    pkpEthAddress: data.pkpEthAddress,
  })

  if (typeof data.network === 'string' && data.network !== LIT_CONFIG.networkName) {
    throw new Error(
      `Relayer minted on ${data.network}, but app is configured for ${LIT_CONFIG.networkName}.`
    )
  }

  const pkpInfo: PKPInfo = {
    publicKey: data.pkpPublicKey,
    ethAddress: data.pkpEthAddress as `0x${string}`,
    tokenId: data.pkpTokenId,
  }

  // Create AuthData via WalletClientAuthenticator (EOA SIWE auth sig)
  console.log('[Lit] Creating EOA auth data via WalletClientAuthenticator...')
  console.log('[Lit] This will prompt your wallet to sign a SIWE message')
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost'
  const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const expiration = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() // 24 hours
  const authData = await WalletClientAuthenticator.authenticate(walletClient, undefined, {
    domain,
    uri,
    statement: 'Authorize Heaven session',
    expiration,
  })
  console.log('[Lit] ✓ SIWE signature received from wallet')

  console.log('[Lit] ✓ PKP registration complete')

  const expectedAuthMethodId = deriveEoaAuthMethodId(address as `0x${string}`)
  console.log('[Lit] Expected EOA authMethodId:', expectedAuthMethodId)
  console.log('[Lit] Authenticator authMethodId:', authData.authMethodId)

  // Ensure authData authMethodId aligns with on-chain auth method when using legacy fallback
  const litClient = await getLitClient()
  const lookup = await findPkpsByEoa(
    litClient,
    authData.authMethodId as `0x${string}`,
    address as `0x${string}`,
  )
  if (lookup.usedLegacyFallback) {
    console.warn('[Lit] Using legacy raw-address authMethodId compatibility mode')
    authData.authMethodId = lookup.matchedAuthMethodId
  } else if (!lookup.pkpsResult?.pkps?.length) {
    // Rollout compatibility: if relayer is still on legacy authMethodId format,
    // detect the just-minted PKP under raw-address mapping and align authData.
    const legacyAuthMethodId = deriveLegacyEoaAuthMethodId(address as `0x${string}`)
    if (legacyAuthMethodId !== authData.authMethodId) {
      const legacyLookup = await litClient.viewPKPsByAuthData({
        authData: {
          authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
          authMethodId: legacyAuthMethodId,
        },
        pagination: { limit: 10, offset: 0 },
      })
      const includesMintedPkp =
        legacyLookup?.pkps?.some((pkp: any) => tokenIdEquals(pkp?.tokenId, pkpInfo.tokenId)) ?? false
      if (includesMintedPkp) {
        console.warn('[Lit] Detected legacy relayer authMethodId format for this new PKP; using raw-address authMethodId for this session')
        authData.authMethodId = legacyAuthMethodId
      }
    }
  }

  const mintedTokenId = toTokenIdString(pkpInfo.tokenId)
  if (mintedTokenId) {
    const mintedScopes = await getEoaAuthMethodScopesForPkp(
      litClient,
      mintedTokenId,
      String(authData.authMethodId),
    )
    if (mintedScopes && !hasPersonalSignScope(mintedScopes)) {
      throw new Error('Relayer minted PKP without required personal-sign scope.')
    }
    if (mintedScopes === null) {
      console.warn('[Lit] Unable to verify minted PKP scopes immediately after registration')
    }
  }

  console.log('[Lit] Registration authData keys:', Object.keys(authData))
  console.log('[Lit] Registration authData full:', authData)

  return { pkpInfo, authData, eoaAddress: address as `0x${string}` }
}

/**
 * Sign in with an existing EOA wallet.
 * Authenticates via SIWE signature and looks up the associated PKP.
 */
export async function authenticateWithEOA(externalWalletClient?: WalletClient): Promise<{
  pkpInfo: PKPInfo
  authData: AuthData
  eoaAddress: `0x${string}`
}> {
  console.log('[Lit] Authenticating with EOA...')

  const walletClient = externalWalletClient ?? await getInjectedWalletClient()
  const address = walletClient.account?.address

  if (!address) {
    throw new Error('No account in wallet client')
  }

  // Create AuthData via WalletClientAuthenticator (EOA SIWE auth sig)
  console.log('[Lit] Creating EOA auth data via WalletClientAuthenticator...')
  console.log('[Lit] Wallet address:', address)
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost'
  const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const expiration = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() // 24 hours
  console.log('[Lit] SIWE params:', { domain, uri, expiration })
  console.log('[Lit] Calling WalletClientAuthenticator.authenticate() — waiting for wallet signature...')
  const authStart = Date.now()
  const authData = await WalletClientAuthenticator.authenticate(walletClient, undefined, {
    domain,
    uri,
    statement: 'Authorize Heaven session',
    expiration,
  })
  console.log('[Lit] ✓ SIWE auth completed in', Date.now() - authStart, 'ms')

  console.log('[Lit] Getting Lit client...')
  const litClient = await getLitClient()
  console.log('[Lit] ✓ Lit client ready')

  const expectedAuthMethodId = deriveEoaAuthMethodId(address as `0x${string}`)
  console.log('[Lit] Expected EOA authMethodId:', expectedAuthMethodId)
  console.log('[Lit] Authenticator authMethodId:', authData.authMethodId)
  console.log('[Lit] Legacy auth fallback enabled:', ENABLE_LEGACY_EOA_AUTH_FALLBACK)

  const lookup = await findPkpsByEoa(
    litClient,
    authData.authMethodId as `0x${string}`,
    address as `0x${string}`,
  )
  const pkpsResult = lookup.pkpsResult
  if (lookup.usedLegacyFallback) {
    console.warn('[Lit] Using legacy raw-address authMethodId compatibility mode')
    authData.authMethodId = lookup.matchedAuthMethodId
  }

  console.log('[Lit] Found PKPs for EOA:', pkpsResult)

  if (!pkpsResult?.pkps?.length) {
    throw new Error('No PKP found for this wallet. Please register first.')
  }

  const selection = await pickPkpWithRequiredEoaScope(
    litClient,
    pkpsResult.pkps,
    String(authData.authMethodId),
  )
  const pkp = selection.pkp
  if (selection.scopeStatus === 'missing-required') {
    throw new Error('Existing PKPs for this wallet are missing required personal-sign scope.')
  }
  if (selection.scopeStatus === 'unknown') {
    console.warn('[Lit] Unable to verify PKP scopes during login; falling back to latest tokenId')
  }

  if ((pkpsResult.pkps?.length ?? 0) > 1) {
    console.warn('[Lit] Multiple PKPs found for auth method; selected tokenId:', pkp?.tokenId?.toString?.() ?? pkp?.tokenId)
  }
  const pkpInfo: PKPInfo = {
    publicKey: pkp.pubkey,
    ethAddress: pkp.ethAddress as `0x${string}`,
    tokenId: pkp.tokenId.toString(),
  }

  console.log('[Lit] Using PKP:', pkpInfo.ethAddress)
  console.log('[Lit] Login authData keys:', Object.keys(authData))
  console.log('[Lit] Login authData full:', authData)

  return { pkpInfo, authData, eoaAddress: address as `0x${string}` }
}
