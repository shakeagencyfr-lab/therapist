/**
 * Point d'entrée du widget d'intégration.
 *
 * Servi sur /e/<identifiant>, et lui seul est encadrable par un site tiers :
 * il ne monte ni l'espace cabinet, ni l'espace patient, ni la moindre donnée.
 * Il n'y a rien à voler dans un cadre qui ne contient qu'un champ d'adresse.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmbedSignIn } from './embed/EmbedSignIn'
import { applyTheme, defaultTheme } from './theme/theme'
import './styles/global.css'

applyTheme(defaultTheme)

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <EmbedSignIn />
  </StrictMode>,
)
