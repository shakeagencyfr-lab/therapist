/**
 * La page de vente de klaroweb.site.
 *
 * Pour des hypnothérapeutes en cabinet : ce qui se passe ENTRE les séances.
 * Sobre, chaleureuse, et vraie de bout en bout — chaque promesse renvoie à
 * du code qui existe (contenu.ts, et son épreuve), les prix sont ceux de la
 * table `plans`, la confidentialité est dite telle qu'elle est.
 *
 * Elle s'affiche SANS attendre la base : rien ici ne lit Supabase. Les deux
 * aperçus vivants (Demo.tsx) arrivent ensuite, par un morceau à part ; la
 * page ne les attend pas pour être lisible.
 */
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  CONFIDENTIALITE,
  FONCTIONNALITES,
  JOURS_ESSAI,
  MENTION_PRIX,
  offres,
  PAGES_LEGALES,
  PARCOURS,
  questions,
  SANS_LABEL,
} from './contenu'
import { CHEMIN_PORTE } from './decision'
import { Formulaire } from './Formulaire'
import { poserEnTeteDeVente } from './seo'
import s from './PageDeVente.module.css'

const TelephoneDemo = lazy(() => import('./Demo').then((m) => ({ default: m.TelephoneDemo })))
const SuiviDemo = lazy(() => import('./Demo').then((m) => ({ default: m.SuiviDemo })))

const ANCRES = [
  { id: 'parcours', libelle: 'Le parcours' },
  { id: 'fonctionnalites', libelle: 'Fonctionnalités' },
  { id: 'confidentialite', libelle: 'Confidentialité' },
  { id: 'offres', libelle: 'Offres' },
  { id: 'questions', libelle: 'Questions' },
] as const

/**
 * Monte son contenu quand il approche de l'écran — ou tout de suite, si le
 * navigateur ne sait pas le dire. Jamais côté serveur : le banc de rendu et
 * le premier affichage montrent la place réservée, pas l'aperçu.
 */
function Differe({ children, attente, immediat = false }: { children: ReactNode; attente: ReactNode; immediat?: boolean }) {
  const [monte, setMonte] = useState(false)
  const ancre = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (immediat || typeof IntersectionObserver === 'undefined') {
      setMonte(true)
      return
    }
    const cible = ancre.current
    if (!cible) return
    const obs = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          setMonte(true)
          obs.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    obs.observe(cible)
    return () => obs.disconnect()
  }, [immediat])
  return <div ref={ancre}>{monte ? <Suspense fallback={attente}>{children}</Suspense> : attente}</div>
}

/** La place du téléphone, le temps qu'il arrive : même taille, rien ne saute. */
function TelephoneEnAttente() {
  return (
    <div className={s.telephoneAttente} aria-hidden="true">
      <div className={s.telephoneAttenteEcran} />
    </div>
  )
}

function SuiviEnAttente() {
  return <div className={s.suiviAttente} aria-hidden="true" />
}

function Logo() {
  return (
    <a className={s.marque} href="/" aria-label="Klaro, retour en haut de l’accueil">
      <span className={s.logo} aria-hidden="true">
        KL
      </span>
      <span className={s.nomMarque} aria-hidden="true">
        Klaro
      </span>
    </a>
  )
}

function Entete({ onEssai }: { onEssai: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    if (!ouvert) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false)
    }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [ouvert])

  return (
    <header className={s.entete}>
      <div className={s.enteteInterieur}>
        <Logo />
        <nav className={s.nav} aria-label="Sections de la page">
          <button
            type="button"
            className={s.menuBouton}
            aria-expanded={ouvert}
            aria-controls="menu-vente"
            onClick={() => setOuvert((o) => !o)}
          >
            {ouvert ? 'Fermer' : 'Menu'}
          </button>
          <ul id="menu-vente" className={ouvert ? `${s.ancres} ${s.ancresOuvertes}` : s.ancres}>
            {ANCRES.map((a) => (
              <li key={a.id}>
                <a href={`#${a.id}`} onClick={() => setOuvert(false)}>
                  {a.libelle}
                </a>
              </li>
            ))}
            <li className={s.ancrePorte}>
              <a href={CHEMIN_PORTE}>Espace praticien</a>
            </li>
          </ul>
        </nav>
        <div className={s.enteteActions}>
          <a className={`${s.bouton} ${s.boutonDiscret} ${s.porteLarge}`} href={CHEMIN_PORTE}>
            Espace praticien
          </a>
          <a className={`${s.bouton} ${s.boutonPlein}`} href="#essai" onClick={onEssai}>
            Essayer {JOURS_ESSAI} jours
          </a>
        </div>
      </div>
    </header>
  )
}

