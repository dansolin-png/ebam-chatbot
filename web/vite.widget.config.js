import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Swap React for Preact at build time — ~3KB vs ~45KB
      'react':     path.resolve('./node_modules/preact/compat'),
      'react-dom': path.resolve('./node_modules/preact/compat'),
    },
  },
  build: {
    lib: {
      entry:    'widget/index.jsx',
      name:     'EBAMWidget',
      fileName: () => 'widget.js',
      formats:  ['iife'],
    },
    outDir:    'dist-widget',
    emptyOutDir: true,
    minify:    'terser',
    terserOptions: { compress: { drop_console: true } },
  },
})
