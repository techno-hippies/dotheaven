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
  /** True after a new account registration completes (cleared by dismissOnboarding) */
  isNewUser: Accessor<boolean>

  // Actions
  loginWithPasskey: () => Promise<void>
  registerWithPasskey: () => Promise<void>
  connectWallet: () => Promise<void>
  logout: () => Promise<void>
  cancelAuth: () => void
  clearError: () => void
  /** Call when onboarding flow completes or is dismissed */
  dismissOnboarding: () => void

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
  const [isNewUser, setIsNewUser] = createSignal(false)

  // Derived
  const pkpAddress = () => pkpInfo()?.ethAddress ?? null
  const isAuthenticated = () => pkpInfo() !== null
  // EOA address: extracted from authData when auth method is ETH_WALLET (type 1)
  // The actual address is in accessToken JSON (authMethodId is a hash, not the address)
  const eoaAddress = (): `0x${string}` | null => {
    const data = authData()
    if (data?.authMethodType === 1 && data.accessToken) {
      try {
        const token = typeof data.accessToken === 'string'
          ? JSON.parse(data.accessToken)
          : data.accessToken
        if (token?.address) return token.address as `0x${string}`
      } catch {
        // accessToken not JSON parseable
      }
    }
    return null
  }

  // Restore session on mount
  onMount(async () => {
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
            const restoredAuthData = {
              authMethodType: auth.authMethodType,
              authMethodId: auth.authMethodId,
              accessToken: auth.accessToken || '',
            }
            setAuthData(restoredAuthData)
            console.log('[Auth] Restored authData keys:', Object.keys(restoredAuthData))
            console.log('[Auth] Restored authData full:', restoredAuthData)
          }
          console.log('[Auth] Restored from Tauri storage:', auth.pkpAddress)
        }
      } catch (err) {
        console.log('[Auth] Failed to restore from Tauri:', err)
      }
    } else {
      // Web: restore from localStorage
      try {
        const stored = localStorage.getItem(WEB_SESSION_KEY)
        if (stored) {
          const session = JSON.parse(stored) as { pkpInfo: PKPInfo; authData: AuthData }
          setPkpInfo(session.pkpInfo)
          setAuthData(session.authData)
          console.log('[Auth] Restored from localStorage:', session.pkpInfo.ethAddress)
        }
      } catch (err) {
        console.log('[Auth] Failed to restore from localStorage:', err)
      }
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
          console.log('[Auth] auth-complete:', event.payload)
          const payload = event.payload

          if (payload.pkpAddress && payload.pkpPublicKey) {
            // Save to Tauri storage
            try {
              await invoke('save_auth', { authResult: payload })
              console.log('[Auth] Saved to Tauri storage')
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
            console.log('[Auth] Event authData keys:', Object.keys(eventAuthData))
            console.log('[Auth] Event authData full:', eventAuthData)
            setIsAuthenticating(false)
            if (payload.isNewUser) {
              setIsNewUser(true)
            }
            console.log('[Auth] Login complete:', payload.pkpAddress)
          }
        })

        unlistenError = await listen<AuthResult>('auth-error', (event) => {
          console.error('[Auth] auth-error:', event.payload)
          setAuthError(event.payload.error || 'Authentication failed')
          setIsAuthenticating(false)
        })

        console.log('[Auth] Tauri event listeners ready')
      } catch (err) {
        console.log('[Auth] Tauri event listeners not available')
      }
    }

    setupListeners()

    onCleanup(() => {
      unlistenComplete?.()
      unlistenError?.()
    })
  })

  // Save session (web only - Tauri saves via command)
  function saveWebSession(info: PKPInfo, data: AuthData) {
    try {
      localStorage.setItem(WEB_SESSION_KEY, JSON.stringify({ pkpInfo: info, authData: data }))
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
        console.log('[Auth] Opened browser for passkey auth')
      } else {
        // Web: call Lit SDK directly
        const { authenticateWithWebAuthn } = await import('../lib/lit')
        const result = await authenticateWithWebAuthn()

        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        saveWebSession(result.pkpInfo, result.authData)
        setIsAuthenticating(false)
        console.log('[Auth] Web login complete:', result.pkpInfo.ethAddress)
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
        console.log('[Auth] Opened browser for passkey registration')
      } else {
        // Web: mint PKP and authenticate immediately
        const { registerWithWebAuthn } = await import('../lib/lit')
        const result = await registerWithWebAuthn()

        setIsNewUser(true)
        setPkpInfo(result.pkpInfo)
        setAuthData(result.authData)
        saveWebSession(result.pkpInfo, result.authData)
        setIsAuthenticating(false)
        console.log('[Auth] PKP minted:', result.pkpInfo.ethAddress)
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
      if (platform.isTauri) {
        // Tauri: open browser, auth page handles both sign-in and auto-register
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('start_eoa_auth')
        console.log('[Auth] Opened browser for wallet auth')
      } else {
        // Web: clear any existing session first (to remove old broken authData)
        const { clearAuthContext } = await import('../lib/lit')
        clearAuthContext()
        localStorage.removeItem(WEB_SESSION_KEY)

        // Try authenticate first, auto-register if no PKP
        const { authenticateWithEOA } = await import('../lib/lit')
        try {
          const result = await authenticateWithEOA()
          setPkpInfo(result.pkpInfo)
          setAuthData(result.authData)
          saveWebSession(result.pkpInfo, result.authData)
          setIsAuthenticating(false)
          console.log('[Auth] Web wallet login complete:', result.pkpInfo.ethAddress)
        } catch (authErr) {
          if (authErr instanceof Error && authErr.message.includes('No PKP found')) {
            console.log('[Auth] No PKP for wallet, auto-registering...')
            const { registerWithEOA } = await import('../lib/lit')
            const result = await registerWithEOA()
            setIsNewUser(true)
            setPkpInfo(result.pkpInfo)
            setAuthData(result.authData)
            saveWebSession(result.pkpInfo, result.authData)
            setIsAuthenticating(false)
            console.log('[Auth] Web wallet PKP minted:', result.pkpInfo.ethAddress)
          } else {
            throw authErr
          }
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

    // Clear username cache
    try {
      const beforeLogout = localStorage.getItem('heaven:username')
      console.log('[Auth] Clearing username from localStorage (was:', beforeLogout, ')')
      localStorage.removeItem('heaven:username')
      const afterLogout = localStorage.getItem('heaven:username')
      console.log('[Auth] Username after clear:', afterLogout)
    } catch (e) {
      console.error('[Auth] Failed to clear username:', e)
    }

    if (platform.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('sign_out')
        console.log('[Auth] Signed out (Tauri)')
      } catch (err) {
        console.log('[Auth] sign_out not available')
      }
    } else {
      localStorage.removeItem(WEB_SESSION_KEY)
      console.log('[Auth] Signed out (web)')
    }
  }

  function cancelAuth(): void {
    setIsAuthenticating(false)
    setAuthError(null)
  }

  function clearError(): void {
    setAuthError(null)
  }

  function dismissOnboarding(): void {
    setIsNewUser(false)
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
      // Authenticate lazily — this triggers a WebAuthn prompt
      const { authenticateWithWebAuthn } = await import('../lib/lit')
      const result = await authenticateWithWebAuthn()
      setPkpInfo(result.pkpInfo)
      setAuthData(result.authData)
      saveWebSession(result.pkpInfo, result.authData)
      currentAuthData = result.authData
    }

    const { createPKPAuthContext } = await import('../lib/lit')
    return createPKPAuthContext(currentPkpInfo, currentAuthData)
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
    isNewUser,
    loginWithPasskey,
    registerWithPasskey,
    connectWallet,
    logout,
    cancelAuth,
    clearError,
    dismissOnboarding,
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
