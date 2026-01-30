/**
 * Mint User PKP API
 *
 * Relayer-sponsored PKP minting. The relayer wallet pays gas on Chronicle,
 * and the user's EOA is added as an auth method with SignAnything scope.
 *
 * POST /api/mint-user-pkp
 * Body: { userAddress: "0x..." }
 * Returns: { pkpTokenId, pkpPublicKey, pkpEthAddress }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createLitClient } from '@lit-protocol/lit-client'
import { nagaDev, nagaTest } from '@lit-protocol/networks'
import { privateKeyToAccount } from 'viem/accounts'

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
    const { userAddress } = req.body

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

    // Determine network
    const networkName = process.env.LIT_NETWORK || 'naga-dev'
    const network = networkName === 'naga-test' ? nagaTest : nagaDev

    console.log(`[mint-user-pkp] Minting PKP for ${userAddress} on ${networkName}`)

    // Create relayer account from private key
    const relayerAccount = privateKeyToAccount(relayerPrivateKey as `0x${string}`)

    // Initialize Lit client (cast network to any to avoid package version mismatch)
    const litClient = await createLitClient({ network: network as any })

    // Step 1: Check if user already has a PKP with this auth method
    const existingPkps = await litClient.viewPKPsByAuthData({
      authData: {
        authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
        authMethodId: userAddress.toLowerCase(),
      },
      pagination: { limit: 1, offset: 0 },
    })

    if (existingPkps?.pkps?.length > 0) {
      const existing = existingPkps.pkps[0]
      console.log(`[mint-user-pkp] User already has PKP: ${existing.ethAddress}`)
      return res.status(200).json({
        success: true,
        existing: true,
        pkpTokenId: existing.tokenId.toString(),
        pkpPublicKey: existing.pubkey,
        pkpEthAddress: existing.ethAddress,
      })
    }

    // Step 2: Mint PKP with relayer paying gas
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

    // Step 3: Add user's EOA as auth method with SignAnything scope
    console.log(`[mint-user-pkp] Adding user EOA as auth method...`)
    const permissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: { tokenId },
      account: relayerAccount,
    })

    // For EthWallet auth, userPubkey is required by the SDK but not used for verification
    // The authMethodId (address) is what's checked during authentication
    await permissionsManager.addPermittedAuthMethod({
      authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
      authMethodId: userAddress.toLowerCase(),
      userPubkey: '0x', // Placeholder - EOA auth uses address-based verification
      scopes: ['sign-anything'],
    })

    console.log(`[mint-user-pkp] ✓ Auth method added for ${userAddress}`)

    return res.status(200).json({
      success: true,
      existing: false,
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
