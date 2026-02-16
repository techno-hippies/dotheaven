import type { PlatformAPI } from './api.tsx'
export { PlatformProvider, usePlatform, type PlatformAPI } from './api.tsx'

export const platform: PlatformAPI = {
  platform: 'web',

  resolveDNS: undefined,

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(url, init)
  },

  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  async getVersion(): Promise<string> {
    return import.meta.env.VITE_APP_VERSION ?? '0.0.0'
  },
}

export default platform
