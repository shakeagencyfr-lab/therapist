/**
 * Point d'entrée de l'espace patient.
 *
 * Un site à part, servi sur sa propre adresse : le patient n'atteint jamais
 * l'outil de sa thérapeute, et son téléchargement ne contient pas une ligne
 * du code de l'espace cabinet.
 */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider, useAuth } from './auth/session'
import { AvisPorte } from './auth/AvisPorte'
import { SignIn } from './auth/SignIn'
import { Button, Notice } from './components/ui'
import { PatientSpace } from './patient/PatientSpace'
import { supprimerCeCompte } from './patient/suppressionCompte'
import {
  cabinetDuDomaine,
  estDomainePersonnalise,
  lireVitrine,
  slugDeLEspacePatient,
  type Vitrine,
} from './lib/vitrine'
import { variablesDeMarque } from './lib/couleurs'
import { cheminSousIdentifiant } from './lib/identifiant'
import { titreDuCabinet, useEnTete } from './lib/enTete'
import { adresseDuManifeste } from './lib/rappels'
import { ecouterInstallation } from './patient/installation'
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
      /* Une ancienne adresse mène toujours au cabinet (0049) : l'espace
         installé et les rappels déjà programmés la rouvrent. On la réécrit
         sous l'identifiant actuel, sans recharger — le fragment d'un lien de
         connexion reste où il est. */
      if (!propre && slug && trouve?.slug && trouve.slug !== slug) {
        const suite = cheminSousIdentifiant(window.location.pathname, slug, trouve.slug)
        if (suite) {
          window.history.replaceState(window.history.state, '', `${suite}${window.location.search}${window.location.hash}`)
        }
      }
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
  const { phase, context, lecture, seDeconnecter } = useAuth()
  const { vitrine, cherche } = useCabinetDeLaPorte()

  /* L'onglet aussi porte la marque du cabinet. Un patient qui met son espace
     en favori garde ce titre sur son écran d'accueil : « Klaro » y resterait
     des mois après que sa thérapeute a payé pour ne plus le voir.

     UNE FOIS CONNECTÉ, C'EST SON CABINET QUI NOMME L'ONGLET, pas l'adresse.
     Le titre ne suivait que le cabinet désigné par l'URL : sur /mon — le
     retour d'un paiement, le widget du site, l'icône installée depuis /mon
     —, l'onglet restait « Klaro — Votre espace » alors que l'espace ouvert
     porte, lui, la marque du cabinet. */
  const nomDuCabinet = context?.patient?.cabinet_name || vitrine?.name || ''
  useEnTete(nomDuCabinet ? titreDuCabinet(nomDuCabinet, 'Votre espace') : '')

  /** La porte, à la marque du cabinet quand l'adresse en désigne un. */
  const marque = vitrine
    ? {
        marque: vitrine.branding?.logo ?? 'KL',
        logoUrl: vitrine.branding?.logoUrl ?? null,
        cabinet: vitrine.name,
        tagline: vitrine.tagline || 'Espace thérapie',
      }
    : {}

  /* Validées avant de devenir des variables : une couleur mal formée ne lève
     rien, elle rend le bouton de la porte transparent. */
  const couleurs = variablesDeMarque(vitrine?.branding)

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
          intro="Entrez l'adresse que vous avez donnée à votre thérapeute : vous recevrez de quoi vous connecter, sans mot de passe à retenir."
          {...marque}
        />
      </div>
    )
  }

  /* Une panne de lecture n'est pas une absence de suivi. Sans cette branche,
     une patiente connectée lisait « Aucun suivi en cours à cette adresse »
     parce que la base n'avait pas répondu à temps — et allait demander à sa
     thérapeute pourquoi son suivi avait été fermé. */
  if (lecture === 'echec') {
    return (
      <div style={couleurs}>
        <AvisPorte
          titre="Vos accès n'ont pas pu être lus"
          texte="Ce n'est pas votre adresse qui est en cause : la base n'a pas répondu. Réessayez dans un instant."
          {...marque}
        >
          <Button variant="primary" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        </AvisPorte>
      </div>
    )
  }

  /* Un compte de cabinet ou de revendeur n'a pas de suivi, et c'est normal :
     son espace est à la racine. Sans cette branche, il lisait « Aucun suivi
     en cours » sous un formulaire de connexion, sans autre sortie que de se
     reconnecter — pour retomber ici. */
  if (!context?.patient && (context?.cabinet || context?.reseller)) {
    return (
      <div style={couleurs}>
        <AvisPorte
          titre="Votre espace est ailleurs"
          texte={
            context?.cabinet
              ? "Cette adresse ouvre l'espace des personnes suivies. Le vôtre, celui de votre cabinet, s'ouvre à la page principale."
              : "Cette adresse ouvre l'espace des personnes suivies. Le vôtre, l'espace revendeur, s'ouvre à la page principale."
          }
          {...marque}
        >
          <Button variant="primary" onClick={() => (window.location.href = '/')}>
            Ouvrir mon espace
          </Button>
          <Button variant="secondary" onClick={() => void seDeconnecter()}>
            Utiliser une autre adresse
          </Button>
        </AvisPorte>
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
        <SansSuivi marque={marque} />
      </div>
    )
  }

  return <PatientSpace />
}

