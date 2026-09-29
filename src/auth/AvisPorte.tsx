import type { ReactNode } from 'react'
import { Marque } from '@/components/ui'
import { logoDePorte } from '@/theme/klaro'
import s from './SignIn.module.css'

/**
 * Un avis à la place de la porte : même carte, même marque, pas de formulaire.
 *
 * Pour ce que la porte n'a pas à demander — un compte déjà connecté qui
 * n'est pas attendu ici, une lecture des accès qui a manqué. Ces cas-là
 * s'affichaient avec le formulaire de connexion dessous, à une personne
 * déjà connectée : elle retapait son adresse, recevait un lien, et
 * retombait au même endroit. Il lui faut une sortie, pas un champ.
 */
export function AvisPorte({
  titre,
  texte,
  children,
  marque = 'KL',
  logoUrl = null,
  cabinet = 'Klaro',
  tagline = 'Suivi entre les séances',
}: {
  titre: string
  texte: string
  /** Les gestes proposés : au moins une sortie. */
  children: ReactNode
  marque?: string
  logoUrl?: string | null
  cabinet?: string
  tagline?: string
}) {
  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.brand}>
          <Marque className={s.logo} logo={marque} url={logoDePorte(cabinet, logoUrl)} />
          <div>
            <div className={s.name}>{cabinet}</div>
            <div className={s.tagline}>{tagline}</div>
          </div>
        </div>
        <h1 className={s.title}>{titre}</h1>
        <p className={s.intro}>{texte}</p>
        <div className={s.actions}>{children}</div>
      </div>
    </div>
  )
}
