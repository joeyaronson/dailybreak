import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GOATCOUNTER_URL')
  const goatcounter = (process.env.GOATCOUNTER_URL ?? env.GOATCOUNTER_URL ?? '').trim()
  const endpoint = goatcounter ? new URL('/count', goatcounter) : null
  if (endpoint && (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.goatcounter\.com$/.test(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port)) {
    throw new Error('GOATCOUNTER_URL must be an HTTPS GoatCounter site address.')
  }
  return {
    plugins: [
      react(),
      {
        name: 'visit-counts',
        transformIndexHtml() {
          if (command !== 'build' || mode !== 'production' || !endpoint) return []
          return [{
            tag: 'script',
            attrs: { async: true, src: 'https://gc.zgo.at/count.js', 'data-goatcounter': endpoint.href },
            injectTo: 'head',
          }]
        },
      },
      {
        name: 'reload-brick-scene',
        handleHotUpdate({ file, server }) {
          // Rebuild the imperative Three.js scene from scratch on edits.
          if (file.endsWith('/src/components/BrickGrid.tsx')) {
            server.ws.send({ type: 'full-reload' })
            return []
          }
        },
      },
    ],
  }
})
