import {
  createContext,
  useContext,
  createSignal,
  onMount,
  type ParentComponent,
  type Accessor,
} from 'solid-js'
import type { PKPInfo, AuthData, PKPAuthContext } from '../lib/lit'

// Storage key for web session
const WEB_SESSION_KEY = 'heaven:session'
const TEMPO_SESSION_KEY = 'heaven:tempo-session'
const DEFAULT_TEMPO_KEY_MANAGER_URL = 'https://keys.tempo.xyz'
const DEFAULT_TEMPO_FEE_PAYER_URL = 'https://sponsor.moderato.tempo.xyz'
const DEFAULT_TEMPO_CHAIN_ID = 42431

export interface TempoSession {
  walletAddress: `0x${string}`
  credentialId: string
  publicKey: `0x${string}`
  rpId: string
  keyManagerUrl: string
  feePayerUrl: string
  chainId: number
}

export interface EnsureTempoSessionParams {
  chainId?: number
  keyManagerUrl?: string
  feePayerUrl?: string
  rpId?: string
}

function normalizeHex(value: string): `0x${string}` {
  return (value.startsWith('0x') ? value : `0x${value}`) as `0x${string}`
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

function parseTempoSession(input: unknown): TempoSession | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>

  const walletAddressRaw = typeof record.walletAddress === 'string'
    ? record.walletAddress
    : typeof record.wallet_address === 'string'
      ? record.wallet_address
      : null
  const credentialId = typeof record.credentialId === 'string'
    ? record.credentialId
    : typeof record.tempoCredentialId === 'string'
      ? record.tempoCredentialId
      : null
  const publicKeyRaw = typeof record.publicKey === 'string'
    ? record.publicKey
    : typeof record.tempoPublicKey === 'string'
      ? record.tempoPublicKey
      : null
  const rpId = typeof record.rpId === 'string'
    ? record.rpId
    : typeof record.tempoRpId === 'string'
      ? record.tempoRpId
      : window.location.hostname
  const keyManagerUrl = typeof record.keyManagerUrl === 'string'
    ? record.keyManagerUrl
    : typeof record.tempoKeyManagerUrl === 'string'
      ? record.tempoKeyManagerUrl
      : DEFAULT_TEMPO_KEY_MANAGER_URL
  const feePayerUrl = typeof record.feePayerUrl === 'string'
    ? record.feePayerUrl
    : typeof record.tempoFeePayerUrl === 'string'
      ? record.tempoFeePayerUrl
      : DEFAULT_TEMPO_FEE_PAYER_URL
  const chainIdRaw = typeof record.chainId === 'number'
    ? record.chainId
    : typeof record.tempoChainId === 'number'
      ? record.tempoChainId
      : DEFAULT_TEMPO_CHAIN_ID

  if (!walletAddressRaw || !isHexAddress(walletAddressRaw)) return null
  if (!credentialId || !publicKeyRaw) return null
  if (!Number.isFinite(chainIdRaw)) return null

  return {
    walletAddress: walletAddressRaw,
    credentialId,
    publicKey: normalizeHex(publicKeyRaw),
    rpId,
    keyManagerUrl,
    feePayerUrl,
    chainId: chainIdRaw,
  }
}

export interface AuthContextType {
  // State
  pkpInfo: Accessor<PKPInfo | null>
  pkpAddress: Accessor<`0x${string}` | null>
  /** The original EOA address when authenticated via wallet connect (null for passkey auth) */
  eoaAddress: Accessor<`0x${string}` | null>
  authData: Accessor<AuthData | null>
  isAuthenticated: Accessor<boolean>
  isAuthenticating: Accessor<boolean>
  authError: Accessor<string | null>
  /** True while session is being restored from storage on mount */
  isSessionRestoring: Accessor<boolean>
  tempoSession: Accessor<TempoSession | null>

  // Actions
  loginWithPasskey: () => Promise<void>
  registerWithPasskey: () => Promise<void>
  connectWallet: () => Promise<void>
  logout: () => Promise<void>
  cancelAuth: () => void
  clearError: () => void
  saveTempoSession: (session: TempoSession) => void
  clearTempoSession: () => void
  ensureTempoSession: (params?: EnsureTempoSessionParams) => Promise<TempoSession>

