import { createContext, useContext, type JSX } from 'solid-js'

export interface PlatformAPI {
  /** Platform identifier */
  readonly platform: 'web' | 'tauri'

  /** Check if running in Tauri */
  readonly isTauri: boolean

  /**
   * Resolve DNS hostname (Tauri only)
   * Web implementation throws or returns null
   */
  resolveDNS?(hostname: string): Promise<string | null>

  /**
   * HTTP fetch with optional custom DNS resolution (Tauri)
   * Web uses standard fetch
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
