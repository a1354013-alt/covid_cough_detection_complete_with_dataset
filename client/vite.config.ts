import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { manusRuntime } from 'vite-plugin-manus-runtime'
import { getViteConfig } from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    getViteConfig(),
    manusRuntime(),
  ],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
  },
})
