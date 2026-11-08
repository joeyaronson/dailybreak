import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
})
