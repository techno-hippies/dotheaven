import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Base frontend configuration
export default defineConfig({
  base: './',
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@heaven/ui/styles': resolve(__dirname, '../../packages/ui/src/styles/index.css'),
      '@heaven/ui': resolve(__dirname, '../../packages/ui/src'),
      '@heaven/core': resolve(__dirname, '../../packages/core/src'),
      events: resolve(__dirname, 'node_modules/events'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [],
    },
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
  },
  optimizeDeps: {
    exclude: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings'],
    esbuildOptions: {
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
})
