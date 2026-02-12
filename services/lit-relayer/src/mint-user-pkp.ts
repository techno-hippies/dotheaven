/**
 * Mint User PKP API
 *
 * Relayer-sponsored PKP minting for naga-test. The relayer wallet pays gas
 * on Chronicle, mints a PKP, adds the user's EOA as auth method, and
 * delegates payment so the PKP can use Lit network services.
 *
 * POST /api/mint-user-pkp
 * Body: { userAddress: "0x..." }
 * Returns: { pkpTokenId, pkpPublicKey, pkpEthAddress }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Auth method type for EthWallet
const AUTH_METHOD_TYPE_ETH_WALLET = 1

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userAddress, litNetwork } = req.body

    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing userAddress in request body' })
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' })
    }

    const relayerPrivateKey = process.env.LIT_RELAYER_PRIVATE_KEY
    if (!relayerPrivateKey) {
      console.error('LIT_RELAYER_PRIVATE_KEY not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Dynamic imports to avoid top-level crash if Lit SDK has issues
    const { createLitClient } = await import('@lit-protocol/lit-client')
    const { nagaDev, nagaTest } = await import('@lit-protocol/networks')
    const { privateKeyToAccount } = await import('viem/accounts')
    const { getAddress, keccak256, stringToBytes } = await import('viem')

    // Determine network: request-level override wins, then env default.
    const requestedNetwork = typeof litNetwork === 'string' ? litNetwork.trim() : ''
    const envNetwork = (process.env.LIT_NETWORK || 'naga-dev').trim()
    const networkName = (requestedNetwork || envNetwork)
    if (networkName !== 'naga-dev' && networkName !== 'naga-test') {
      return res.status(400).json({ error: `Invalid litNetwork "${networkName}"` })
    }
    const network = networkName === 'naga-test' ? nagaTest : nagaDev

    console.log(`[mint-user-pkp] Minting PKP for ${userAddress} on ${networkName}`)

    // Create relayer account from private key
    const cleanKey = relayerPrivateKey.trim() as `0x${string}`
    const relayerAccount = privateKeyToAccount(cleanKey)

    // Initialize Lit client
    const litClient = await createLitClient({ network: network as any })

    // Step 1: Mint PKP with relayer paying gas
    console.log(`[mint-user-pkp] Minting new PKP...`)
    const mintResult = await litClient.mintWithEoa({
      account: relayerAccount,
    })

    if (!mintResult.data) {
      console.error('[mint-user-pkp] Mint failed - no data returned')
      return res.status(500).json({ error: 'PKP minting failed' })
    }

    const { tokenId, pubkey, ethAddress } = mintResult.data
    console.log(`[mint-user-pkp] PKP minted: ${ethAddress}`)

    // Step 2: Add user's EOA as auth method with both signing scopes.
    // `personal-sign` (scope 2) is required for PKP session key signing in current SDK/node flows.
    console.log(`[mint-user-pkp] Adding user EOA as auth method...`)
    const permissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: { tokenId },
      account: relayerAccount,
    })

    const checksumAddress = getAddress(userAddress as `0x${string}`)
    const authMethodId = keccak256(stringToBytes(`${checksumAddress}:lit`))
    console.log(`[mint-user-pkp] EOA checksum address: ${checksumAddress}`)
    console.log(`[mint-user-pkp] EOA authMethodId: ${authMethodId}`)

    await permissionsManager.addPermittedAuthMethod({
      authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
      authMethodId,
      userPubkey: '0x',
      scopes: ['sign-anything', 'personal-sign'],
    })

    console.log(`[mint-user-pkp] ✓ Auth method added for ${userAddress}`)

    // Step 3: Delegate payment for the PKP so it can use Lit services
    // On naga-test, payments are required — relayer sponsors the PKP
    if (networkName === 'naga-test') {
      console.log(`[mint-user-pkp] Setting up payment delegation for ${ethAddress}...`)
      try {
        const paymentManager = await litClient.getPaymentManager({
          account: relayerAccount,
        })

        // Set spending restriction (idempotent — only needs to be done once per payer)
        try {
          await paymentManager.setRestriction({
            totalMaxPrice: '1000000000000000000', // 1 tstLPX max per period
            requestsPerPeriod: '1000',
            periodSeconds: '86400', // 24h rolling window
          })
          console.log(`[mint-user-pkp] ✓ Payment restriction set`)
        } catch (e: any) {
          // May already exist — that's fine
          console.log(`[mint-user-pkp] Restriction already set or error: ${e.message}`)
        }

        // Delegate payments for the new PKP address
        await paymentManager.delegatePaymentsBatch({
          userAddresses: [ethAddress],
        })
        console.log(`[mint-user-pkp] ✓ Payment delegated for ${ethAddress}`)
      } catch (e: any) {
        console.error(`[mint-user-pkp] Payment delegation failed: ${e.message}`)
        // Return success anyway — PKP is minted, user can fund it manually
      }
    }

    return res.status(200).json({
      success: true,
      existing: false,
      network: networkName,
      pkpTokenId: tokenId.toString(),
      pkpPublicKey: pubkey,
      pkpEthAddress: ethAddress,
    })
  } catch (error: any) {
    console.error('[mint-user-pkp] Error:', error)
    return res.status(500).json({
      error: error?.message || 'Internal server error',
    })
  }
}
