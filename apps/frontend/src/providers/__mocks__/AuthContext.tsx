import { type ParentComponent, createSignal } from 'solid-js'
import { AuthContext, type AuthContextType } from '../AuthContext'

export type { AuthContextType }
export { AuthContext }

// Mock provider for Storybook - uses the REAL AuthContext so useAuth() works
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
    connectWallet: async () => {},
    logout: async () => {},
    cancelAuth: () => {},
    clearError: () => {},
    dismissOnboarding: () => {},
    signMessage: async () => '0x1234567890abcdef',
    getAuthContext: async () => ({}) as any,
    ...props.mockValue,
  }

  return <AuthContext.Provider value={defaultValue}>{props.children}</AuthContext.Provider>
}
