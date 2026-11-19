import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Mã bản build: tab đang mở so với /version.json để biết đã có bản mới hay chưa.
const APP_BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || `local-${Date.now().toString(36)}`

function appVersionFile(): Plugin {
  return {
    name: 'app-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: APP_BUILD_ID }),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    appVersionFile(),
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
