import { defineConfig } from 'vite';

const outDir = process.env.LIT_WEBVIEW_OUT_DIR || '../android/app/src/main/assets/lit-bundle';

export default defineConfig({
  // Keep script URLs relative so the bundle can be hosted under /lit-bundle/.
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: './src/index.ts',
      output: {
        entryFileNames: 'lit-engine.js',
        format: 'iife',
        name: 'LitEngine'
      }
    },
    // Don't minify for easier debugging initially
    minify: false,
    sourcemap: true
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    global: 'globalThis'
  }
});
