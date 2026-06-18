/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  plugins: [react()],
  optimizeDeps: {
    include: ['@zxing/browser', '@zxing/library']
  },
  server: {
    port: 5173,
    proxy: {
      '/auth':   'http://localhost:4000',
      '/users':  'http://localhost:4000',
      '/admin':  'http://localhost:4000',
      '/clinic': 'http://localhost:4000',
      '/api':    'http://localhost:4000',
    }
  }
})
