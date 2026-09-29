import { applyTheme, defaultTheme } from './theme/theme'
import { entreeDuNavigateur } from './vente/decision'
import './styles/global.css'

applyTheme(defaultTheme)

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')
const racine: HTMLElement = root

/* DEUX MORCEAUX, UN SEUL TÉLÉCHARGÉ.
   La racine de la plateforme, sans session stockée, montre la page de
   vente — tout de suite, sans attendre la base (src/vente/decision.ts). Tout
   le reste ouvre l'application, comme avant. Chacune arrive par un import à
   part : la page ne tire pas l'application, ni l'application la page. */
const env = import.meta.env ?? {}
const monter: Promise<{ monter: (el: HTMLElement) => void }> =
  entreeDuNavigateur(env.VITE_SUPABASE_URL) === 'vente' ? import('./vente/monter') : import('./application')

monter
  .then((m) => m.monter(racine))
  .catch(() => {
    /* Un morceau qui n'arrive pas — réseau coupé, déploiement remplacé entre
       deux chargements — ne laisse pas une page blanche sans un mot. */
    racine.textContent = 'La page n’a pas pu se charger. Vérifiez votre connexion, puis rechargez.'
  })
