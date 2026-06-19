/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Bypass function: skip proxying browser navigation requests (Accept: text/html). */
function bypassHtmlRequests(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const accept = req.headers['accept']
  if (typeof accept === 'string' && accept.includes('text/html')) {
    return (req as unknown as { url: string }).url
  }
  return undefined
}

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
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
      '/users': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
      '/admin': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
      '/clinic': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
      '/platform': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: bypassHtmlRequests,
      },
    }
  }
})
