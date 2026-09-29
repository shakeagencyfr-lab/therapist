/**
 * Monter une page légale seule, sans l'application.
 *
 * C'est ce que src/main.tsx charge quand l'adresse est /confidentialite,
 * /cgu ou /mentions : ni le client de la base, ni la session, ni les écrans
 * du cabinet. Une page légale doit s'ouvrir même quand la base ne répond
 * pas, et sans faire télécharger l'outil d'une thérapeute à qui vient
 * seulement lire ce qu'on fait de ses données.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { pageLegaleDuChemin } from './chemins'
import { PageLegaleVue } from './PageLegale'

export function monter(racine: HTMLElement): void {
  // main.tsx n'appelle ce module que sur une page légale ; au pire, la politique.
  const cle = pageLegaleDuChemin(window.location.pathname) ?? 'confidentialite'
  createRoot(racine).render(
    <StrictMode>
      <PageLegaleVue cle={cle} />
    </StrictMode>,
  )
}
