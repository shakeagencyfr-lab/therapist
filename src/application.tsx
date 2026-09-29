/**
 * Monter l'application — l'espace de la praticienne, du revendeur, la vitrine
 * d'un cabinet, la porte d'entrée.
 *
 * Chargé par src/main.tsx dès que l'adresse n'est pas celle de la page de
 * vente. Séparé d'elle pour que chacune ne télécharge que ce qu'elle montre.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root'

export function monter(racine: HTMLElement): void {
  createRoot(racine).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
}
