/**
 * PKP Auth Context Management
 * Creates and manages authentication contexts for PKP
 * This enables signing with Lit Actions
 */

import { getLitClient, getAuthManager } from './client'
import type { PKPInfo, AuthData, PKPAuthContext } from './types'

const IS_DEV = import.meta.env.DEV

/**
 * In-memory cache for auth context
 * Cannot persist to localStorage due to callback functions
 */
let cachedAuthContext: PKPAuthContext | null = null
let cachedPKPPublicKey: string | null = null
let cachedAuthMethodId: string | null = null
let cachedAccessToken: string | null = null

/**
 * Calculate expiration time (24 hours from now)
 */
function getConsistentExpiration(): string {
  return new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
}

/**
 * Create PKP auth context
 * This is required for signing messages and executing Lit Actions with PKP
 *
 * Auth context enables:
 * - Zero-signature Lit Action execution
 * - PKP signing without user prompts
 * - Session-based authentication
 */
export async function createPKPAuthContext(
  pkpInfo: PKPInfo,
  authData: AuthData
): Promise<PKPAuthContext> {
  // Return cached context if available and all fields match
  if (
    cachedAuthContext &&
    cachedPKPPublicKey === pkpInfo.publicKey &&
    cachedAuthMethodId === authData.authMethodId &&
    cachedAccessToken === authData.accessToken
  ) {
    if (IS_DEV) console.log('[Lit] Using cached PKP auth context')
    return cachedAuthContext
  }

  if (IS_DEV) console.log('[Lit] Creating PKP auth context...')

  try {
    const litClient = await getLitClient()
    const authManager = getAuthManager()

    // Create PKP auth context
    const authContext = await authManager.createPkpAuthContext({
      authData: {
        authMethodType: authData.authMethodType as 1 | 2 | 3,
        authMethodId: authData.authMethodId,
        accessToken: authData.accessToken,
      },
      pkpPublicKey: pkpInfo.publicKey,
      authConfig: {
        domain: typeof window !== 'undefined' ? window.location.host : 'localhost',
        statement: 'Execute Lit Actions and sign messages',
        expiration: getConsistentExpiration(),
        resources: [
          ['lit-action-execution', '*'],
          ['pkp-signing', '*'],
          ['access-control-condition-decryption', '*'],
        ],
      },
      litClient: litClient,
    })

    // Cache for this session
    cachedAuthContext = authContext
    cachedPKPPublicKey = pkpInfo.publicKey
    cachedAuthMethodId = authData.authMethodId
    cachedAccessToken = authData.accessToken

    if (IS_DEV) console.log('[Lit] PKP auth context created')

    return authContext
  } catch (error) {
    console.error('[Lit] Failed to create PKP auth context:', error)
    throw new Error(
      `Failed to create PKP auth context: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Get cached auth context
 * Returns null if not cached or PKP mismatch
 */
export function getCachedAuthContext(pkpPublicKey: string): PKPAuthContext | null {
  if (cachedAuthContext && cachedPKPPublicKey === pkpPublicKey) {
    return cachedAuthContext
  }
  return null
}

/**
 * Clear cached auth context
 * Call this on logout or when switching PKPs
 */
export function clearAuthContext(): void {
  if (IS_DEV) console.log('[Lit] Clearing cached auth context')
  cachedAuthContext = null
  cachedPKPPublicKey = null
  cachedAuthMethodId = null
  cachedAccessToken = null
}
