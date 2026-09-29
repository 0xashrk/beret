import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages serves the demo from /beret/
  base: process.env.GITHUB_PAGES ? '/beret/' : '/',
  plugins: [react()],
  server: { port: 5191 },
  test: { environment: 'node' }
})
