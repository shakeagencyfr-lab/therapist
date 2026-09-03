import { useState } from 'react'
import { Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useDictee } from './useDictee'
import { BoutonDictee } from './BoutonDictee'
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

  async function enregistrer() {
    const db = supabase()
    if (!db || !texte.trim()) return
    setEnvoi(true)
    setNotice(null)
    const { error } = await db.from('journal_pages').insert({
      patient_id: patientId,
      cabinet_id: cabinetId,
      title: titre.trim() || jour(new Date().toISOString()),
      body: texte.trim(),
      shared: partage,
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

  const retenues = pages.filter((p) =>
    filtre === 'tout' ? true : filtre === 'partagees' ? p.shared : !p.shared,
  )

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

      {retenues.map((page, i) => {
        const ouverte = depliee === page.id
        const titreMois = mois(page.written_at)
        const nouveauMois = i === 0 || mois(retenues[i - 1].written_at) !== titreMois
        return (
          <div key={page.id}>
            {nouveauMois ? <div className={s.mois}>{titreMois}</div> : null}
            <article className={ouverte ? `${s.page} ${s.pageOuverte}` : s.page}>
              <button
                type="button"
                className={s.pageHead}
                onClick={() => setDepliee(ouverte ? '' : page.id)}
                aria-expanded={ouverte}
              >
                <span className={s.pageHaut}>
                  <span className={s.pageTitre}>{page.title}</span>
                  {page.shared ? (
                    <span className={s.pastille} style={accent ? { background: accent } : undefined}>
                      partagée
                    </span>
                  ) : null}
                </span>
                {/* L'aperçu remplace le titre seul : deux pages appelées
                    « mardi 2 septembre » ne se distinguent pas l'une de
                    l'autre tant qu'on ne les a pas ouvertes toutes les deux. */}
                {!ouverte ? <span className={s.pageApercu}>{apercu(page.body)}</span> : null}
                <span className={s.pageMeta}>{jour(page.written_at)}</span>
              </button>
              {ouverte ? (
                <>
                  <p className={s.pageTexte}>{page.body}</p>
                  <button
                    type="button"
                    className={s.bascule}
                    style={accent && !page.shared ? { color: accent } : undefined}
                    onClick={() => void basculerPartage(page)}
                  >
                    {page.shared ? 'Ne plus la montrer' : 'La montrer à ma thérapeute'}
                  </button>
                </>
              ) : null}
            </article>
          </div>
        )
      })}
    </section>
  )
}