  // Signing (for XMTP and other protocols)
  signMessage: (message: string) => Promise<string>
  getAuthContext: () => Promise<PKPAuthContext>
}

export const AuthContext = createContext<AuthContextType>()

export const AuthProvider: ParentComponent = (props) => {
  const [pkpInfo, setPkpInfo] = createSignal<PKPInfo | null>(null)
  const [authData, setAuthData] = createSignal<AuthData | null>(null)
  const [isAuthenticating, setIsAuthenticating] = createSignal(false)
  const [authError, setAuthError] = createSignal<string | null>(null)
  const [isSessionRestoring, setIsSessionRestoring] = createSignal(true)
  // Track auth method type (1 = EOA, 3 = WebAuthn) — persists across authData being null
  const [lastAuthMethodType, setLastAuthMethodType] = createSignal<number | null>(null)
  // Persisted EOA address — stored separately so it survives session restore
  const [storedEoaAddress, setStoredEoaAddress] = createSignal<`0x${string}` | null>(null)
  // Persisted Tempo session data for sponsored tx signing context
  const [tempoSession, setTempoSession] = createSignal<TempoSession | null>(null)

  // Derived
  const pkpAddress = () => pkpInfo()?.ethAddress ?? null
  const isAuthenticated = () => pkpInfo() !== null
  // EOA address: persisted separately so it survives session restore
  const eoaAddress = (): `0x${string}` | null => storedEoaAddress()

  // Restore session on mount
  onMount(async () => {
    try {
      const stored = localStorage.getItem(WEB_SESSION_KEY)
      if (stored) {
        const session = JSON.parse(stored) as {
          pkpInfo?: PKPInfo
          authData?: AuthData
          eoaAddress?: string
          tempoSession?: unknown
        }
        if (session.pkpInfo && session.authData) {
          setPkpInfo(session.pkpInfo)
          setAuthData(session.authData)
          if (session.authData.authMethodType) setLastAuthMethodType(session.authData.authMethodType)
          setStoredEoaAddress(session.eoaAddress ? session.eoaAddress as `0x${string}` : null)
        }
        const nestedTempoSession = parseTempoSession(session.tempoSession)
        const callbackTempoSession = parseTempoSession(session)
        if (nestedTempoSession || callbackTempoSession) {
          setTempoSession(nestedTempoSession || callbackTempoSession)
        }
      }

      const storedTempoSession = localStorage.getItem(TEMPO_SESSION_KEY)
      if (storedTempoSession) {
        const parsedTempoSession = parseTempoSession(JSON.parse(storedTempoSession))
        if (parsedTempoSession) {
          setTempoSession(parsedTempoSession)
        }
      }
    } catch (err) {
      console.error('[Auth] Failed to restore from localStorage:', err)
    } finally {
      setIsSessionRestoring(false)
    }
  })

  function saveWebSession(info: PKPInfo, data: AuthData, eoa?: `0x${string}` | null) {
    try {
      localStorage.setItem(WEB_SESSION_KEY, JSON.stringify({ pkpInfo: info, authData: data, eoaAddress: eoa || undefined }))
    } catch (err) {
      console.error('[Auth] Failed to save to localStorage:', err)
    }
  }

  function saveTempoSession(session: TempoSession) {
    setTempoSession(session)
    try {
      localStorage.setItem(TEMPO_SESSION_KEY, JSON.stringify(session))
    } catch (err) {
      console.error('[Auth] Failed to save Tempo session:', err)
    }
  }

  function clearTempoSession() {
    setTempoSession(null)
    localStorage.removeItem(TEMPO_SESSION_KEY)
  }

  async function ensureTempoSession(params?: EnsureTempoSessionParams): Promise<TempoSession> {
    const existing = tempoSession()
    if (existing) return existing

    const rpId = params?.rpId || import.meta.env.VITE_TEMPO_RP_ID || window.location.hostname
    const keyManagerUrl =
      params?.keyManagerUrl || import.meta.env.VITE_TEMPO_KEY_MANAGER_URL || DEFAULT_TEMPO_KEY_MANAGER_URL
    const feePayerUrl =
      params?.feePayerUrl || import.meta.env.VITE_TEMPO_FEE_PAYER_URL || DEFAULT_TEMPO_FEE_PAYER_URL

    const chainIdRaw = params?.chainId ?? Number.parseInt(import.meta.env.VITE_TEMPO_CHAIN_ID || '', 10)
    const chainId = Number.isFinite(chainIdRaw) ? chainIdRaw : DEFAULT_TEMPO_CHAIN_ID

    const { authenticateWithTempoPasskey } = await import('../lib/tempo')
    const result = await authenticateWithTempoPasskey({
      mode: 'signin',
      chainId,
      feePayerUrl,
      keyManagerUrl,
      rpId,
    })

    if (!result.tempoCredentialId || !result.tempoPublicKey) {
      throw new Error('Tempo credential data missing from authentication result.')
    }

    const nextSession: TempoSession = {
      walletAddress: result.walletAddress,
      credentialId: result.tempoCredentialId,
      publicKey: normalizeHex(result.tempoPublicKey),
      rpId: result.tempoRpId,
      keyManagerUrl: result.tempoKeyManagerUrl,
      feePayerUrl: result.tempoFeePayerUrl,
      chainId: result.tempoChainId,
    }
    saveTempoSession(nextSession)
    return nextSession
  }

  // Login with existing passkey
  async function loginWithPasskey(): Promise<void> {
    setIsAuthenticating(true)
    setAuthError(null)

    try {
      const { authenticateWithWebAuthn } = await import('../lib/lit')
      const result = await authenticateWithWebAuthn()

      setPkpInfo(result.pkpInfo)
      setAuthData(result.authData)
      setLastAuthMethodType(result.authData.authMethodType)
      setStoredEoaAddress(null)
      saveWebSession(result.pkpInfo, result.authData)
      setIsAuthenticating(false)
    } catch (error) {
      console.error('[Auth] Login failed:', error)
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
      setIsAuthenticating(false)
      throw error
    }
  }

  // Register new passkey (mint only — no second WebAuthn prompt)
  async function registerWithPasskey(): Promise<void> {
    setIsAuthenticating(true)
    setAuthError(null)

    try {
      const { registerWithWebAuthn } = await import('../lib/lit')
      const result = await registerWithWebAuthn()

      setPkpInfo(result.pkpInfo)
      setAuthData(result.authData)
      setLastAuthMethodType(result.authData.authMethodType)
      setStoredEoaAddress(null)
      saveWebSession(result.pkpInfo, result.authData)
      setIsAuthenticating(false)
    } catch (error) {
      console.error('[Auth] Registration failed:', error)
      setAuthError(error instanceof Error ? error.message : 'Registration failed')
      setIsAuthenticating(false)
      throw error
    }
  }

  // Connect wallet (EOA): tries sign-in, auto-registers if no PKP found
  async function connectWallet(): Promise<void> {
    setIsAuthenticating(true)
    setAuthError(null)

    try {
      // Web: clear any existing session first
      const { clearAuthContext } = await import('../lib/lit')
      clearAuthContext()
      localStorage.removeItem(WEB_SESSION_KEY)

      // Helper to persist EOA auth result
      const persistEoaResult = async (result: { pkpInfo: PKPInfo; authData: AuthData; eoaAddress: `0x${string}` }) => {
        const eoa = result.eoaAddress
        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setLastAuthMethodType(1) // EOA
        setStoredEoaAddress(eoa)
        saveWebSession(result.pkpInfo, result.authData, eoa)
      }

      // Try authenticate first, auto-register if no PKP
      const { authenticateWithEOA } = await import('../lib/lit')
      try {
        const result = await authenticateWithEOA()
        await persistEoaResult(result)
        setIsAuthenticating(false)
      } catch (authErr) {
        const shouldRegister =
          authErr instanceof Error &&
          (
            authErr.message.includes('No PKP found') ||
            authErr.message.includes('missing required personal-sign scope')
          )

        if (shouldRegister) {
          const { registerWithEOA } = await import('../lib/lit')
          const result = await registerWithEOA()
          await persistEoaResult(result)
          setIsAuthenticating(false)
        } else {
          throw authErr
        }
      }
    } catch (error) {
      console.error('[Auth] Wallet auth failed:', error)
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
      setIsAuthenticating(false)
      throw error
    }
  }

  async function logout(): Promise<void> {
    setPkpInfo(null)
    setAuthData(null)
    setAuthError(null)
    setLastAuthMethodType(null)
    setStoredEoaAddress(null)
    clearTempoSession()

    // Clear Lit auth caches and stale session keys
    try {
      const { clearAuthContext } = await import('../lib/lit')
      clearAuthContext()
      // Clear lit session keys from localStorage
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('lit-auth:')) keysToRemove.push(key)
      }
      for (const key of keysToRemove) localStorage.removeItem(key)
    } catch (e) {
      console.error('[Auth] Failed to clear Lit caches:', e)
    }

    // Disconnect WalletConnect if active
    try {
      const { disconnectWalletConnect } = await import('../lib/walletconnect')
      await disconnectWalletConnect()
    } catch {}

    // Clear username cache
    localStorage.removeItem('heaven:username')
    localStorage.removeItem(WEB_SESSION_KEY)
  }

  function cancelAuth(): void {
    setIsAuthenticating(false)
    setAuthError(null)
  }

  function clearError(): void {
    setAuthError(null)
  }

  // Get or create PKP auth context for signing.
  // Lazily authenticates if authData is missing (e.g. after registration).
  async function getAuthContext(): Promise<PKPAuthContext> {
    const currentPkpInfo = pkpInfo()
    if (!currentPkpInfo) {
      throw new Error('Not authenticated')
    }

    let currentAuthData = authData()

    if (!currentAuthData) {
      if (lastAuthMethodType() === 1) {
        const { authenticateWithEOA } = await import('../lib/lit')
        const result = await authenticateWithEOA()
        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setStoredEoaAddress(result.eoaAddress)
        currentAuthData = result.authData
      } else if (!currentAuthData) {
        // Passkey/WebAuthn: triggers a WebAuthn prompt (only if authData missing)
        const { authenticateWithWebAuthn } = await import('../lib/lit')
        const result = await authenticateWithWebAuthn()
        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setStoredEoaAddress(null)
        saveWebSession(result.pkpInfo, result.authData)
        currentAuthData = result.authData
      }
    }

    const { createPKPAuthContext } = await import('../lib/lit')
    try {
      return await createPKPAuthContext(currentPkpInfo, currentAuthData)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isScopeError =
        message.includes('NodeAuthSigScopeTooLimited') ||
        message.includes('required scope [2]') ||
        message.includes('pkp is not authorized') ||
        message.includes('auth_sig scope that is passed does not support the requested operation')

      if (isScopeError) {
        // This indicates a PKP permission mismatch (typically missing personal-sign scope),
        // not a stale local session.
        throw new Error(
          'PKP is missing required signing permissions. Please reconnect after updating the relayer.'
        )
      }

      // Stale session — clear auth so user gets a clean login prompt
      console.error('[Auth] Auth context creation failed, clearing stale session:', err)
      setPkpInfo(null)
      setAuthData(null)
      localStorage.removeItem(WEB_SESSION_KEY)
      throw new Error('Session expired, please sign in again')
    }
  }

  // Sign message using PKP
  async function signMessage(message: string): Promise<string> {
    const currentPkpInfo = pkpInfo()

    if (!currentPkpInfo) {
      throw new Error('Not authenticated')
    }

    const authContext = await getAuthContext()
    const { signMessageWithPKP } = await import('../lib/lit')
    return signMessageWithPKP(currentPkpInfo, authContext, message)
  }

  const value: AuthContextType = {
    pkpInfo,
    pkpAddress,
    eoaAddress,
    authData,
    isAuthenticated,
    isAuthenticating,
    authError,
    isSessionRestoring,
    tempoSession,
    loginWithPasskey,
    registerWithPasskey,
    connectWallet,
    logout,
    cancelAuth,
    clearError,
    saveTempoSession,
    clearTempoSession,
    ensureTempoSession,
    signMessage,
    getAuthContext,
  }

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
