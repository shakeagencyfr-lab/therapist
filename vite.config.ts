import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Le client n'appelle jamais l'API Claude directement : la clé ne doit pas
// atteindre le navigateur. En développement, /api est proxifié vers le
// serveur Node local (server/index.ts).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Deux surfaces, deux téléchargements : le patient ne reçoit pas une
    // ligne du code de l'espace cabinet.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        patient: fileURLToPath(new URL('./patient.html', import.meta.url)),
        embed: fileURLToPath(new URL('./embed.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
