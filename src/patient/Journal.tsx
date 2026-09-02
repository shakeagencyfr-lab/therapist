import { useState } from 'react'
import { Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { JournalPageRow } from './usePatientData'
import s from './Journal.module.css'

/** « mardi 2 septembre » */
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Le journal de la patiente.
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
  patientId,
  cabinetId,
  accent,
  onEcrit,
}: {
  pages: JournalPageRow[]
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

  return (
    <section className={s.section}>
      <div className={s.head}>
        <span className={s.titre}>Mon journal</span>
        {!ouvert ? (
          <button
            type="button"
            className={s.ecrire}
            style={accent ? { color: accent } : undefined}
            onClick={() => setOuvert(true)}
          >
            Écrire
          </button>
        ) : null}
      </div>

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

      {pages.length === 0 && !ouvert ? (
        <p className={s.vide}>
          Rien d'écrit pour l'instant. Quelques lignes suffisent — ce que vous avez remarqué, ce
          qui a été difficile. Vous seule les lisez, sauf si vous décidez de les montrer.
        </p>
      ) : null}

      {pages.map((page) => {
        const ouverte = depliee === page.id
        return (
          <article key={page.id} className={s.page}>
            <button
              type="button"
              className={s.pageHead}
              onClick={() => setDepliee(ouverte ? '' : page.id)}
              aria-expanded={ouverte}
            >
              <span className={s.pageTitre}>{page.title}</span>
              <span className={s.pageMeta}>
                {jour(page.written_at)}
                {page.shared ? ' · partagée' : ' · privée'}
              </span>
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
        )
      })}
    </section>
  )
}
