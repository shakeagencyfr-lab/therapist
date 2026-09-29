/**
 * Ce que Root montre autour de la page de vente — et la porte des
 * praticiennes, sur /connexion.
 *
 * La page de vente s'affiche d'ordinaire sans l'application (src/main.tsx).
 * Deux cas passent pourtant par Root, et c'est ici qu'on les règle :
 *
 *   - /connexion : la porte des praticiennes, l'écran de connexion titré
 *     « Espace praticien », avec un chemin de retour vers la page. Le lien
 *     magique y revient (session.tsx : emailRedirectTo = origine + chemin) ;
 *     connecté, l'adresse redevient la racine et l'espace s'ouvre.
 *   - la racine, avec une session stockée qui s'avère morte : on n'y montre
 *     plus la porte, mais la page — il n'y a personne de connecté.
 */
import { lazy, Suspense, useEffect } from 'react'
import { SignIn } from '@/auth/SignIn'
import { useAuth } from '@/auth/session'
import { entreeDeLAdresse, estLaPorte } from './decision'
import s from './Porte.module.css'

const PageDeVente = lazy(() => import('./PageDeVente'))

/** L'adresse ouverte est-elle la porte des praticiennes ? */
export function surLaPorte(): boolean {
  return typeof window !== 'undefined' && estLaPorte(window.location.pathname)
}

/**
 * Sans personne de connecté, cette adresse montre-t-elle la page de vente ?
 * La décision de src/main.tsx, session mise de côté : on sait ici qu'il n'y
 * en a pas.
 */
export function pageDeVenteIci(): boolean {
  if (typeof window === 'undefined') return false
  const { host, pathname, search, hash } = window.location
  return entreeDeLAdresse({ hote: host, chemin: pathname, recherche: search, fragment: hash }, false) === 'vente'
}

/**
 * Connecté sur /connexion : l'adresse redevient la racine, sans recharger.
 * L'espace s'ouvre à l'adresse où il vit — et un rechargement, ou un favori
 * posé ensuite, n'ouvrira pas la porte à quelqu'un qui est déjà entré.
 */
export function useQuitterLaPorte(phase: string): void {
  useEffect(() => {
    if (phase !== 'connecte' || !surLaPorte()) return
    window.history.replaceState(window.history.state, '', '/')
  }, [phase])
}

/** La porte des praticiennes, sur /connexion. */
export function PortePraticienne({ avis = null }: { avis?: string | null }) {
  return (
    <div className={s.porte}>
      <a className={s.retour} href="/">
        <span aria-hidden="true">←</span> Retour à l’accueil
      </a>
      <SignIn
        titre="Espace praticien"
        intro="Entrez l'adresse qui a reçu votre invitation : vous recevrez un lien de connexion, et un code si vous préférez le saisir."
        avis={avis}
      />
    </div>
  )
}

/**
 * La page de vente, montrée par Root à la racine quand personne n'est
 * connecté. Tant que la reprise d'une session stockée traîne
 * (`verificationLente`), c'est la porte qui reste : elle sait dire que
 * l'espace s'ouvrira tout seul, la page de vente non.
 */
export function VenteOuPorte({ porte }: { porte: React.ReactNode }) {
  const { verificationLente } = useAuth()
  if (verificationLente) return <>{porte}</>
  return (
    <Suspense fallback={null}>
      <PageDeVente />
    </Suspense>
  )
}
