import { useEffect, useState } from 'react'
import { App } from './App'
import { CabinetProvider } from './cabinet/context'
import { DroitsProvider } from './cabinet/droits'
import { JetonsProvider } from './cabinet/useJetons'
import { DeuxiemeFacteur } from './auth/DeuxiemeFacteur'
import { GardeConditions } from './auth/GardeConditions'
import { GardeInactivite, prendreNoteDeSortie } from './auth/Inactivite'
import { SignIn } from './auth/SignIn'
import { SessionProvider, useAuth } from './auth/session'
import { Button } from './components/ui'
import { variablesDeMarque } from './lib/couleurs'
import { KLARO, variablesKlaro } from './theme/klaro'
import { codeADemander } from './lib/doubleAuthentification'
import { lireDelai, phraseDeSortie, type DelaiInactivite } from './lib/inactivite'
import { verifierCodeDeConnexion } from './services/securiteDuCompte'
import { lireRetourDePaiement } from './services/jetons'
import { cheminEspacePatient } from './lib/domaine'
import { cheminSousIdentifiant } from './lib/identifiant'
import { DOSSIER_AVANT_LECTURE } from './state/state'
import { AppStoreProvider } from './state/store'
import {
  cabinetDuDomaine,
  estDomainePersonnalise,
  lireSiteVitrine,
  lireVitrine,
  slugDuChemin,
  type SiteVitrine,
  type Vitrine,
} from './lib/vitrine'
import { VitrinePage } from './views/vitrine/VitrinePage'
import { pageDeVenteIci, PortePraticienne, surLaPorte, useQuitterLaPorte, VenteOuPorte } from './vente/Porte'
import s from './Root.module.css'

/**
 * Adresse de l'espace patient — un site à part, pensé pour le téléphone.
 *
 * Quand on arrive par l'adresse d'un cabinet, on y renvoie par la sienne :
 * `/son-identifiant/mon` ouvre exactement le même espace que `/mon`, mais la
 * porte porte sa marque. Perdre le cabinet en chemin ferait réapparaître la
 * nôtre juste après l'avoir quittée.
 */
function espacePatient(): string {
  const slug = typeof window === 'undefined' ? null : slugDuChemin(window.location.pathname)
  return cheminEspacePatient(slug ?? '')
}

/**
 * La vitrine du cabinet dont l'adresse a été ouverte.
 *
 * Trois états, et ils comptent tous les trois : on cherche (on n'affiche
 * rien, plutôt que de montrer Klaro une demi-seconde avant de le remplacer),
 * on a trouvé (on affiche sa marque), ou l'adresse ne désigne aucun cabinet
 * (on affiche Klaro, comme sur la page d'accueil).
 *
 * Deux adresses mènent au même cabinet : le chemin /son-identifiant, et son
 * propre domaine quand il en a posé un. Le domaine est interrogé le premier —
 * une thérapeute qui a payé sa marque blanche n'a pas à voir la nôtre.
 *
 * S'il a publié un site vitrine, c'est lui qui s'affiche, avec la porte de
 * connexion posée dedans. Sinon, la porte seule, à ses couleurs.
 */
function useVitrine(): { vitrine: Vitrine | null; site: SiteVitrine | null; cherche: boolean } {
  const chemin = typeof window === 'undefined' ? null : slugDuChemin(window.location.pathname)
  const hote = typeof window === 'undefined' ? '' : window.location.host
  const propre = estDomainePersonnalise(hote)
  const [vitrine, setVitrine] = useState<Vitrine | null>(null)
  const [site, setSite] = useState<SiteVitrine | null>(null)
  const [cherche, setCherche] = useState(Boolean(chemin) || propre)

  useEffect(() => {
    if (!chemin && !propre) return
    let vivant = true
    void (async () => {
      const parDomaine = propre ? await cabinetDuDomaine(hote) : null
      const slug = parDomaine?.slug ?? chemin
      if (!slug) {
        if (vivant) setCherche(false)
        return
      }
      const [marque, lu] = await Promise.all([
        parDomaine ? Promise.resolve(parDomaine as Vitrine) : lireVitrine(slug),
        lireSiteVitrine(slug),
      ])
      if (!vivant) return
      /* UNE ANCIENNE ADRESSE MÈNE AU CABINET (0049). `cabinet_vitrine` la
         résout et rend l'identifiant actuel : on réécrit l'adresse — sans
         recharger, le fragment d'un lien de connexion compris — et on relit
         le site sous le bon nom, puisque c'est lui qu'il porte. */
      let page = lu
      const actuel = parDomaine ? null : marque?.slug
      if (actuel && actuel !== slug) {
        const suite = cheminSousIdentifiant(window.location.pathname, slug, actuel)
        if (suite) {
          window.history.replaceState(window.history.state, '', `${suite}${window.location.search}${window.location.hash}`)
        }
        page = await lireSiteVitrine(actuel)
        if (!vivant) return
      }
      setVitrine(marque)
      setSite(page)
      setCherche(false)
    })()
    return () => {
      vivant = false
    }
  }, [chemin, hote, propre])

  return { vitrine, site, cherche }
}

