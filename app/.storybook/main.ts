import type { StorybookConfig } from 'storybook-solidjs-vite'
import { mergeConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [],
  framework: {
    name: 'storybook-solidjs-vite',
    options: {
      docgen: false,
    },
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': resolve(__dirname, '../src'),
        },
      },
    })
  },
}

export default config