/**
 * Connecté, sans suivi ouvert ni autre espace : l'avis, et deux sorties.
 *
 * C'ÉTAIT UNE PORTE SANS SORTIE. L'écran montrait le formulaire de connexion
 * à une personne déjà connectée — elle retapait son adresse, et retombait ici.
 * Et une fois le suivi clos, plus rien ne permettait de supprimer son compte
 * ni son journal : « Moi » s'était fermé avec l'espace. Les deux sorties sont
 * désormais là : changer d'adresse, ou partir en effaçant ce qu'on a écrit.
 */
function SansSuivi({
  marque,
}: {
  /** La marque de la porte, quand l'adresse désigne un cabinet. */
  marque: { marque?: string; logoUrl?: string | null; cabinet?: string; tagline?: string }
}) {
  const { seDeconnecter } = useAuth()
  const [confirme, setConfirme] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState('')

  async function supprimer() {
    if (enCours) return
    setEnCours(true)
    setEchec('')
    const refus = await supprimerCeCompte(seDeconnecter)
    // Sans refus, la page repart déjà vers la porte : rien à remettre.
    if (refus) {
      setEnCours(false)
      setEchec(refus)
    }
  }

  return (
    <AvisPorte
      titre="Aucun suivi en cours à cette adresse"
      texte="Votre compte existe. Si votre suivi vient de se terminer, c'est normal : votre espace se ferme avec lui, et votre thérapeute peut le rouvrir. Sinon, vérifiez auprès de votre thérapeute l'adresse enregistrée dans votre fiche."
      {...marque}
    >
      {confirme ? (
        <>
          {/* Dit avant, comme dans « Moi » : le journal ne revient pas, et
              le dossier du suivi, lui, reste au cabinet. */}
          <p style={{ flexBasis: '100%', margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--c-text-3)' }}>
            Votre compte sera supprimé et votre journal effacé — celui-là ne revient pas. Le dossier
            de votre suivi reste au cabinet, qui doit le conserver ; pour qu'il soit effacé,
            demandez-le à votre thérapeute.
          </p>
          <Button variant="danger" disabled={enCours} onClick={() => void supprimer()}>
            {enCours ? 'Suppression…' : 'Oui, tout supprimer'}
          </Button>
          <Button variant="secondary" disabled={enCours} onClick={() => setConfirme(false)}>
            Annuler
          </Button>
        </>
      ) : (
        <>
          <Button variant="primary" onClick={() => void seDeconnecter()}>
            Utiliser une autre adresse
          </Button>
          <Button variant="ghost" onClick={() => setConfirme(true)}>
            Supprimer mon compte et mon journal
          </Button>
        </>
      )}
      {echec ? (
        <div role="alert" style={{ flexBasis: '100%' }}>
          <Notice tone="warn">{echec}</Notice>
        </div>
      ) : null}
    </AvisPorte>
  )
}

/* L'espace installé doit rouvrir LA porte du cabinet. Le manifeste est le
   même pour tous, mais lu depuis /son-cabinet/manifest.webmanifest, ses
   chemins relatifs s'y résolvent : « ./mon » devient /son-cabinet/mon.
   Posé ici plutôt qu'en dur dans la page, pour valoir aussi derrière une
   barre oblique finale. */
const manifeste = document.getElementById('manifeste')
if (manifeste instanceof HTMLLinkElement) {
  manifeste.href = adresseDuManifeste(window.location.pathname)
}

/* Chrome n'annonce qu'une fois qu'il sait installer l'espace, et souvent
   avant le premier rendu : on écoute avant de monter quoi que ce soit. */
ecouterInstallation()

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <Portail />
    </SessionProvider>
  </StrictMode>,
)
