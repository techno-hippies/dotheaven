import type { ParentComponent } from 'solid-js'
import { PlatformProvider, type PlatformAPI } from '@heaven/platform'

// Mock web platform for Storybook
const mockPlatform: PlatformAPI = {
  platform: 'web',
  isTauri: false,

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

// Mock provider for Storybook
export const MockPlatformProvider: ParentComponent<{ mockValue?: Partial<PlatformAPI> }> = (
  props,
) => {
  const platform = { ...mockPlatform, ...props.mockValue }
  return <PlatformProvider platform={platform}>{props.children}</PlatformProvider>
}
