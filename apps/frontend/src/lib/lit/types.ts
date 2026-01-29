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
 */
export interface AuthData {
  authMethodType: number
  authMethodId: string
  accessToken: string
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
