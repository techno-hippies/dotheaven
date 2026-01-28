import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'
import { resolve } from 'path'

// Tauri-specific configuration
// Aliases @heaven/platform to the tauri implementation
export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@heaven/platform': resolve(__dirname, '../../packages/platform/src/tauri.ts'),
        'virtual:heaven-platform': resolve(__dirname, '../../packages/platform/src/tauri.ts'),
      },
    },
    define: {
      'import.meta.env.VITE_PLATFORM': JSON.stringify('tauri'),
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      outDir: 'dist',
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_DEBUG,
    },
  })
)