export function PageDeVente() {
  const [offreProposee, setOffreProposee] = useState('')
  const liste = offres()
  const faq = questions()
  const annee = new Date().getFullYear()

  useEffect(() => poserEnTeteDeVente(), [])

  /** Aller au formulaire, une offre éventuellement cochée d'avance. */
  function versEssai(offre?: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      if (offre) setOffreProposee(offre)
      const cible = document.getElementById('essai')
      if (!cible) return
      e.preventDefault()
      cible.scrollIntoView({ block: 'start' })
      window.history.replaceState(window.history.state, '', '#essai')
      // Le focus suit la vue : au clavier, on arrive dans le formulaire.
      cible.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
    }
  }

  return (
    <div className={s.page}>
      <a className={s.evitement} href="#contenu">
        Aller au contenu
      </a>
      <Entete onEssai={versEssai()} />

      <main id="contenu" tabIndex={-1} className={s.principal}>
        {/* ── La promesse ─────────────────────────────────────────────── */}
        <section className={s.hero} aria-labelledby="titre-vente">
          <div className={s.heroTexte}>
            <p className={s.surtitre}>Pour les hypnothérapeutes en cabinet</p>
            <h1 id="titre-vente" className={s.titre}>
              Entre deux séances, <em>le travail continue.</em>
            </h1>
            <p className={s.chapeau}>
              Votre patient repart avec ses exercices, vos audios, son journal et ses rappels — sur son
              téléphone, à la marque de votre cabinet. Et vous voyez, avant la séance suivante, qui avance
              et qui décroche.
            </p>
            <div className={s.actions}>
              <a className={`${s.bouton} ${s.boutonPlein} ${s.boutonGrand}`} href="#essai" onClick={versEssai()}>
                Essayer {JOURS_ESSAI} jours
              </a>
              <a className={`${s.bouton} ${s.boutonContour} ${s.boutonGrand}`} href="#parcours">
                Voir le parcours
              </a>
            </div>
            <ul className={s.reperes}>
              <li>L’IA propose, vous validez</li>
              <li>Rien à installer pour vos patients</li>
              <li>Base et serveur à Paris</li>
            </ul>
          </div>
          <figure className={s.heroApercu}>
            <Differe immediat attente={<TelephoneEnAttente />}>
              <TelephoneDemo />
            </Differe>
            <figcaption className={s.legende}>
              L’espace patient, tel quel, sur des données de démonstration. Touchez une tâche, ouvrez le
              journal, notez la soirée.
            </figcaption>
          </figure>
        </section>

        {/* ── Le parcours ─────────────────────────────────────────────── */}
        <section id="parcours" className={s.section} aria-labelledby="titre-parcours">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Le parcours</p>
            <h2 id="titre-parcours" className={s.titreSection}>
              De la séance au suivi, en quatre temps
            </h2>
            <p className={s.intro}>
              Chaque étape vous laisse la main : l’IA rédige, vous décidez de ce qui part chez le patient.
            </p>
          </div>
          <ol className={s.etapes}>
            {PARCOURS.map((etape, i) => (
              <li key={etape.titre} className={s.etape}>
                <span className={s.numero} aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className={s.etapeTitre}>{etape.titre}</h3>
                <p className={s.etapeTexte}>{etape.texte}</p>
                <p className={s.etapeDetail}>{etape.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Le suivi, côté praticienne ──────────────────────────────── */}
        <section className={`${s.section} ${s.sectionClaire}`} aria-labelledby="titre-suivi">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Votre côté</p>
            <h2 id="titre-suivi" className={s.titreSection}>
              Vous voyez qui décroche, avant la séance suivante
            </h2>
            <p className={s.intro}>
              L’assiduité de chaque patient, semaine après semaine, et la courbe de son échelle du soir.
              Ce sont les écrans de la praticienne, sur des données de démonstration : choisissez un
              patient.
            </p>
          </div>
          <Differe attente={<SuiviEnAttente />}>
            <SuiviDemo />
          </Differe>
        </section>

        {/* ── Les fonctionnalités ─────────────────────────────────────── */}
        <section id="fonctionnalites" className={s.section} aria-labelledby="titre-fonctions">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Fonctionnalités</p>
            <h2 id="titre-fonctions" className={s.titreSection}>
              Ce qu’il faut entre deux séances, et rien de plus
            </h2>
          </div>
          <div className={s.groupes}>
            {FONCTIONNALITES.map((g) => (
              <div key={g.titre} className={s.groupe}>
                <h3 className={s.groupeTitre}>{g.titre}</h3>
                <p className={s.groupeIntro}>{g.intro}</p>
                <ul className={s.fonctions}>
                  {g.fonctions.map((f) => (
                    <li key={f.titre} className={s.fonction}>
                      <h4 className={s.fonctionTitre}>{f.titre}</h4>
                      <p className={s.fonctionTexte}>{f.texte}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── La confidentialité ──────────────────────────────────────── */}
        <section id="confidentialite" className={`${s.section} ${s.sectionSombre}`} aria-labelledby="titre-confidentialite">
          <div className={s.enTeteSection}>
            <p className={`${s.surtitre} ${s.surtitreSombre}`}>Confidentialité</p>
            <h2 id="titre-confidentialite" className={s.titreSection}>
              La confidentialité, telle qu’elle est
            </h2>
            <p className={s.intro}>
              Pas de formule vague : voici où va chaque donnée, et ce qui n’y va pas.
            </p>
          </div>
          <ul className={s.engagements}>
            {CONFIDENTIALITE.map((e) => (
              <li key={e.titre} className={s.engagement}>
                <h3 className={s.engagementTitre}>{e.titre}</h3>
                <p className={s.engagementTexte}>{e.texte}</p>
              </li>
            ))}
          </ul>
          <p className={s.sansLabel}>{SANS_LABEL}</p>
        </section>

        {/* ── Les offres ──────────────────────────────────────────────── */}
        <section id="offres" className={s.section} aria-labelledby="titre-offres">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Offres</p>
            <h2 id="titre-offres" className={s.titreSection}>
              Trois offres, un seul produit
            </h2>
            <p className={s.intro}>
              Toutes comprennent les séances assistées par l’IA et l’espace patient. Ce qui change : le
              nombre de patients, votre domaine, votre site, votre équipe.
            </p>
          </div>
          <ul className={s.offres}>
            {liste.map((o) => (
              <li key={o.code} className={s.offre}>
                <h3 className={s.offreNom}>{o.nom}</h3>
                <p className={s.offrePrix}>
                  <span className={s.offreMontant}>{o.prix}</span>
                  <span className={s.offrePeriode}> par mois</span>
                </p>
                <p className={s.offrePatients}>{o.patients}</p>
                <ul className={s.offreLignes}>
                  {o.lignes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <a
                  className={`${s.bouton} ${s.boutonContour} ${s.boutonLarge}`}
                  href="#essai"
                  onClick={versEssai(o.code)}
                  aria-label={`Essayer ${JOURS_ESSAI} jours — offre ${o.nom}`}
                >
                  Essayer {JOURS_ESSAI} jours
                </a>
              </li>
            ))}
          </ul>
          <p className={s.mention}>{MENTION_PRIX}</p>
          <p className={s.mention}>
            L’analyse par l’IA est payée à part, directement à Anthropic, avec la clé de votre cabinet :{' '}
            <a href="#questions">voir « Que coûte l’IA ? »</a>.
          </p>
        </section>

        {/* ── Les questions ───────────────────────────────────────────── */}
        <section id="questions" className={`${s.section} ${s.sectionClaire}`} aria-labelledby="titre-questions">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Questions</p>
            <h2 id="titre-questions" className={s.titreSection}>
              Les questions à se poser
            </h2>
          </div>
          <div className={s.questions}>
            {faq.map((q) => (
              <details key={q.question} className={s.question}>
                <summary className={s.questionResume}>
                  <h3 className={s.questionTitre}>{q.question}</h3>
                </summary>
                <p className={s.reponse}>{q.reponse}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── L'essai ─────────────────────────────────────────────────── */}
        <section id="essai" className={`${s.section} ${s.sectionEssai}`} aria-labelledby="titre-essai">
          <div className={s.essai}>
            <div className={s.essaiTexte}>
              <p className={s.surtitre}>Essai</p>
              <h2 id="titre-essai" className={s.titreSection}>
                Essayer Klaro {JOURS_ESSAI} jours
              </h2>
              <p className={s.intro}>
                Dites-nous qui vous êtes. Nous revenons vers vous rapidement pour ouvrir votre cabinet en
                essai : vous recevez une invitation par courriel, et vous entrez dans un cabinet prêt à
                accueillir votre premier patient.
              </p>
              <p className={s.intro}>
                Vous avez déjà un espace ? <a href={CHEMIN_PORTE}>Entrez-y par l’espace praticien</a>.
              </p>
            </div>
            <Formulaire offreProposee={offreProposee} />
          </div>
        </section>
      </main>

      <footer className={s.pied}>
        <div className={s.piedInterieur}>
          <div className={s.piedMarque}>
            <Logo />
            <p className={s.piedPhrase}>Le suivi entre les séances, pour les hypnothérapeutes.</p>
          </div>
          <nav aria-label="Liens de bas de page">
            <ul className={s.piedLiens}>
              <li>
                <a href={CHEMIN_PORTE}>Espace praticien</a>
              </li>
              {PAGES_LEGALES.map((p) => (
                <li key={p.chemin}>
                  <a href={p.chemin}>{p.libelle}</a>
                </li>
              ))}
            </ul>
          </nav>
          <p className={s.piedDroits}>© {annee} Klaro</p>
        </div>
      </footer>
    </div>
  )
}

export default PageDeVente
