import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Base configuration shared between web and tauri
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@heaven/ui/styles': resolve(__dirname, '../../packages/ui/src/styles/index.css'),
      '@heaven/ui': resolve(__dirname, '../../packages/ui/src'),
      '@heaven/core': resolve(__dirname, '../../packages/core/src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
  },
  optimizeDeps: {
    // Exclude XMTP packages from Vite's dep optimizer to prevent breaking worker/WASM initialization
    exclude: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings'],
  },
})
