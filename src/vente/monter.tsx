/**
 * Monter la page de vente seule, sans l'application.
 *
 * C'est ce que src/main.tsx charge quand l'adresse est la racine de la
 * plateforme et qu'aucune session n'est stockée : ni le client Supabase, ni
 * le magasin d'état, ni les écrans du cabinet ne sont téléchargés. Les
 * aperçus vivants de la page arrivent ensuite, par leur propre morceau.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PageDeVente } from './PageDeVente'

export function monter(racine: HTMLElement): void {
  createRoot(racine).render(
    <StrictMode>
      <PageDeVente />
    </StrictMode>,
  )
}
