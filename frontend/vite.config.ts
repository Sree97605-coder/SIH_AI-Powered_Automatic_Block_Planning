import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/auth': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/comparison': 'http://127.0.0.1:8000',
      '/defects': 'http://127.0.0.1:8000',
      '/slots': 'http://127.0.0.1:8000',
      '/schedules': 'http://127.0.0.1:8000',
      '/unscheduled': 'http://127.0.0.1:8000',
      '/classifications': 'http://127.0.0.1:8000',
      '/audit-log': 'http://127.0.0.1:8000',
      '/schedule': 'http://127.0.0.1:8000',
    },
  },
})
