import type { ParentComponent, Accessor } from 'solid-js'
import { createContext, useContext, createSignal } from 'solid-js'

// ============================================================================
// Platform Mocks
// ============================================================================

export interface PlatformAPI {
  readonly platform: 'web'
  resolveDNS?(hostname: string): Promise<string | null>
  fetch(url: string, init?: RequestInit): Promise<Response>
  openExternal(url: string): Promise<void>
  getVersion(): Promise<string>
}

const mockPlatform: PlatformAPI = {
  platform: 'web',
  resolveDNS: undefined,
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(url, init)
  },
  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  async getVersion(): Promise<string> {
    return '0.0.0-storybook'
  },
}

export const platform = mockPlatform
export default mockPlatform

const PlatformContext = createContext<PlatformAPI>(mockPlatform)

export function usePlatform(): PlatformAPI {
  return useContext(PlatformContext) ?? mockPlatform
}

export const PlatformProvider: ParentComponent<{ platform: PlatformAPI }> = (props) => {
  return <PlatformContext.Provider value={props.platform}>{props.children}</PlatformContext.Provider>
}

export const MockPlatformProvider: ParentComponent = (props) => {
  return <PlatformContext.Provider value={mockPlatform}>{props.children}</PlatformContext.Provider>
}

// ============================================================================
// Auth Mocks
// ============================================================================

export interface AuthContextType {
  pkpInfo: Accessor<any>
  pkpAddress: Accessor<`0x${string}` | null>
  authData: Accessor<any>
  isAuthenticated: Accessor<boolean>
  isAuthenticating: Accessor<boolean>
  authError: Accessor<string | null>
  isNewUser: Accessor<boolean>
  loginWithPasskey: () => Promise<void>
  registerWithPasskey: () => Promise<void>
  logout: () => Promise<void>
  cancelAuth: () => void
  clearError: () => void
  dismissOnboarding: () => void
  signMessage: (message: string) => Promise<string>
  getAuthContext: () => Promise<any>
}

const AuthContext = createContext<AuthContextType>()

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within MockAuthProvider')
  }
  return ctx
}

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

// ============================================================================
// Router Mock
// ============================================================================

const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
  query: {},
  state: null,
  key: '',
}

const mockRouteContext = {
  pattern: '/',
  path: () => '/',
  outlet: () => null,
  resolvePath: (to: string) => to,
}

const noop = () => {}
const noopNavigator = (..._args: any[]) => {}

const mockRouterContext = {
  base: mockRouteContext,
  location: mockLocation,
  params: {},
  navigatorFactory: () => noopNavigator,
  isRouting: () => false,
  matches: () => [],
  renderPath: (path: string) => path,
  parsePath: (str: string) => str,
  beforeLeave: { listeners: new Set(), subscribe: noop, confirm: (to: any, options: any) => true },
  preloadRoute: noop,
  singleFlight: false,
  submissions: [() => [], noop] as any,
}

// Dynamically import internal router contexts to avoid subpath export issues
let _RouterContextObj: any
let _RouteContextObj: any

const routerInternalsReady = import('@solidjs/router').then((mod: any) => {
  // The contexts are re-exported from the barrel in the compiled output
  // Access them from the routing module
  _RouterContextObj = mod.RouterContextObj
  _RouteContextObj = mod.RouteContextObj
})

// Try direct access to internal module
try {
  // Vite can resolve this at build time
  const routing = (await import(/* @vite-ignore */ '/media/t42/th42/Code/dotheaven/node_modules/.bun/@solidjs+router@0.15.4+2e1854f049906f04/node_modules/@solidjs/router/dist/routing.js')) as any
  _RouterContextObj = routing.RouterContextObj
  _RouteContextObj = routing.RouteContextObj
} catch {}

export const MockRouterProvider: ParentComponent = (props) => {
  if (!_RouterContextObj) {
    // Fallback: just render children without router context
    return <>{props.children}</>
  }
  return (
    <_RouterContextObj.Provider value={mockRouterContext}>
      <_RouteContextObj.Provider value={mockRouteContext}>
        {props.children}
      </_RouteContextObj.Provider>
    </_RouterContextObj.Provider>
  )
}
