import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const webPlatformPath = resolve(__dirname, '../../packages/platform/src/web.ts')

// Web-specific configuration
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      { find: '@heaven/ui/styles', replacement: resolve(__dirname, '../../packages/ui/src/styles/index.css') },
      { find: '@heaven/ui', replacement: resolve(__dirname, '../../packages/ui/src') },
      { find: '@heaven/core', replacement: resolve(__dirname, '../../packages/core/src') },
      { find: /^@heaven\/platform$/, replacement: webPlatformPath },
      { find: 'virtual:heaven-platform', replacement: webPlatformPath },
    ],
  },
  optimizeDeps: {
    // Exclude XMTP packages from Vite's dep optimizer to prevent breaking worker/WASM initialization
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
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    outDir: 'dist-web',
  },
})
