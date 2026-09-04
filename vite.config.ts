import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is overridable so the same build works on GitHub Pages project sites
// (https://user.github.io/repo/) and on any root-hosted static host.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
