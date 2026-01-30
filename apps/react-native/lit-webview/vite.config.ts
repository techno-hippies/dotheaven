import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../android/app/src/main/assets/lit-bundle',
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
