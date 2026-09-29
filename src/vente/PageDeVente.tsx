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
  ANCRE_COUT_IA,
  AUTRES_PRESTATAIRES,
  CONFIDENTIALITE,
  EDITEUR,
  ENSUITE,
  FONCTIONNALITES,
  JOURS_ESSAI,
  MENTION_PRIX,
  MODALITES,
  offres,
  PAGES_LEGALES,
  PARCOURS,
  pointsDeLaNote,
  questions,
  SANS_LABEL,
  type Etape,
  type Groupe,
} from './contenu'
import { CHEMIN_PORTE } from './decision'
import { Formulaire } from './Formulaire'
import { poserEnTeteDeVente } from './seo'
import s from './PageDeVente.module.css'

const TelephoneDemo = lazy(() => import('./Demo').then((m) => ({ default: m.TelephoneDemo })))
const SuiviDemo = lazy(() => import('./Demo').then((m) => ({ default: m.SuiviDemo })))
const NoteDemo = lazy(() => import('./Demo').then((m) => ({ default: m.NoteDemo })))

const ANCRES = [
  { id: 'parcours', libelle: 'Le parcours' },
  { id: 'fonctionnalites', libelle: 'Fonctionnalités' },
  { id: 'confidentialite', libelle: 'Confidentialité' },
  { id: 'offres', libelle: 'Offres' },
  { id: 'questions', libelle: 'Questions' },
] as const

/** Le libellé de l'espace des thérapeutes, le même partout. */
const ESPACE = 'Espace thérapeute'

/**
 * Une question de la FAQ, ouverte quand un lien y mène : l'ancre seule
 * arrivait sur un `<details>` fermé, et il fallait deviner qu'on était au bon
 * endroit.
 */
function ouvrirLaQuestion(id: string): boolean {
  const cible = document.getElementById(id)
  if (!(cible instanceof HTMLDetailsElement)) return false
  cible.open = true
  cible.scrollIntoView({ block: 'start' })
  cible.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
  return true
}

/** Les pictogrammes du parcours : quatre traits, dessinés ici, rien à charger. */
function Pictogramme({ nom }: { nom: Etape['icone'] }) {
  const trace: Record<Etape['icone'], ReactNode> = {
    micro: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
      </>
    ),
    note: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 12h6M9 15.5h6M9 19h3.5" />
      </>
    ),
    telephone: (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
      </>
    ),
    courbe: (
      <>
        <path d="M3.5 20.5h17M3.5 3.5v17" />
        <path d="M6.5 8l3.5 3 3-2.5 4.5 6" />
      </>
    ),
  }
  return (
    <svg className={s.picto} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {trace[nom]}
    </svg>
  )
}

/**
 * Un groupe de fonctionnalités. Sur un téléphone, il se replie : trois
 * groupes ouverts faisaient à eux seuls deux écrans. Au-delà de 720 pixels,
 * il reste ouvert — la place ne manque pas, et rien ne s'y cache.
 */
const ETROIT = '(max-width: 719px)'

function GroupeDeFonctions({ groupe }: { groupe: Groupe }) {
  const [etroit, setEtroit] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(ETROIT).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const requete = window.matchMedia(ETROIT)
    const suivre = () => setEtroit(requete.matches)
    suivre()
    requete.addEventListener?.('change', suivre)
    return () => requete.removeEventListener?.('change', suivre)
  }, [])

  const contenu = (
    <>
      <p className={s.groupeIntro}>{groupe.intro}</p>
      <ul className={s.fonctions}>
        {groupe.fonctions.map((f) => (
          <li key={f.titre} className={s.fonction}>
            <h4 className={s.fonctionTitre}>{f.titre}</h4>
            <p className={s.fonctionTexte}>{f.texte}</p>
          </li>
        ))}
      </ul>
      <p className={s.aussi}>
        <span className={s.aussiTitre}>Et aussi :</span> {groupe.aussi.map((a) => a.texte).join(' ; ')}.
      </p>
    </>
  )

  if (etroit) {
    return (
      <details className={`${s.groupe} ${s.groupeRepliable}`}>
        <summary className={s.groupeResume}>
          <h3 className={s.groupeTitre}>{groupe.titre}</h3>
        </summary>
        {contenu}
      </details>
    )
  }
  return (
    <div className={s.groupe}>
      <h3 className={s.groupeTitre}>{groupe.titre}</h3>
      {contenu}
    </div>
  )
}

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

