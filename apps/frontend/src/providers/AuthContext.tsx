import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from 'solid-js'
import { usePlatform } from 'virtual:heaven-platform'
import type { PKPInfo, AuthData, AuthResult, PersistedAuth, PKPAuthContext } from '../lib/lit'

// Storage key for web session
const WEB_SESSION_KEY = 'heaven:session'

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

  // Actions
  loginWithPasskey: () => Promise<void>
  registerWithPasskey: () => Promise<void>
  connectWallet: () => Promise<void>
  logout: () => Promise<void>
  cancelAuth: () => void
  clearError: () => void

  // Signing (for XMTP and other protocols)
  signMessage: (message: string) => Promise<string>
  getAuthContext: () => Promise<PKPAuthContext>
}

export const AuthContext = createContext<AuthContextType>()

export const AuthProvider: ParentComponent = (props) => {
  const platform = usePlatform()

  const [pkpInfo, setPkpInfo] = createSignal<PKPInfo | null>(null)
  const [authData, setAuthData] = createSignal<AuthData | null>(null)
  const [isAuthenticating, setIsAuthenticating] = createSignal(false)
  const [authError, setAuthError] = createSignal<string | null>(null)
  const [isSessionRestoring, setIsSessionRestoring] = createSignal(true)
  // Track auth method type (1 = EOA, 3 = WebAuthn) — persists across authData being null
  const [lastAuthMethodType, setLastAuthMethodType] = createSignal<number | null>(null)
  // Persisted EOA address — stored separately so it survives session restore
  const [storedEoaAddress, setStoredEoaAddress] = createSignal<`0x${string}` | null>(null)

  // Derived
  const pkpAddress = () => pkpInfo()?.ethAddress ?? null
  const isAuthenticated = () => pkpInfo() !== null
  // EOA address: persisted separately so it survives session restore
  const eoaAddress = (): `0x${string}` | null => storedEoaAddress()

  // Restore session on mount
  onMount(async () => {
    try {
      if (platform.isTauri) {
        // Tauri: restore from Tauri storage
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const auth = await invoke<PersistedAuth | null>('get_auth')
          if (auth?.pkpAddress && auth?.pkpPublicKey) {
            setPkpInfo({
              ethAddress: auth.pkpAddress as `0x${string}`,
              publicKey: auth.pkpPublicKey,
              tokenId: auth.pkpTokenId || '',
            })
            if (auth.authMethodType && auth.authMethodId) {
              setLastAuthMethodType(auth.authMethodType)
              const restoredAuthData = {
                authMethodType: auth.authMethodType,
                authMethodId: auth.authMethodId,
                accessToken: auth.accessToken || '',
              }
              setAuthData(restoredAuthData)
              // Restore persisted EOA address if present
              if ((auth as any).eoaAddress) {
                setStoredEoaAddress((auth as any).eoaAddress as `0x${string}`)
              }
            }
          }
        } catch (err) {
          console.error('[Auth] Failed to restore from Tauri:', err)
        }
      } else {
        // Web: restore from localStorage
        try {
          const stored = localStorage.getItem(WEB_SESSION_KEY)
          if (stored) {
            const session = JSON.parse(stored) as { pkpInfo: PKPInfo; authData: AuthData; eoaAddress?: string }
            setPkpInfo(session.pkpInfo)
            setAuthData(session.authData)
            if (session.authData?.authMethodType) setLastAuthMethodType(session.authData.authMethodType)
            if (session.eoaAddress) {
              setStoredEoaAddress(session.eoaAddress as `0x${string}`)
            }
          }
        } catch (err) {
          console.error('[Auth] Failed to restore from localStorage:', err)
        }
      }
    } finally {
      setIsSessionRestoring(false)
    }
  })

  // Listen for Tauri auth events (only in Tauri)
  onMount(() => {
    if (!platform.isTauri) return

    let unlistenComplete: (() => void) | undefined
    let unlistenError: (() => void) | undefined

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const { invoke } = await import('@tauri-apps/api/core')

        unlistenComplete = await listen<AuthResult>('auth-complete', async (event) => {
          const payload = event.payload

          if (payload.pkpAddress && payload.pkpPublicKey) {
            // Save to Tauri storage
            try {
              await invoke('save_auth', { authResult: payload })
            } catch (saveErr) {
              console.error('[Auth] Failed to save:', saveErr)
            }

            // Update state
            setPkpInfo({
              ethAddress: payload.pkpAddress as `0x${string}`,
              publicKey: payload.pkpPublicKey,
              tokenId: payload.pkpTokenId || '',
            })
            const eventAuthData = {
              authMethodType: payload.authMethodType || 0,
              authMethodId: payload.authMethodId || '',
              accessToken: payload.accessToken || '',
            }
            setAuthData(eventAuthData)
            setLastAuthMethodType(eventAuthData.authMethodType)
            setIsAuthenticating(false)
          }
        })

        unlistenError = await listen<AuthResult>('auth-error', (event) => {
          console.error('[Auth] auth-error:', event.payload)
          setAuthError(event.payload.error || 'Authentication failed')
          setIsAuthenticating(false)
        })
      } catch (err) {
        console.error('[Auth] Failed to setup Tauri listeners:', err)
      }
    }

    setupListeners()

    onCleanup(() => {
      unlistenComplete?.()
      unlistenError?.()
    })
  })

  // Safely serialize accessToken to string for Tauri persistence
  function serializeAccessToken(token: unknown): string {
    if (typeof token === 'string') return token
    if (token == null) return ''
    try { return JSON.stringify(token) } catch { return '' }
  }

  // Save session (web only - Tauri saves via command)
  function saveWebSession(info: PKPInfo, data: AuthData, eoa?: `0x${string}` | null) {
    try {
      localStorage.setItem(WEB_SESSION_KEY, JSON.stringify({ pkpInfo: info, authData: data, eoaAddress: eoa || undefined }))
    } catch (err) {
      console.error('[Auth] Failed to save to localStorage:', err)
    }
  }

  // Login with existing passkey
  async function loginWithPasskey(): Promise<void> {
    setIsAuthenticating(true)
    setAuthError(null)

    try {
      if (platform.isTauri) {
        // Tauri: open browser, result comes via event
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('start_passkey_auth')
      } else {
        // Web: call Lit SDK directly
        const { authenticateWithWebAuthn } = await import('../lib/lit')
        const result = await authenticateWithWebAuthn()

        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setLastAuthMethodType(result.authData.authMethodType)
        saveWebSession(result.pkpInfo, result.authData)
        setIsAuthenticating(false)
      }
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
      if (platform.isTauri) {
        // Tauri: open browser, result comes via event
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('start_passkey_auth')
      } else {
        // Web: mint PKP and authenticate immediately
        const { registerWithWebAuthn } = await import('../lib/lit')
        const result = await registerWithWebAuthn()

        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setLastAuthMethodType(result.authData.authMethodType)
        saveWebSession(result.pkpInfo, result.authData)
        setIsAuthenticating(false)
      }
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
      // Get wallet client: WalletConnect for Tauri, injected (MetaMask) for web
      let walletClientForEoa: any = undefined
      if (platform.isTauri) {
        const { connectWalletConnect } = await import('../lib/walletconnect')
        walletClientForEoa = await connectWalletConnect()
      } else {
        // Web: clear any existing session first
        const { clearAuthContext } = await import('../lib/lit')
        clearAuthContext()
        localStorage.removeItem(WEB_SESSION_KEY)
      }

      // Helper to persist EOA auth result
      const persistEoaResult = async (result: { pkpInfo: PKPInfo; authData: AuthData; eoaAddress: `0x${string}` }) => {
        const eoa = result.eoaAddress
        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        setLastAuthMethodType(1) // EOA
        setStoredEoaAddress(eoa)
        if (platform.isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('save_auth', { authResult: {
              pkpPublicKey: result.pkpInfo.publicKey,
              pkpAddress: result.pkpInfo.ethAddress,
              pkpTokenId: result.pkpInfo.tokenId,
              authMethodType: result.authData.authMethodType,
              authMethodId: result.authData.authMethodId,
              accessToken: serializeAccessToken(result.authData.accessToken),
              eoaAddress: eoa,
            }})
          } catch (e) {
            console.error('[Auth] Failed to save to Tauri storage:', e)
          }
        } else {
          saveWebSession(result.pkpInfo, result.authData, eoa)
        }
      }

      // Try authenticate first, auto-register if no PKP
      const { authenticateWithEOA } = await import('../lib/lit')
      try {
        const result = await authenticateWithEOA(walletClientForEoa)
        await persistEoaResult(result)
        setIsAuthenticating(false)
      } catch (authErr) {
        if (authErr instanceof Error && authErr.message.includes('No PKP found')) {
          const { registerWithEOA } = await import('../lib/lit')
          const result = await registerWithEOA(walletClientForEoa)
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

    if (platform.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('sign_out')
      } catch (err) {
        console.error('[Auth] Failed to sign out:', err)
      }
    } else {
      localStorage.removeItem(WEB_SESSION_KEY)
    }
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
        // EOA: re-auth. Tauri uses WalletConnect, web uses injected wallet.
        let walletClientForReauth: any = undefined
        if (platform.isTauri) {
          const { connectWalletConnect } = await import('../lib/walletconnect')
          walletClientForReauth = await connectWalletConnect()
        }
        const { authenticateWithEOA } = await import('../lib/lit')
        const result = await authenticateWithEOA(walletClientForReauth)
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
        if (!platform.isTauri) saveWebSession(result.pkpInfo, result.authData)
        currentAuthData = result.authData
      }
    }

    const { createPKPAuthContext } = await import('../lib/lit')
    try {
      return await createPKPAuthContext(currentPkpInfo, currentAuthData)
    } catch (err) {
      // Stale session — clear auth so user gets a clean login prompt
      console.error('[Auth] Auth context creation failed, clearing stale session:', err)
      setPkpInfo(null)
      setAuthData(null)
      if (platform.isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('sign_out')
        } catch {}
      } else {
        localStorage.removeItem(WEB_SESSION_KEY)
      }
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
    loginWithPasskey,
    registerWithPasskey,
    connectWallet,
    logout,
    cancelAuth,
    clearError,
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
