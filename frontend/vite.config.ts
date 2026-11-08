import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@kothakoi/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/shared/, /node_modules/],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['bullet-concerned-gas-domain.trycloudflare.com',
      'ensures-knows-marine-paperbacks.trycloudflare.com',
      'organisation-asn-theta-charleston.trycloudflare.com'
    ],
    proxy: {
      // Proxy all /api requests to the backend
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Proxy all /socket.io WebSocket requests to the backend
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
