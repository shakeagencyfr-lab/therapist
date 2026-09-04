/**
 * Point d'entrée de l'espace patient.
 *
 * Un site à part, servi sur sa propre adresse : le patient n'atteint jamais
 * l'outil de sa thérapeute, et son téléchargement ne contient pas une ligne
 * du code de l'espace cabinet.
 */
import { StrictMode, useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider, useAuth } from './auth/session'
import { SignIn } from './auth/SignIn'
import { PatientSpace } from './patient/PatientSpace'
import {
  cabinetDuDomaine,
  estDomainePersonnalise,
  lireVitrine,
  slugDeLEspacePatient,
  type Vitrine,
} from './lib/vitrine'
import { titreDuCabinet, useEnTete } from './lib/enTete'
import { applyTheme, defaultTheme } from './theme/theme'
import './styles/global.css'

applyTheme(defaultTheme)

/**
 * Le cabinet dont la porte s'ouvre, s'il y en a un.
 *
 * Deux adresses le désignent, et elles font la même chose : son domaine à lui
 * quand il en a un, et `/son-identifiant/mon` quand il n'en a pas. La seconde
 * rend la marque utilisable sans acheter de nom de domaine ni toucher à des
 * DNS — ce qui, pour la majorité des cabinets, est la seule option réaliste.
 *
 * L'ADRESSE NE DÉCIDE DE RIEN D'AUTRE QUE DE LA PORTE. Elle n'ouvre pas un
 * espace « du cabinet 1 » : c'est la session qui dit qui entre, et une
 * patiente du cabinet A qui passerait par l'adresse du cabinet B verrait la
 * porte de B puis son espace à elle. Le contraire — filtrer l'accès sur
 * l'adresse — donnerait une fausse impression de cloisonnement, alors que le
 * vrai cloisonnement est en base.
 */
function useCabinetDeLaPorte(): { vitrine: Vitrine | null; cherche: boolean } {
  const chemin = typeof window === 'undefined' ? '' : window.location.pathname
  const hote = typeof window === 'undefined' ? '' : window.location.host
  const slug = slugDeLEspacePatient(chemin)
  const propre = estDomainePersonnalise(hote)
  const [vitrine, setVitrine] = useState<Vitrine | null>(null)
  const [cherche, setCherche] = useState(Boolean(slug) || propre)

  useEffect(() => {
    if (!slug && !propre) return
    let vivant = true
    void (async () => {
      const trouve = propre ? await cabinetDuDomaine(hote) : slug ? await lireVitrine(slug) : null
      if (!vivant) return
      setVitrine(trouve)
      setCherche(false)
    })()
    return () => {
      vivant = false
    }
  }, [hote, propre, slug])

  return { vitrine, cherche }
}

function Portail() {
  const { phase, context } = useAuth()
  const { vitrine, cherche } = useCabinetDeLaPorte()

  /* L'onglet aussi porte la marque du cabinet. Un patient qui met son espace
     en favori garde ce titre sur son écran d'accueil : « Klaro » y resterait
     des mois après que sa thérapeute a payé pour ne plus le voir. */
  useEnTete(vitrine ? titreDuCabinet(vitrine.name, 'Votre espace') : '')

  /** La porte, à la marque du cabinet quand l'adresse en désigne un. */
  const marque = vitrine
    ? {
        marque: vitrine.branding?.logo ?? 'KL',
        logoUrl: vitrine.branding?.logoUrl ?? null,
        cabinet: vitrine.name,
        tagline: vitrine.tagline || 'Espace thérapie',
      }
    : {}

  const couleurs = vitrine?.branding
    ? ({
        '--c-accent': vitrine.branding.accent,
        '--c-accent-hover': vitrine.branding.accentHover,
        '--c-accent-deep': vitrine.branding.accentDeep,
        '--c-dark': vitrine.branding.dark,
      } as CSSProperties)
    : undefined

  if (phase === 'sans-base') {
    return (
      <SignIn
        titre="Espace non configuré"
        intro="Cette installation n'est pas encore reliée à sa base de données. Prévenez votre cabinet."
      />
    )
  }

  if (phase === 'chargement') return null

  if (phase === 'deconnecte') {
    /* On attend de savoir de quel cabinet il s'agit : afficher la marque du
       produit une demi-seconde avant de la remplacer par celle du cabinet
       est exactement ce que la marque blanche est censée éviter. */
    if (cherche) return null
    return (
      <div style={couleurs}>
        <SignIn
          titre={vitrine ? `Votre espace — ${vitrine.name}` : 'Votre espace'}
          intro="Entrez l'adresse que vous avez donnée à votre thérapeute : vous recevrez un lien qui vous connecte, sans mot de passe à retenir."
          {...marque}
        />
      </div>
    )
  }

  /* Deux situations mènent ici, et l'une n'est pas une erreur : le suivi
     s'est terminé, sa fiche a été close, et l'espace se ferme avec elle. Lui
     dire que son adresse est fausse serait lui faire chercher une faute qui
     n'existe pas. */
  if (!context?.patient) {
    return (
      <div style={couleurs}>
        <SignIn
          titre="Aucun suivi en cours à cette adresse"
          intro="Votre compte existe. Si votre suivi vient de se terminer, c'est normal : votre espace se ferme avec lui, et votre thérapeute peut le rouvrir. Sinon, vérifiez avec elle l'adresse qu'elle a enregistrée."
          {...marque}
        />
      </div>
    )
  }

  return <PatientSpace />
}

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <Portail />
    </SessionProvider>
  </StrictMode>,
)