function Attente() {
  return (
    <div className={s.center}>
      <span className={s.wait}>Vérification de votre accès…</span>
    </div>
  )
}

function Message({
  titre,
  texte,
  children,
}: {
  titre: string
  texte: string
  children?: React.ReactNode
}) {
  return (
    <div className={s.center}>
      <div className={s.card}>
        <h1 className={s.title}>{titre}</h1>
        <p className={s.text}>{texte}</p>
        {children}
      </div>
    </div>
  )
}

function Portail() {
  const { phase, context, seDeconnecter, lecture, session, secondFacteur, niveau } = useAuth()
  const { vitrine, site, cherche } = useVitrine()
  // Connecté sur /connexion : l'adresse redevient la racine (src/vente/Porte.tsx).
  useQuitterLaPorte(phase)

  /* POURQUOI ON REVIENT À LA PORTE. Quand la session vient de se fermer pour
     inactivité, la porte le dit — sinon, on croit à une panne. La note est
     lue au passage à « déconnecté » (et au chargement d'une page déjà
     déconnectée), puis oubliée à la connexion suivante. */
  const [sortie, setSortie] = useState<DelaiInactivite | null>(null)
  useEffect(() => {
    if (phase === 'deconnecte') {
      const note = prendreNoteDeSortie()
      if (note) setSortie(note)
    } else if (phase === 'connecte') {
      setSortie(null)
    }
  }, [phase])
  const avis = sortie ? phraseDeSortie(sortie) : null

  // Sans base configurée, l'application tourne sur ses données de
  // démonstration : c'est ce qui permet de montrer les écrans sans compte.
  if (phase === 'sans-base') {
    return (
      <>
        <div className={s.demo}>
          Mode démonstration — données fictives, aucune base connectée.
        </div>
        <AppStoreProvider>
          <App />
        </AppStoreProvider>
      </>
    )
  }

  if (phase === 'chargement') return <Attente />

  /* UNE PAGE PUBLIQUE EST PUBLIQUE, MÊME POUR QUI EST CONNECTÉ.
     Elle ne se montrait qu'aux visiteurs déconnectés : la thérapeute ne
     pouvait pas voir sa propre page publiée — « Voir ma page ↗ » lui ouvrait
     son tableau de bord — et un patient qui avait une session ouverte
     recevait l'application au lieu de la page de son cabinet, sur le domaine
     de ce cabinet. C'est l'ADRESSE qui décide de cette page, pas la session ;
     l'application, elle, vit à la racine et sur /mon. */
  /* `cherche` n'est vrai que sur une adresse de cabinet — un identifiant dans
     le chemin, ou un domaine posé par un cabinet. À la racine, il est faux et
     l'application s'ouvre sans attendre. */
  if (cherche) return <Attente />
  if (site) return <VitrinePage site={site} />

  if (phase === 'deconnecte') {
    // Sinon, sur l'adresse d'un cabinet, la porte porte SA marque : c'est
    // tout l'intérêt de l'adresse. Ailleurs, celle du produit — avant la
    // connexion, on ne sait pas encore qui arrive.
    if (vitrine) {
      const b = vitrine.branding
      return (
        <div style={variablesDeMarque(b)}>
          <SignIn
            titre={`Entrer chez ${vitrine.name}`}
            intro="Entrez l'adresse que connaît votre cabinet : vous recevrez un lien qui vous connecte, sans mot de passe à retenir."
            marque={b?.logo ?? 'KL'}
            logoUrl={b?.logoUrl}
            cabinet={vitrine.name}
            tagline={vitrine.tagline || 'Espace thérapie'}
            avis={avis}
          />
        </div>
      )
    }
    /* LA PORTE DES PRATICIENNES, ET LA PAGE DE VENTE (src/vente/Porte.tsx).
       /connexion est la porte titrée « Espace praticien » ; la racine de la
       plateforme, sans personne de connecté, montre la page de vente. */
    if (surLaPorte()) return <PortePraticienne avis={avis} />
    const porte = (
      <SignIn
        titre="Entrer dans votre espace"
        intro="Cet espace est réservé à la praticienne et à son cabinet. Entrez l'adresse qui a reçu votre invitation : vous recevrez un lien de connexion."
        avis={avis}
        pro
      />
    )
    if (pageDeVenteIci()) return <VenteOuPorte porte={porte} />
    return porte
  }

  /* LA DOUBLE AUTHENTIFICATION. Tant qu'on ne sait pas si le compte a relié
     une application, rien ne s'ouvre ; s'il en a une et que la session n'a
     pas donné son code, on le demande AVANT l'espace. Rien du dossier n'est
     chargé derrière cet écran — et la base, de toute façon, n'en rendrait
     rien à une session « aal1 » (0056). */
  if (secondFacteur === 'attente') return <Attente />
  if (codeADemander(niveau, secondFacteur === 'inscrit')) {
    // La marque du cabinet quand on la connaît déjà ; celle du produit sinon.
    const b = context?.cabinet?.branding ?? vitrine?.branding
    return (
      <div style={b ? variablesDeMarque(b) : variablesKlaro()}>
        <DeuxiemeFacteur
          email={context?.email ?? session?.user.email ?? null}
          verifier={async (code) => {
            const r = await verifierCodeDeConnexion(code)
            return r.ok ? null : r.message
          }}
          seDeconnecter={() => void seDeconnecter()}
          marque={b?.logo ?? 'KL'}
          logoUrl={b?.logoUrl}
          cabinet={context?.cabinet?.name ?? vitrine?.name ?? 'Klaro'}
          tagline={
            context?.cabinet?.tagline ||
            vitrine?.tagline ||
            (context?.cabinet || vitrine ? 'Espace thérapie' : KLARO.slogan)
          }
        />
      </div>
    )
  }

  /* Une panne de lecture n'est pas une absence d'accès. Sans cette branche,
     l'écran d'après accuse l'adresse et fait chercher une faute inexistante,
     alors qu'il suffit de recharger. */
  if (lecture === 'echec') {
    return (
      <Message
        titre="Vos accès n'ont pas pu être lus"
        texte="Ce n'est pas votre adresse qui est en cause : la base n'a pas répondu. Réessayez dans un instant."
      >
        <Button variant="primary" onClick={() => window.location.reload()}>
          Recharger
        </Button>
      </Message>
    )
  }

  // Connecté, mais rien ne l'attendait.
  if (!context?.cabinet && !context?.reseller) {
    if (context?.patient) {
      return (
        <Message
          titre="Votre espace est ailleurs"
          texte="Ce site est celui de votre thérapeute. Le vôtre tient sur un téléphone : c'est là que vous retrouvez vos audios, vos tâches du jour et votre journal."
        >
          <Button variant="primary" onClick={() => (window.location.href = espacePatient())}>
            Ouvrir mon espace
          </Button>
        </Message>
      )
    }
    return (
      <Message
        titre="Aucun accès pour cette adresse"
        texte="Votre compte est bien créé, mais aucune fiche ni invitation ne l'attend. Demandez à votre cabinet, ou à votre revendeur, de vous inviter avec cette adresse."
      >
        <Button variant="secondary" onClick={seDeconnecter}>
          Utiliser une autre adresse
        </Button>
      </Message>
    )
  }

  // L'espace ouvert découle du rôle, pas d'un choix : un revendeur qui n'est
  // pas praticienne n'a pas d'espace cabinet à ouvrir, et inversement.
  // Un vrai cabinet part d'un dossier vide, jamais des fiches de démonstration.
  /* LE RETOUR DE LA PAGE DE PAIEMENT. Stripe renvoie à la racine avec
     `?jetons=…` : c'est dans Intégrations que la praticienne lit ce qu'il
     a confirmé (src/cabinet/useJetons.ts), on l'y ouvre donc d'emblée. */
  const retourDePaiement = context.cabinet ? lireRetourDePaiement(window.location.search) : null

  return (
    <AppStoreProvider
      initial={
        context.cabinet
          ? { space: 'cabinet', ...DOSSIER_AVANT_LECTURE, ...(retourDePaiement ? { mode: 'integrations' as const } : {}) }
          : { space: 'reseller' }
      }
    >
      <CabinetProvider cabinetId={context.cabinet?.id ?? null}>
        <DroitsProvider actif={Boolean(context.cabinet)}>
          <JetonsProvider actif={Boolean(context.cabinet)}>
            {/* LES CONDITIONS, AVANT L'ESPACE (0067). Sous le fournisseur des
                droits : une marque blanche ne voit pas Klaro sur cette carte.
                Au-dessus de l'application : rien de l'espace ne s'ouvre avant
                l'accord — sauf panne de lecture, qui laisse entrer. */}
            <GardeConditions>
              <App />
            </GardeConditions>
          </JetonsProvider>
        </DroitsProvider>
      </CabinetProvider>
      {/* Un poste de cabinet est souvent partagé : la session se ferme sur
          cet appareil après le délai choisi dans « Mon compte ». Sous le
          magasin d'état, pour savoir si le micro d'une séance est ouvert. */}
      <GardeInactivite
        delaiMinutes={lireDelai(session?.user.user_metadata)}
        onExpire={() => void seDeconnecter()}
      />
    </AppStoreProvider>
  )
}

export function Root() {
  return (
    <SessionProvider doubleAuthentification>
      <Portail />
    </SessionProvider>
  )
}
