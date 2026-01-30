/**
 * PKP (Programmable Key Pair) Information
 */
export interface PKPInfo {
  publicKey: string
  ethAddress: `0x${string}`
  tokenId: string
}

/**
 * Authentication Data
 * Preserves all fields from Lit Protocol authenticators
 */
export interface AuthData {
  authMethodType: number
  authMethodId: string
  accessToken: string
  // Allow additional fields from Lit Protocol (authSig, scope data, etc.)
  [key: string]: any
}

/**
 * Auth result from Tauri callback
 */
export interface AuthResult {
  pkpPublicKey?: string
  pkpAddress?: string
  pkpTokenId?: string
  authMethodType?: number
  authMethodId?: string
  accessToken?: string
  isNewUser?: boolean
  error?: string
}

/**
 * Persisted auth from Tauri
 */
export interface PersistedAuth {
  pkpAddress?: string
  pkpPublicKey?: string
  pkpTokenId?: string
  authMethodType?: number
  authMethodId?: string
  accessToken?: string
}

/**
 * PKP Auth Context (from Lit SDK)
 * Used for signing and executing Lit Actions
 * Note: Cannot persist to localStorage due to callback functions
 */
export type PKPAuthContext = any // Opaque type from @lit-protocol/auth
