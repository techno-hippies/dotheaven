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
