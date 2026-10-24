import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
    port: 3000,
    proxy: {
      // Proxy all /api requests to the backend
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
