import { createContext, type ParentComponent, type Accessor, createSignal } from 'solid-js'

// Mock AuthContextType (matches the real interface)
export interface AuthContextType {
  // State
  pkpInfo: Accessor<any>
  pkpAddress: Accessor<`0x${string}` | null>
  authData: Accessor<any>
  isAuthenticated: Accessor<boolean>
  isAuthenticating: Accessor<boolean>
  authError: Accessor<string | null>
  isNewUser: Accessor<boolean>

  // Actions
  loginWithPasskey: () => Promise<void>
  registerWithPasskey: () => Promise<void>
  logout: () => Promise<void>
  cancelAuth: () => void
  clearError: () => void
  dismissOnboarding: () => void

  // Signing
  signMessage: (message: string) => Promise<string>
  getAuthContext: () => Promise<any>
}

export const AuthContext = createContext<AuthContextType>()

// Mock provider for Storybook
export const MockAuthProvider: ParentComponent<{ mockValue?: Partial<AuthContextType> }> = (
  props,
) => {
  const [pkpAddress] = createSignal<`0x${string}` | null>(
    (props.mockValue?.pkpAddress?.() as `0x${string}` | null) ?? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  )

  const defaultValue: AuthContextType = {
    pkpInfo: () => null,
    pkpAddress,
    authData: () => null,
    isAuthenticated: () => true,
    isAuthenticating: () => false,
    authError: () => null,
    isNewUser: () => false,
    loginWithPasskey: async () => {},
    registerWithPasskey: async () => {},
    logout: async () => {},
    cancelAuth: () => {},
    clearError: () => {},
    dismissOnboarding: () => {},
    signMessage: async () => '0x1234567890abcdef',
    getAuthContext: async () => ({}),
    ...props.mockValue,
  }

  return <AuthContext.Provider value={defaultValue}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = AuthContext
  if (!ctx) {
    throw new Error('useAuth must be used within MockAuthProvider')
  }
  return ctx as any
}
