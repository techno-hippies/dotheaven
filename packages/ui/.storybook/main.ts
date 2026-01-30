import type { StorybookConfig } from 'storybook-solidjs-vite'
import { mergeConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
    '../../../apps/frontend/src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [],
  framework: {
    name: 'storybook-solidjs-vite',
    options: {
      docgen: false,
    },
  },
  staticDirs: ['../public'],
  async viteFinal(config) {
    const mockPlatformPath = resolve(__dirname, './mocks.tsx')
    return mergeConfig(config, {
      plugins: [solid(), tailwindcss()],
      resolve: {
        alias: [
          { find: '@', replacement: resolve(__dirname, '../../../apps/frontend/src') },
          { find: '@heaven/ui/styles', replacement: resolve(__dirname, '../src/styles/index.css') },
          { find: '@heaven/ui/.storybook/mocks', replacement: mockPlatformPath },
          { find: '@heaven/ui', replacement: resolve(__dirname, '../src') },
          { find: '@heaven/core', replacement: resolve(__dirname, '../../core/src') },
          { find: /^@heaven\/platform$/, replacement: mockPlatformPath },
          { find: 'virtual:heaven-platform', replacement: mockPlatformPath },
        ],
      },
      optimizeDeps: {
        include: ['solid-js', 'solid-js/web', 'solid-js/store'],
        exclude: [
          '@heaven/platform',
          '@tauri-apps/api',
          '@tauri-apps/plugin-dialog',
          '@tauri-apps/plugin-shell',
          '@xmtp/browser-sdk',
          '@xmtp/wasm-bindings',
        ],
      },
      define: {
        'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
      },
    })
  },
}

export default config
