import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"

const agentProxyTarget =
  process.env.AGENT_SERVICE_URL ||
  process.env.VITE_AGENT_PROXY_TARGET ||
  'http://localhost:6000'

const compilerProxyTarget =
  process.env.COMPILER_SERVICE_URL ||
  process.env.VITE_COMPILER_PROXY_TARGET ||
  'http://localhost:3002'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/terminal': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "simple-git": path.resolve(__dirname, "./src/lib/simple-git-stub.ts"),
    }
  },
  build: {
    rollupOptions: {
      external: ['simple-git', 'child_process', 'fs', 'node:buffer', 'node:events'],
    }
  },
  optimizeDeps: {
    exclude: ['simple-git']
  }
})
