import { createContext, useContext, type JSX } from 'solid-js'

export interface PlatformAPI {
  /** Platform identifier */
  readonly platform: 'web'

  /**
   * Optional custom DNS resolver
   */
  resolveDNS?(hostname: string): Promise<string | null>

  /**
   * HTTP fetch
   */
  fetch(url: string, init?: RequestInit): Promise<Response>

  /**
   * Open URL in system browser
   */
  openExternal(url: string): Promise<void>

  /**
   * Get app version
   */
  getVersion(): Promise<string>
}

const PlatformContext = createContext<PlatformAPI>()

export function usePlatform(): PlatformAPI {
  const ctx = useContext(PlatformContext)
  if (!ctx) {
    throw new Error('usePlatform must be used within a PlatformProvider')
  }
  return ctx
}

export function PlatformProvider(props: {
  platform: PlatformAPI
  children: JSX.Element
}) {
  return (
    <PlatformContext.Provider value={props.platform}>
      {props.children}
    </PlatformContext.Provider>
  )
}

export { PlatformContext }
