import { useCallback, useEffect, useRef, useState } from 'react'
import s from './AvisGoogle.module.css'

export interface AvisGoogleItem {
  auteur: string
  note: number
  texte: string
  date: string
}

/**
 * La marque Google, en SVG dans la page.
 *
 * Elle est INLINE, pas chargée depuis un serveur de Google : une page publique
 * qui irait chercher une image chez un tiers lui signalerait chaque visite,
 * et cette page-ci est celle d'un cabinet de thérapie. La visite d'un patient
 * ne regarde personne.
 *
 * C'est aussi ce que demande Google : les avis tirés de sa fiche doivent
 * porter son attribution. Le logo est ici à ce titre, et à aucun autre — il
 * ne signe pas la page, il désigne la provenance des avis.
 */
function LogoGoogle({ taille = 18 }: { taille?: number }) {
  return (
    <svg
      className={s.logoG}
      width={taille}
      height={taille}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * Cinq étoiles, remplies à la fraction exacte.
 *
 * Arrondir 4,3 à quatre étoiles enlève une demi-étoile à quelqu'un ; les
 * arrondir à cinq en ajoute une qu'on n'a pas. La barre remplie est donc
 * coupée au pourcentage réel, et le texte à côté donne le chiffre — c'est lui
 * qui fait foi, les étoiles ne sont qu'une lecture rapide.
 */
function Etoiles({ note, taille = 15 }: { note: number; taille?: number }) {
  const part = Math.max(0, Math.min(1, note / 5)) * 100
  const etoile = (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 17.27 6.18 21l1.64-6.81L2.5 9.64l6.96-.6L12 2.5l2.54 6.54 6.96.6-5.32 4.55L17.82 21z" />
    </svg>
  )
  return (
    <span className={s.etoiles} role="img" aria-label={`${note.toFixed(1).replace('.', ',')} sur 5`}>
      <span className={s.etoilesVides} aria-hidden>
        {etoile}
        {etoile}
        {etoile}
        {etoile}
        {etoile}
      </span>
      <span className={s.etoilesPleines} style={{ width: `${part}%` }} aria-hidden>
        {etoile}
        {etoile}
        {etoile}
        {etoile}
        {etoile}
      </span>
    </span>
  )
}

/**
 * Les avis Google, en carrousel.
 *
 * POURQUOI UN CARROUSEL ET PAS UNE GRILLE. Une grille de douze avis fait une
 * page de témoignages ; personne ne les lit, et ils repoussent tout le reste
 * vers le bas. Le carrousel en montre deux ou trois, en promet d'autres, et
 * laisse la page continuer.
 *
 * IL FONCTIONNE SANS JAVASCRIPT. Le défilement est natif — `overflow-x` et
 * `scroll-snap` — et les flèches ne font que l'assister. Rendu côté serveur,
 * ou script en échec, la piste reste lisible et parcourable au doigt : c'est
 * la manière dont on lit un carrousel sur un téléphone de toute façon.
 *
 * IL S'ARRÊTE DÈS QU'ON LE REGARDE. L'avance automatique cesse au survol, au
 * focus clavier, quand l'onglet passe en arrière-plan, et définitivement dès
 * que quelqu'un fait défiler lui-même. Un carrousel qui reprend la main
 * pendant qu'on lit une phrase est plus agaçant qu'utile.
 */
export function AvisGoogle({
  avis,
  note,
  nombre,
}: {
  avis: AvisGoogleItem[]
  note: number | null
  nombre: number | null
}) {
  const piste = useRef<HTMLUListElement | null>(null)
  const [actif, setActif] = useState(0)
  /* Une fois qu'on a pris la main, on la garde : plus d'avance automatique. */
  const [manuel, setManuel] = useState(false)
  const [survol, setSurvol] = useState(false)

  /** L'avis le plus proche du bord gauche de la piste. */
  const suivreDefilement = useCallback(() => {
    const el = piste.current
    if (!el) return
    const enfants = Array.from(el.children) as HTMLElement[]
    let proche = 0
    let ecart = Infinity
    enfants.forEach((enfant, i) => {
      const d = Math.abs(enfant.offsetLeft - el.scrollLeft)
      if (d < ecart) {
        ecart = d
        proche = i
      }
    })
    setActif(proche)
  }, [])

  const aller = useCallback((index: number) => {
    const el = piste.current
    if (!el) return
    const cible = el.children[index] as HTMLElement | undefined
    if (!cible) return
    el.scrollTo({ left: cible.offsetLeft, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (manuel || survol || avis.length < 2) return
    /* Personne n'a demandé que ça bouge : on n'impose pas un mouvement à qui
       a réglé sa machine pour ne pas en avoir. */
    const calme = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (calme?.matches) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      const el = piste.current
      if (!el) return
      const enfants = Array.from(el.children) as HTMLElement[]
      const dernier = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
      const suivant = dernier ? 0 : Math.min(actif + 1, enfants.length - 1)
      aller(suivant)
    }, 6000)
    return () => window.clearInterval(id)
  }, [actif, aller, avis.length, manuel, survol])

  if (!avis.length) return null

  const moyenne = note ?? avis.reduce((t, a) => t + a.note, 0) / avis.length
  const compte = nombre ?? avis.length

  return (
    <div className={s.bloc}>
      {/* Le badge : c'est lui qui fait foi. Le chiffre, le nombre d'avis et la
          marque Google ensemble — une note sans sa source ne vaut rien, et une
          source sans son nombre d'avis non plus. */}
      <div className={s.badge}>
        <LogoGoogle taille={22} />
        <span className={s.badgeNote}>{moyenne.toFixed(1).replace('.', ',')}</span>
        <Etoiles note={moyenne} />
        {/* Une seule chaîne, pas « {compte} avis sur Google » : React coupe
            le texte autour d'une valeur par un marqueur de commentaire, et la
            phrase n'existe alors nulle part d'un seul tenant — ni pour une
            épreuve, ni pour un lecteur d'écran qui la relit. */}
        <span className={s.badgeCompte}>{`${compte} avis sur Google`}</span>
      </div>

      <div
        className={s.carrousel}
        role="group"
        aria-roledescription="carrousel"
        aria-label="Avis publiés sur Google"
        onMouseEnter={() => setSurvol(true)}
        onMouseLeave={() => setSurvol(false)}
        onFocusCapture={() => setSurvol(true)}
        onBlurCapture={() => setSurvol(false)}
      >
        <ul className={s.piste} ref={piste} onScroll={suivreDefilement} tabIndex={0}>
          {avis.map((a, i) => (
            <li
              key={`${a.auteur}-${i}`}
              className={s.carte}
              aria-roledescription="avis"
              aria-label={`Avis ${i + 1} sur ${avis.length}`}
            >
              <div className={s.carteHaut}>
                <Etoiles note={a.note || moyenne} taille={14} />
                <LogoGoogle taille={15} />
              </div>
              <blockquote className={s.carteTexte}>{a.texte}</blockquote>
              <p className={s.carteAuteur}>
                <span className={s.carteNom}>{a.auteur || 'Anonyme'}</span>
                {a.date ? <span className={s.carteDate}>{a.date}</span> : null}
              </p>
            </li>
          ))}
        </ul>

        {avis.length > 1 ? (
          <div className={s.commandes}>
            <button
              type="button"
              className={s.fleche}
              aria-label="Avis précédent"
              onClick={() => {
                setManuel(true)
                aller(Math.max(0, actif - 1))
              }}
            >
              <span aria-hidden>‹</span>
            </button>
            <span className={s.points}>
              {avis.map((a, i) => (
                <button
                  key={`point-${a.auteur}-${i}`}
                  type="button"
                  className={i === actif ? `${s.point} ${s.pointActif}` : s.point}
                  aria-label={`Aller à l'avis ${i + 1}`}
                  aria-current={i === actif}
                  onClick={() => {
                    setManuel(true)
                    aller(i)
                  }}
                />
              ))}
            </span>
            <button
              type="button"
              className={s.fleche}
              aria-label="Avis suivant"
              onClick={() => {
                setManuel(true)
                aller(Math.min(avis.length - 1, actif + 1))
              }}
            >
              <span aria-hidden>›</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
