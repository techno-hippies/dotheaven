console.log('[Platform] Loading tauri.ts')

import type { PlatformAPI } from './api.tsx'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { getVersion as getTauriVersion } from '@tauri-apps/api/app'
export { PlatformProvider, usePlatform, type PlatformAPI } from './api.tsx'

export const platform: PlatformAPI = {
  platform: 'tauri',
  isTauri: true,

  async resolveDNS(hostname: string): Promise<string | null> {
    try {
      return await invoke<string>('resolve_dns', { hostname })
    } catch {
      return null
    }
  },

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    // For now, use standard fetch
    // Can be extended to use Tauri HTTP plugin with custom DNS
    return globalThis.fetch(url, init)
  },

  async openExternal(url: string): Promise<void> {
    await open(url)
  },

  async getVersion(): Promise<string> {
    return getTauriVersion()
  },
}

export default platform
