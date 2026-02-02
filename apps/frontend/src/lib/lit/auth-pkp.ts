/**
 * PKP Auth Context Management
 * Creates and manages authentication contexts for PKP
 * This enables signing with Lit Actions
 */

import { getLitClient, getAuthManager, resetClient } from './client'
import type { PKPInfo, AuthData, PKPAuthContext } from './types'
import { LIT_CONFIG } from './config'

const IS_DEV = import.meta.env.DEV

/**
 * In-memory cache for auth contexts
 * Cannot persist to localStorage due to callback functions
 */
let cachedAuthContext: PKPAuthContext | null = null
let cachedPKPPublicKey: string | null = null

/**
 * Calculate expiration time (24 hours from now)
 */
function getConsistentExpiration(): string {
  return new Date(Date.now() + LIT_CONFIG.sessionExpirationMs).toISOString()
}

/**
 * Clear stale Lit session data from localStorage and reset the auth manager
 */
function clearStaleSessionData(): void {
  // Remove all lit-auth session keys from localStorage
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`lit-auth:${LIT_CONFIG.appName}:`)) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    console.log('[Lit] Removing stale session key:', key)
    localStorage.removeItem(key)
  }
  // Reset auth manager so it doesn't reuse stale in-memory state
  resetClient()
  // Clear our in-memory cache too
  cachedAuthContext = null
  cachedPKPPublicKey = null
}

/**
 * Attempt to create a PKP auth context (single try)
 */
async function attemptCreateAuthContext(
  pkpInfo: PKPInfo,
  authData: AuthData
): Promise<PKPAuthContext> {
  const litClient = await getLitClient()
  const authManager = getAuthManager()

  const authContext = await authManager.createPkpAuthContext({
    authData: authData as any,
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

  console.log('[Lit] PKP authContext created, keys:', Object.keys(authContext))

  // Cache for this session
  cachedAuthContext = authContext
  cachedPKPPublicKey = pkpInfo.publicKey

  if (IS_DEV) console.log('[Lit] PKP auth context created')

  return authContext
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
  // Check for cached PKP auth context (works for both WebAuthn and EOA flows)
  if (cachedAuthContext && cachedPKPPublicKey === pkpInfo.publicKey) {
    if (IS_DEV) console.log('[Lit] Using cached PKP auth context')
    return cachedAuthContext
  }

  console.log('[Lit] Creating PKP auth context...')
  console.log('[Lit] Input authData keys:', Object.keys(authData))
  console.log('[Lit] Input authData full:', authData)
  console.log('[Lit] Input authData type:', typeof authData)
  console.log('[Lit] Input authData has authMethodType:', 'authMethodType' in authData)
  console.log('[Lit] Input authData has authSig:', 'authSig' in authData)
  console.log('[Lit] Input authData has sessionSigs:', 'sessionSigs' in authData)

  try {
    return await attemptCreateAuthContext(pkpInfo, authData)
  } catch (error) {
    // If session keys are stale (401 / InvalidAuthSig), clear cached sessions and retry once
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('InvalidAuthSig') || msg.includes('auth_sig passed is invalid') || msg.includes("can't get auth context") || msg.includes('Signature error') || msg.includes('signature error')) {
      console.warn('[Lit] Session expired, clearing stale session data and retrying...')
      clearStaleSessionData()
      try {
        return await attemptCreateAuthContext(pkpInfo, authData)
      } catch (retryError) {
        console.error('[Lit] Retry also failed:', retryError)
        throw new Error(
          `Failed to create PKP auth context after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`
        )
      }
    }
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
  if (IS_DEV) console.log('[Lit] Clearing cached auth contexts')
  cachedAuthContext = null
  cachedPKPPublicKey = null
}
