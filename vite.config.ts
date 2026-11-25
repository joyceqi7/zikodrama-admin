import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    // 本地联调走同源代理；部署后浏览器访问构建时固定的 API Origin。
    proxy: {
      '/admin': 'http://127.0.0.1:18080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    testTimeout: 20_000,
    maxWorkers: 1,
  },
})
