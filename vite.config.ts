import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Les adresses propres du produit, en développement.
 *
 * En production c'est vercel.json qui réécrit ; le serveur de Vite, lui, ne
 * connaît que les fichiers. Sans ce petit intermédiaire, /mon et
 * /son-cabinet/mon répondent 404 en local et la marque blanche ne se teste
 * qu'une fois déployée. Il ne sert QUE le développement — le build n'en voit
 * pas une ligne.
 */
function adressesEnDev() {
  const routes: [RegExp, string][] = [
    [/^\/mon\/?$/, '/patient.html'],
    [/^\/c\/[a-z0-9][a-z0-9-]{0,62}\/?$/i, '/index.html'],
    [/^\/e\/[a-z0-9][a-z0-9-]{0,62}\/?$/i, '/embed.html'],
    [/^\/[a-z0-9][a-z0-9-]{0,62}\/mon\/?$/i, '/patient.html'],
  ]
  return {
    name: 'klaro-adresses-dev',
    apply: 'serve' as const,
    configureServer(serveur: { middlewares: { use: (fn: Middleware) => void } }) {
      serveur.middlewares.use((req, _res, next) => {
        const chemin = (req.url ?? '').split('?')[0]
        const cible = routes.find(([forme]) => forme.test(chemin))
        if (cible) req.url = cible[1]
        next()
      })
    },
  }
}

type Middleware = (
  req: { url?: string },
  res: unknown,
  next: () => void,
) => void

// Le client n'appelle jamais l'API Claude directement : la clé ne doit pas
// atteindre le navigateur. En développement, /api est proxifié vers le
// serveur Node local (server/index.ts).
export default defineConfig({
  plugins: [react(), adressesEnDev()],
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