function NoteEnAttente() {
  return <div className={s.noteAttente} aria-hidden="true" />
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
              <a href={CHEMIN_PORTE}>{ESPACE}</a>
            </li>
          </ul>
        </nav>
        <div className={s.enteteActions}>
          <a className={`${s.bouton} ${s.boutonDiscret} ${s.porteLarge}`} href={CHEMIN_PORTE}>
            {ESPACE}
          </a>
          {/* Une demande, pas un accès : l'essai s'ouvre après un échange. */}
          {/* Un seul des deux libellés est affiché (l'autre est en
              `display: none`) : le nom lu est toujours celui qu'on voit. */}
          <a className={`${s.bouton} ${s.boutonPlein} ${s.boutonEntete}`} href="#essai" onClick={onEssai}>
            <span className={s.libelleCourt}>Demander l’essai</span>
            <span className={s.libelleLong}>Demander un essai de {JOURS_ESSAI} jours</span>
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

  /* Une adresse qui vise une question (#cout-ia) l'ouvre, à l'arrivée comme
     au fil de la lecture. */
  useEffect(() => {
    const suivre = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (id && faq.some((q) => q.id === id)) ouvrirLaQuestion(id)
    }
    suivre()
    /* Arrivée depuis une autre page (« Demander un essai » sous la porte,
       /#essai) : la page s'est montrée après que le navigateur a cherché
       l'ancre, il faut donc y aller soi-même. */
    const arrivee = decodeURIComponent(window.location.hash.slice(1))
    if (arrivee && !faq.some((q) => q.id === arrivee) && /^[a-z-]+$/.test(arrivee)) {
      document.getElementById(arrivee)?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener('hashchange', suivre)
    return () => window.removeEventListener('hashchange', suivre)
    // Les questions ne changent pas d'une lecture à l'autre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Un lien vers une question de la FAQ : on y va, et elle s'ouvre. */
  function versQuestion(id: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      if (!ouvrirLaQuestion(id)) return
      e.preventDefault()
      window.history.replaceState(window.history.state, '', `#${id}`)
    }
  }

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
              Après la séance, votre note et les consignes sont rédigées : vous relisez, vous validez. Vos
              patients repartent avec leurs exercices, vos audios, leur journal et leurs rappels, sur leur
              téléphone et à la marque de votre cabinet. Et vous voyez qui avance, et qui décroche.
            </p>
            <div className={s.actions}>
              <a className={`${s.bouton} ${s.boutonPlein} ${s.boutonGrand}`} href="#essai" onClick={versEssai()}>
                Demander un essai de {JOURS_ESSAI} jours
              </a>
              <a className={`${s.bouton} ${s.boutonContour} ${s.boutonGrand}`} href="#parcours">
                Voir le parcours
              </a>
            </div>
            <ul className={s.reperes}>
              <li>Note de séance rédigée, relue par vous</li>
              <li>Aucune application à télécharger</li>
              <li>
                <a href="#confidentialite">Dossiers à Paris, analyse aux États-Unis&nbsp;: dit en clair</a>
              </li>
            </ul>
          </div>
          <figure id="apercu" className={s.heroApercu} aria-labelledby="legende-apercu">
            {/* Vingt-sept arrêts de tabulation dans le téléphone : au clavier,
                on doit pouvoir passer son chemin. */}
            <a className={s.passer} href="#parcours">
              Passer l’aperçu
            </a>
            <Differe immediat attente={<TelephoneEnAttente />}>
              <TelephoneDemo />
            </Differe>
            <figcaption id="legende-apercu" className={s.legende}>
              L’espace patient, tel que vous le prévisualisez dans Klaro — sur des données fictives.
              Chez votre patient, les numéros d’urgence sont en bas de chaque écran.
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
                <span className={s.etapeHaut}>
                  <span className={s.pictoCadre}>
                    <Pictogramme nom={etape.icone} />
                  </span>
                  <span className={s.numero}>Étape {i + 1}</span>
                </span>
                <h3 className={s.etapeTitre}>{etape.titre}</h3>
                <p className={s.etapeTexte}>{etape.texte}</p>
                <p className={s.etapeDetail}>{etape.detail}</p>
                {etape.voir ? (
                  <a className={s.etapeVoir} href={`#${etape.voir.ancre}`}>
                    {etape.voir.libelle}
                  </a>
                ) : (
                  <span className={s.etapeVoir} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* ── Après la séance : la note, le cœur du produit ────────────── */}
        <section id="note" className={`${s.section} ${s.sectionClaire}`} aria-labelledby="titre-note">
          <div className={s.deuxColonnes}>
            <div className={s.noteTexte}>
              <p className={s.surtitre}>Après la séance</p>
              <h2 id="titre-note" className={s.titreSection}>
                Votre note est rédigée. Vous la relisez.
              </h2>
              <p className={s.intro}>
                Synthèse, mots de la séance, fil rouge, points de vigilance, questions à reprendre, exercices
                et audios pour l’entre-séances&nbsp;: tout est proposé, rien n’est imposé.
              </p>
              <ul className={s.points}>
                {pointsDeLaNote().map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className={s.lienSimple}>
                <a href={`#${ANCRE_COUT_IA}`} onClick={versQuestion(ANCRE_COUT_IA)}>
                  Ce que coûte l’IA, en détail
                </a>
              </p>
            </div>
            <Differe attente={<NoteEnAttente />}>
              <NoteDemo />
            </Differe>
          </div>
        </section>

        {/* ── Le suivi, côté thérapeute ───────────────────────────────── */}
        <section id="suivi" className={s.section} aria-labelledby="titre-suivi">
          <div className={s.enTeteSection}>
            <p className={s.surtitre}>Votre côté</p>
            <h2 id="titre-suivi" className={s.titreSection}>
              Qui avance, qui décroche
            </h2>
            <p className={s.intro}>
              L’assiduité de chaque patient sur les sept derniers jours, et la courbe de son échelle du soir&nbsp;:
              les écrans du suivi, sur des patients fictifs. Choisissez-en un.
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
              <GroupeDeFonctions key={g.titre} groupe={g} />
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
              Pas de formule vague : voici où vont les données de séance, et ce qui n’y va pas.
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
          <p className={s.prestataires}>{AUTRES_PRESTATAIRES}</p>
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
              Toutes comprennent l’espace patient, le suivi, la boutique, l’équipe et les séances assistées
              par l’IA. Ce qui change&nbsp;: le nombre de patients actifs, votre domaine, votre site.
            </p>
          </div>
          <ul className={s.offres}>
            {liste.map((o) => (
              <li key={o.code} className={o.repere ? `${s.offre} ${s.offreRepere}` : s.offre}>
                {o.repere ? <p className={s.offreBadge}>{o.repere}</p> : null}
                <h3 className={s.offreNom}>{o.nom}</h3>
                <p className={s.offrePrix}>
                  <span className={s.offreMontant}>{o.prix}</span>
                  <span className={s.offrePeriode}> HT par mois</span>
                </p>
                <p className={s.offrePatients}>{o.patients}</p>
                <ul className={s.offreLignes}>
                  {o.lignes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <a
                  className={`${s.bouton} ${o.repere ? s.boutonPlein : s.boutonContour} ${s.boutonLarge}`}
                  href="#essai"
                  onClick={versEssai(o.code)}
                  aria-label={`Demander un essai de ${JOURS_ESSAI} jours, offre ${o.nom}`}
                >
                  Demander un essai
                </a>
              </li>
            ))}
          </ul>
          <div className={s.cle}>
            <p className={s.cleTitre}>À prévoir en plus&nbsp;: la clé Anthropic de votre cabinet</p>
            <p className={s.cleTexte}>
              Pour l’analyse, votre cabinet ouvre un compte chez Anthropic, où elle se paie à l’usage, et colle
              sa clé dans Réglages › Intégrations. Sans clé, l’espace patient et le suivi fonctionnent, mais
              aucune note n’est rédigée.{' '}
              <a href={`#${ANCRE_COUT_IA}`} onClick={versQuestion(ANCRE_COUT_IA)}>
                Que coûte l’IA&nbsp;?
              </a>
            </p>
          </div>
          <p className={s.mention}>{MENTION_PRIX}</p>
          {MODALITES ? <p className={s.mention}>{MODALITES}</p> : null}
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
              <details key={q.id} id={q.id} className={s.question}>
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
                Demander un essai de {JOURS_ESSAI}&nbsp;jours
              </h2>
              <p className={s.intro}>
                Dites-nous qui vous êtes&nbsp;: l’essai s’ouvre après un échange, pas d’un clic. Voici ce qui
                se passe ensuite.
              </p>
              <ol className={s.ensuite}>
                {ENSUITE.map((etape) => (
                  <li key={etape.titre}>
                    <span className={s.ensuiteTitre}>{etape.titre}</span>
                    <span className={s.ensuiteTexte}>{etape.texte}</span>
                  </li>
                ))}
              </ol>
              <p className={s.essaiPorte}>
                Vous avez déjà un espace&nbsp;? <a href={CHEMIN_PORTE}>Entrez par l’{ESPACE.toLowerCase()}</a>.
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
            <p className={s.piedEditeur}>
              Klaro vous est proposé par {EDITEUR.identite || EDITEUR.nom}
              {EDITEUR.ville ? `, ${EDITEUR.ville}` : ''}.
              {EDITEUR.contact ? (
                <>
                  {' '}
                  Nous écrire&nbsp;: <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a>.
                </>
              ) : null}
            </p>
          </div>
          <nav aria-label="Liens de bas de page">
            <ul className={s.piedLiens}>
              <li>
                <a href={CHEMIN_PORTE}>{ESPACE}</a>
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
