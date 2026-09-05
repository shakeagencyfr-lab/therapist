import { useRef, useState } from 'react'
import { Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useDictee } from './useDictee'
import { BoutonDictee } from './BoutonDictee'
import { deplacer, rangVise, type Boite } from './reordonner'
import type { JournalPageRow } from './usePatientData'
import s from './Journal.module.css'

/** « mardi 2 septembre » */
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** « Septembre 2026 » : le titre sous lequel les pages du mois se rangent. */
export function mois(iso: string): string {
  const d = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return d.charAt(0).toUpperCase() + d.slice(1)
}

/** Les premières lignes d'une page : de quoi la reconnaître sans l'ouvrir. */
export function apercu(corps: string, max = 90): string {
  const plat = corps.replace(/\s+/g, ' ').trim()
  return plat.length > max ? `${plat.slice(0, max).trimEnd()}…` : plat
}

/** Ce que la liste montre : tout, ou seulement l'une des deux sortes. */
type Filtre = 'tout' | 'partagees' | 'privees'

/**
 * Le journal du patient.
 *
 * Il manquait entièrement : la table existait, la politique RLS l'autorisait
 * à écrire, l'aperçu de la thérapeute en montrait un — et l'application
 * réelle n'en avait aucun. Sa carte « Journal partagé », côté cabinet, ne
 * pouvait donc rester que vide.
 *
 * CE QU'ELLE ÉCRIT LUI APPARTIENT. Une page est privée par défaut : c'est la
 * condition pour qu'elle écrive vraiment. Elle choisit page par page ce
 * qu'elle montre à sa thérapeute, et peut revenir sur ce choix — une page
 * partagée un soir de doute se reprend le lendemain.
 *
 * La politique de lecture du cabinet exige `shared = true` : tant qu'une
 * page reste privée, la thérapeute n'en voit pas l'existence. Ce n'est pas
 * une convention d'écran, c'est la base qui le tient.
 */
