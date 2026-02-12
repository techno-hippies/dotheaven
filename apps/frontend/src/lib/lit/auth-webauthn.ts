import { WebAuthnAuthenticator } from '@lit-protocol/auth'
import { LIT_CONFIG } from './config'
import { getLitClient } from './client'
import type { PKPInfo, AuthData } from './types'

/**
 * Register a new account with WebAuthn (passkey).
 * Mints a PKP and immediately authenticates to get authData
 * (access token) needed for session signatures.
 */
export async function registerWithWebAuthn(): Promise<{
  pkpInfo: PKPInfo
  authData: AuthData
}> {
  console.log('[Lit] Registering with WebAuthn...')

  const result = await WebAuthnAuthenticator.registerAndMintPKP({
    username: LIT_CONFIG.displayName,
    authServiceBaseUrl: LIT_CONFIG.authServiceUrl,
    scopes: ['sign-anything', 'personal-sign'],
  })

  console.log('[Lit] PKP minted:', result.pkpInfo.ethAddress)

  const pkpInfo: PKPInfo = {
    publicKey: result.pkpInfo.pubkey,
    ethAddress: result.pkpInfo.ethAddress as `0x${string}`,
    tokenId: result.pkpInfo.tokenId.toString(),
  }

  // Authenticate immediately to get auth data (access token)
  const authResult = await WebAuthnAuthenticator.authenticate()

  // DEBUG: Inspect authResult structure
  console.log('[Lit] WebAuthn authResult keys:', Object.keys(authResult))
  console.log('[Lit] WebAuthn authResult full:', authResult)

  // Preserve ALL fields from authResult (includes authSig, scope data, etc.)
  const authData: AuthData = {
    ...authResult as AuthData,
  }

  console.log('[Lit] WebAuthn authData keys after spread:', Object.keys(authData))
  console.log('[Lit] Registration + authentication complete')

  return { pkpInfo, authData }
}

/**
 * Sign in with an existing WebAuthn credential (passkey)
 */
export async function authenticateWithWebAuthn(): Promise<{
  pkpInfo: PKPInfo
  authData: AuthData
}> {
  console.log('[Lit] Authenticating with WebAuthn...')

  const authResult = await WebAuthnAuthenticator.authenticate()

  // DEBUG: Inspect authResult structure
  console.log('[Lit] WebAuthn authResult keys:', Object.keys(authResult))
  console.log('[Lit] WebAuthn authResult full:', authResult)

  // Preserve ALL fields from authResult (includes authSig, scope data, etc.)
  const authData: AuthData = {
    ...authResult as AuthData,
  }

  console.log('[Lit] WebAuthn authData keys after spread:', Object.keys(authData))

  // Get PKP associated with this auth method from chain
  const litClient = await getLitClient()
  const pkpsResult = await litClient.viewPKPsByAuthData({
    authData: {
      authMethodType: authData.authMethodType as 1 | 2 | 3,
      authMethodId: authData.authMethodId,
    },
    pagination: { limit: 5, offset: 0 },
  })

  console.log('[Lit] Found PKPs:', pkpsResult)

  if (!pkpsResult?.pkps?.length) {
    throw new Error('No PKP found for this credential. Please register first.')
  }

  const pkp = pkpsResult.pkps[0]
  const pkpInfo: PKPInfo = {
    publicKey: pkp.pubkey,
    ethAddress: pkp.ethAddress as `0x${string}`,
    tokenId: pkp.tokenId.toString(),
  }

  console.log('[Lit] Using PKP:', pkpInfo.ethAddress)

  return { pkpInfo, authData }
}
