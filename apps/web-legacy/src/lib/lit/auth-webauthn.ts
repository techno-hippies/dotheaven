import { WebAuthnAuthenticator } from '@lit-protocol/auth'
import { LIT_CONFIG } from './config'
import { getLitClient } from './client'
import type { PKPInfo, AuthData } from './types'

const AUTH_METHOD_TYPE_WEBAUTHN = 3
const REQUIRED_WEBAUTHN_SCOPES = ['sign-anything', 'personal-sign'] as const
const MINT_SCOPE_VERIFY_ATTEMPTS = 5
const MINT_SCOPE_VERIFY_DELAY_MS = 1200
const REGISTER_AUTH_ATTEMPTS = 2

function asBigInt(value: unknown): bigint {
  try {
    if (typeof value === 'bigint') return value
    return BigInt(String(value))
  } catch {
    return 0n
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getWebAuthnAuthMethodScopesForPkp(
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
      return methodType === BigInt(AUTH_METHOD_TYPE_WEBAUTHN) && methodId === authMethodId.toLowerCase()
    })
    if (!target) return []
    const scopes = Array.isArray(target?.scopes) ? target.scopes : []
    return scopes.filter((scope: unknown): scope is string => typeof scope === 'string')
  } catch (error) {
    console.warn('[Lit] Failed to inspect WebAuthn PKP permissions for tokenId', tokenId, error)
    return null
  }
}

async function pickPkpWithRequiredWebAuthnScope(
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

    const scopes = await getWebAuthnAuthMethodScopesForPkp(litClient, tokenId, authMethodId)
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

async function assertMintedPkpHasRequiredScope(
  litClient: Awaited<ReturnType<typeof getLitClient>>,
  tokenId: string,
  authMethodId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MINT_SCOPE_VERIFY_ATTEMPTS; attempt += 1) {
    const scopes = await getWebAuthnAuthMethodScopesForPkp(litClient, tokenId, authMethodId)
    if (scopes === null) {
      if (attempt < MINT_SCOPE_VERIFY_ATTEMPTS) {
        await sleep(MINT_SCOPE_VERIFY_DELAY_MS)
        continue
      }
      throw new Error('Unable to verify passkey scope after registration. Please retry registration.')
    }

    if (scopes.length === 0) {
      if (attempt < MINT_SCOPE_VERIFY_ATTEMPTS) {
        await sleep(MINT_SCOPE_VERIFY_DELAY_MS)
        continue
      }
      throw new Error(
        'Passkey registration mismatch: authentication did not use the newly created passkey. Please retry and choose the new passkey.',
      )
    }

    if (!hasPersonalSignScope(scopes)) {
      throw new Error('New passkey PKP is missing required personal-sign scope. Please retry registration.')
    }

    return
  }
}

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
    scopes: [...REQUIRED_WEBAUTHN_SCOPES],
  })

  console.log('[Lit] PKP minted:', result.pkpInfo.ethAddress)

  const pkpInfo: PKPInfo = {
    publicKey: result.pkpInfo.pubkey,
    ethAddress: result.pkpInfo.ethAddress as `0x${string}`,
    tokenId: result.pkpInfo.tokenId.toString(),
  }

  const litClient = await getLitClient()
  const mintedTokenId = toTokenIdString(pkpInfo.tokenId)
  let lastError: unknown = null

  // Some passkey managers may initially return a different credential after registration.
  // Retry once so users can explicitly choose the newly-created passkey.
  for (let attempt = 1; attempt <= REGISTER_AUTH_ATTEMPTS; attempt += 1) {
    const authResult = await WebAuthnAuthenticator.authenticate()
    const authData: AuthData = {
      ...(authResult as AuthData),
    }

    try {
      if (mintedTokenId) {
        await assertMintedPkpHasRequiredScope(
          litClient,
          mintedTokenId,
          String(authData.authMethodId),
        )
      }

      console.log(
        '[Lit] Registration complete: tokenId=%s authMethodId=%s',
        pkpInfo.tokenId,
        String(authData.authMethodId).slice(0, 18),
      )

      return { pkpInfo, authData }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
      const shouldRetryForMismatch =
        attempt < REGISTER_AUTH_ATTEMPTS && message.includes('passkey registration mismatch')

      if (shouldRetryForMismatch) {
        console.warn('[Lit] Registration authentication mismatch; retrying once for newly-created credential selection')
        continue
      }

      throw error
    }
  }

  throw new Error(
    `Failed to authenticate newly registered passkey: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
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
    ...(authResult as AuthData),
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

  const selection = await pickPkpWithRequiredWebAuthnScope(
    litClient,
    pkpsResult.pkps,
    String(authData.authMethodId),
  )
  const pkp = selection.pkp
  if (selection.scopeStatus === 'missing-required') {
    throw new Error('Existing passkey PKPs are missing required personal-sign scope. Please register again.')
  }
  if (selection.scopeStatus === 'unknown') {
    console.warn('[Lit] Unable to verify WebAuthn PKP scopes during login; falling back to latest tokenId')
  }

  if ((pkpsResult.pkps?.length ?? 0) > 1) {
    console.warn('[Lit] Multiple WebAuthn PKPs found; selected tokenId:', pkp?.tokenId?.toString?.() ?? pkp?.tokenId)
  }

  const pkpInfo: PKPInfo = {
    publicKey: pkp.pubkey,
    ethAddress: pkp.ethAddress as `0x${string}`,
    tokenId: pkp.tokenId.toString(),
  }

  console.log('[Lit] Using PKP:', pkpInfo.ethAddress)

  return { pkpInfo, authData }
}