export function Journal({
  pages,
  illisible,
  patientId,
  cabinetId,
  accent,
  onEcrit,
}: {
  pages: JournalPageRow[]
  /** La lecture a échoué : ses pages existent, on n'a pas pu les servir. */
  illisible?: boolean
  patientId: string
  cabinetId: string
  accent?: string
  onEcrit: () => Promise<void>
}) {
  const [ouvert, setOuvert] = useState(false)
  const [titre, setTitre] = useState('')
  const [texte, setTexte] = useState('')
  const [partage, setPartage] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [depliee, setDepliee] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tout')
  /* Dicter plutôt qu'écrire : au téléphone, un soir, taper dix lignes au
     pouce décourage plus sûrement qu'une page blanche. */
  const dictee = useDictee(texte, setTexte)
  const [aSupprimer, setASupprimer] = useState('')
  /** La page saisie au doigt, et le rang où elle se trouve à l'instant. */
  const [saisie, setSaisie] = useState<{ id: string; rang: number } | null>(null)
  /** L'ordre affiché pendant le déplacement : la base ne le sait pas encore. */
  const [ordre, setOrdre] = useState<JournalPageRow[] | null>(null)
  const liste = useRef<HTMLDivElement | null>(null)

  async function supprimer(id: string) {
    const db = supabase()
    if (!db) return
    const { error } = await db.from('journal_pages').delete().eq('id', id)
    setASupprimer('')
    if (error) {
      setNotice({ tone: 'warn', text: "La page n'a pas pu être supprimée. Réessayez." })
      return
    }
    setNotice({ tone: 'ok', text: 'Page supprimée.' })
    await onEcrit()
  }

  /**
   * Écrire l'ordre choisi.
   *
   * TOUTES les pages reçoivent leur rang, pas seulement celles qui ont bougé :
   * une position posée sur deux pages et nulle sur les autres donnerait un
   * ordre à moitié chronologique, à moitié choisi — c'est-à-dire aucun ordre
   * lisible. Le premier déplacement fige donc la liste entière.
   */
  async function enregistrerOrdre(pages: JournalPageRow[]) {
    const db = supabase()
    if (!db) return
    const retours = await Promise.all(
      pages.map((page, rang) =>
        db.from('journal_pages').update({ position: rang }).eq('id', page.id),
      ),
    )
    if (retours.some((r) => r.error)) {
      setNotice({ tone: 'warn', text: "L'ordre n'a pas pu être enregistré. Réessayez." })
    }
    await onEcrit()
    setOrdre(null)
  }


  async function enregistrer() {
    const db = supabase()
    if (!db || !texte.trim()) return
    setEnvoi(true)
    setNotice(null)
    /* UNE PAGE NEUVE SE LIT EN HAUT.
       Tant que rien n'a été déplacé, toutes les positions sont nulles et la
       liste se lit du plus récent au plus ancien : la page du jour arrive
       naturellement en tête. Mais au premier réordonnancement, `enregistrerOrdre`
       numérote TOUTES les pages — et la suivante, insérée sans position, se
       rangeait derrière elles, tout en bas, sous les pages d'il y a six mois.
       Elle prend donc un rang devant la première. */
    const rangs = pages.map((p) => p.position).filter((r): r is number => r !== null)
    const { error } = await db.from('journal_pages').insert({
      patient_id: patientId,
      cabinet_id: cabinetId,
      title: titre.trim() || jour(new Date().toISOString()),
      body: texte.trim(),
      shared: partage,
      position: rangs.length ? Math.min(...rangs) - 1 : null,
    })
    setEnvoi(false)
    if (error) {
      setNotice({ tone: 'warn', text: "La page n'a pas pu être enregistrée. Réessayez." })
      return
    }
    dictee.arreter()
    setTitre('')
    setTexte('')
    setPartage(false)
    setOuvert(false)
    setNotice({ tone: 'ok', text: partage ? 'Page enregistrée et partagée.' : 'Page enregistrée, pour vous seule.' })
    await onEcrit()
  }

  /** Le partage se reprend : une page montrée un soir de doute se retire. */
  async function basculerPartage(page: JournalPageRow) {
    const db = supabase()
    if (!db) return
    const { error } = await db
      .from('journal_pages')
      .update({ shared: !page.shared })
      .eq('id', page.id)
    if (error) {
      setNotice({ tone: 'warn', text: "Le partage n'a pas pu être changé. Réessayez." })
      return
    }
    await onEcrit()
  }

  const retenues = (ordre ?? pages).filter((p) =>
    filtre === 'tout' ? true : filtre === 'partagees' ? p.shared : !p.shared,
  )

  /* Le glisser-déposer ne vaut que sur la liste entière : réordonner une
     liste filtrée écrirait des rangs qui n'ont pas de sens pour les pages
     qu'on ne voit pas. */
  const deplacable = filtre === 'tout' && retenues.length > 1

  /**
   * Le doigt sur la poignée.
   *
   * `setPointerCapture` garde les événements sur cette poignée même quand le
   * doigt sort de la page — sans lui, un déplacement rapide lâche la page au
   * milieu de l'écran. Les mesures sont prises une fois, au début : les lire
   * à chaque mouvement mesurerait la liste en train de bouger.
   */
  function prendre(event: React.PointerEvent, rang: number, page: JournalPageRow) {
    if (!deplacable) return
    event.preventDefault()
    const poignee = event.currentTarget as HTMLElement
    poignee.setPointerCapture(event.pointerId)

    const cadre = liste.current
    const boites: Boite[] = cadre
      ? Array.from(cadre.querySelectorAll('[data-page]')).map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return { haut: r.top, hauteur: r.height }
        })
      : []

    let courant = retenues
    let dernier = rang
    setSaisie({ id: page.id, rang })

    const bouge = (e: PointerEvent) => {
      const vise = rangVise(rang, e.clientY, boites)
      if (vise === dernier) return
      dernier = vise
      courant = deplacer(retenues, rang, vise)
      setOrdre(courant)
      setSaisie({ id: page.id, rang: vise })
    }

    const lache = () => {
      poignee.removeEventListener('pointermove', bouge)
      poignee.removeEventListener('pointerup', lache)
      poignee.removeEventListener('pointercancel', lache)
      setSaisie(null)
      if (dernier === rang) {
        setOrdre(null)
        return
      }
      void enregistrerOrdre(courant)
    }

    poignee.addEventListener('pointermove', bouge)
    poignee.addEventListener('pointerup', lache)
    poignee.addEventListener('pointercancel', lache)
  }

  /**
   * Déplacer une page AU CLAVIER.
   *
   * La poignée n'écoutait que `pointerdown` : au clavier, au lecteur d'écran,
   * ou simplement sur un iPad avec un clavier externe, elle recevait le focus
   * — c'est un bouton — et ne faisait rien. Rien du tout, sans un mot. Les
   * flèches haut et bas la déplacent d'un rang ; le focus la suit, React
   * gardant le nœud par la clé de la page.
   */
  function deplacerAuClavier(event: React.KeyboardEvent, rang: number) {
    if (!deplacable) return
    const sens = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!sens) return
    const vise = rang + sens
    if (vise < 0 || vise >= retenues.length) return
    event.preventDefault()
    const suite = deplacer(retenues, rang, vise)
    setOrdre(suite)
    void enregistrerOrdre(suite)
  }

  return (
    <section className={s.section}>
      <div className={s.head}>
        <span className={s.titre}>Mon journal</span>
        <span className={s.compte}>
          {pages.length === 0
            ? ''
            : `${pages.length} page${pages.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Écrire est LE geste de cet écran : un bouton pleine largeur, au
          pouce, pas un lien de douze pixels dans un coin. */}
      {!ouvert ? (
        <button
          type="button"
          className={s.ecrire}
          style={accent ? { background: accent } : undefined}
          onClick={() => setOuvert(true)}
        >
          Écrire une page
        </button>
      ) : null}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {ouvert ? (
        <div className={s.editeur}>
          <input
            className={s.champTitre}
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Un titre, si vous voulez"
            aria-label="Titre de la page"
          />
          <textarea
            className={s.champTexte}
            rows={7}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Ce qui s'est passé, ce que vous avez remarqué, ce qui a été difficile…"
            aria-label="Votre page"
          />

          <BoutonDictee dictee={dictee} accent={accent} />

          <label className={s.partage}>
            <input type="checkbox" checked={partage} onChange={(e) => setPartage(e.target.checked)} />
            <span>
              <span className={s.partageTitre}>Montrer cette page à ma thérapeute</span>
              <span className={s.partageHint}>
                Sans cette case, personne ne la lit. Vous pourrez changer d'avis plus tard.
              </span>
            </span>
          </label>

          <div className={s.actions}>
            <button
              type="button"
              className={s.valider}
              style={accent ? { background: accent } : undefined}
              disabled={envoi || !texte.trim()}
              onClick={() => void enregistrer()}
            >
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className={s.annuler}
              onClick={() => {
                dictee.arreter()
                setOuvert(false)
                setTexte('')
                setTitre('')
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {illisible ? (
        <p className={s.vide}>
          Vos pages n'ont pas pu être relues à l'instant. Elles sont bien là — réessayez dans un
          moment, ou rouvrez l'application.
        </p>
      ) : pages.length === 0 && !ouvert ? (
        <p className={s.vide}>
          Rien d'écrit pour l'instant. Quelques lignes suffisent — ce que vous avez remarqué, ce
          qui a été difficile. Vous seule les lisez, sauf si vous décidez de les montrer.
        </p>
      ) : null}

      {/* Le tri n'apparaît qu'à partir du moment où il sert : sur trois pages,
          trois boutons de filtre prennent plus de place qu'ils n'en font
          gagner. */}
      {pages.length > 4 ? (
        <div className={s.filtres} role="tablist" aria-label="Trier mes pages">
          {(
            [
              ['tout', 'Toutes'],
              ['partagees', 'Partagées'],
              ['privees', 'Privées'],
            ] as Array<[Filtre, string]>
          ).map(([valeur, label]) => (
            <button
              key={valeur}
              type="button"
              role="tab"
              aria-selected={filtre === valeur}
              className={filtre === valeur ? `${s.filtre} ${s.filtreOn}` : s.filtre}
              style={filtre === valeur && accent ? { color: accent, borderColor: accent } : undefined}
              onClick={() => setFiltre(valeur)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Rangées par mois : au bout de six mois, une liste à plat ne se
          parcourt plus — on cherche « en janvier », pas « la page numéro 34 ».
          Le titre de mois n'apparaît que lorsqu'il change. */}
      {retenues.length === 0 && pages.length > 0 ? (
        <p className={s.vide}>
          {filtre === 'partagees'
            ? "Aucune page partagée pour l'instant."
            : 'Aucune page privée : toutes vos pages sont partagées.'}
        </p>
      ) : null}

      <div ref={liste}>
        {retenues.map((page, i) => {
          const ouverte = depliee === page.id
          const titreMois = mois(page.written_at)
          /* Les intercalaires de mois n'ont de sens que dans l'ordre du temps.
             Dès qu'une page a été rangée à la main, ils disparaissent : un
             « Septembre » posé au milieu d'un ordre choisi ment sur ce qui
             suit. */
          const parDate = page.position === null
          const nouveauMois =
            parDate && (i === 0 || mois(retenues[i - 1].written_at) !== titreMois)
          const prise = saisie?.id === page.id
          return (
            <div key={page.id} data-page>
              {nouveauMois ? <div className={s.mois}>{titreMois}</div> : null}
              <article
                className={[s.page, ouverte && s.pageOuverte, prise && s.pagePrise]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={s.pageLigne}>
                  {/* La poignée, et elle seule : un article entier saisissable
                      empêcherait de faire défiler la liste au pouce. */}
                  {deplacable ? (
                    <button
                      type="button"
                      className={s.poignee}
                      onPointerDown={(e) => prendre(e, i, page)}
                      onKeyDown={(e) => deplacerAuClavier(e, i)}
                      aria-label={`Déplacer « ${page.title} » — page ${i + 1} sur ${retenues.length}. Flèches haut et bas pour la déplacer.`}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden focusable="false">
                        <path d="M2.5 5h11M2.5 8h11M2.5 11h11" />
                      </svg>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={s.pageHead}
                    onClick={() => setDepliee(ouverte ? '' : page.id)}
                    aria-expanded={ouverte}
                  >
                    <span className={s.pageHaut}>
                      <span className={s.pageTitre}>{page.title}</span>
                      {page.shared ? (
                        <span
                          className={s.pastille}
                          style={accent ? { background: accent } : undefined}
                        >
                          partagée
                        </span>
                      ) : null}
                    </span>
                    {/* L'aperçu remplace le titre seul : deux pages appelées
                        « mardi 2 septembre » ne se distinguent pas l'une de
                        l'autre tant qu'on ne les a pas ouvertes toutes les
                        deux. */}
                    {!ouverte ? <span className={s.pageApercu}>{apercu(page.body)}</span> : null}
                    <span className={s.pageMeta}>{jour(page.written_at)}</span>
                  </button>
                </div>

                {ouverte ? (
                  <>
                    <p className={s.pageTexte}>{page.body}</p>
                    <div className={s.pageActions}>
                      <button
                        type="button"
                        className={s.bascule}
                        style={accent && !page.shared ? { color: accent } : undefined}
                        onClick={() => void basculerPartage(page)}
                      >
                        {page.shared ? 'Ne plus la montrer' : 'La montrer à ma thérapeute'}
                      </button>

                      {/* Une page effacée l'est pour de bon, y compris chez la
                          thérapeute si elle était partagée : on demande une
                          fois, on ne rattrape pas. */}
                      {aSupprimer === page.id ? (
                        <span className={s.confirme}>
                          <button
                            type="button"
                            className={s.oui}
                            onClick={() => void supprimer(page.id)}
                          >
                            Supprimer définitivement
                          </button>
                          <button
                            type="button"
                            className={s.non}
                            onClick={() => setASupprimer('')}
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={s.effacer}
                          onClick={() => setASupprimer(page.id)}
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </article>
            </div>
          )
        })}
      </div>
    </section>
  )
}
