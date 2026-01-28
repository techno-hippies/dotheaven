import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'
import { resolve } from 'path'

// Web-specific configuration
// Aliases @heaven/platform to the web implementation
export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@heaven/platform': resolve(__dirname, '../../packages/platform/src/web.ts'),
      },
    },
    define: {
      'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
    },
    build: {
      outDir: 'dist-web',
    },
  })
)
