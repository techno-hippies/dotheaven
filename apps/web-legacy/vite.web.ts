import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const webPlatformPath = resolve(__dirname, '../../packages/platform/src/web.ts')

// Web-specific configuration
export default defineConfig({
  base: './',
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      { find: '@heaven/ui/styles', replacement: resolve(__dirname, '../../packages/ui/src/styles/index.css') },
      { find: '@heaven/ui', replacement: resolve(__dirname, '../../packages/ui/src') },
      { find: '@heaven/core', replacement: resolve(__dirname, '../../packages/core/src') },
      { find: /^events$/, replacement: resolve(__dirname, 'node_modules/events') },
      { find: /^@heaven\/platform$/, replacement: webPlatformPath },
      { find: 'virtual:heaven-platform', replacement: webPlatformPath },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@heaven/platform',
      '@xmtp/browser-sdk',
      '@xmtp/wasm-bindings',
    ],
    esbuildOptions: {
      // @lit-protocol/networks pulls in Node-only deps (pino, node-localstorage, source-map-support)
      // that use require('fs'). Mark Node builtins as external so esbuild doesn't choke on them.
      plugins: [{
        name: 'externalize-node-builtins',
        setup(build) {
          const nodeBuiltins = ['fs', 'path', 'os', 'crypto', 'stream', 'util', 'net', 'tls', 'http', 'https', 'child_process', 'worker_threads', 'perf_hooks']
          for (const mod of nodeBuiltins) {
            build.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({ path: mod, external: true }))
          }
        },
      }],
    },
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Watch the monorepo packages for HMR
      ignored: ['**/node_modules/**'],
    },
    fs: {
      // Allow serving files from monorepo packages
      allow: ['../..'],
    },
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    outDir: 'dist-web',
  },
})
