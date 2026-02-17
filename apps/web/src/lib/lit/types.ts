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

export interface LitSessionKeyPair {
  publicKey: string
  secretKey: string
}

export interface LitDelegationAuthSig {
  sig: string
  derivedVia: string
  signedMessage: string
  address: string
  algo?: string
}

/**
 * Auth result from callback flow.
 */
export interface AuthResult {
  version?: number
  provider?: string
  walletAddress?: `0x${string}` | string
  state?: string
  tempoCredentialId?: string
  tempoPublicKey?: string
  tempoRpId?: string
  tempoKeyManagerUrl?: string
  tempoFeePayerUrl?: string
  tempoChainId?: number
  pkpPublicKey?: string
  pkpAddress?: string
  pkpTokenId?: string
  authMethodType?: number
  authMethodId?: string
  accessToken?: string
  isNewUser?: boolean
  error?: string
  eoaAddress?: string
  litSessionKeyPair?: LitSessionKeyPair
  litDelegationAuthSig?: LitDelegationAuthSig
}

/**
 * Persisted auth from callback flow.
 */
export interface PersistedAuth {
  version?: number
  provider?: string
  walletAddress?: `0x${string}` | string
  tempoCredentialId?: string
  tempoPublicKey?: string
  tempoRpId?: string
  tempoKeyManagerUrl?: string
  tempoFeePayerUrl?: string
  tempoChainId?: number
  pkpAddress?: string
  pkpPublicKey?: string
  pkpTokenId?: string
  authMethodType?: number
  authMethodId?: string
  accessToken?: string
  eoaAddress?: string
  litSessionKeyPair?: LitSessionKeyPair
  litDelegationAuthSig?: LitDelegationAuthSig
}

/**
 * PKP Auth Context (from Lit SDK)
 * Used for signing and executing Lit Actions
 * Note: Cannot persist to localStorage due to callback functions
 */
export type PKPAuthContext = any // Opaque type from @lit-protocol/auth
