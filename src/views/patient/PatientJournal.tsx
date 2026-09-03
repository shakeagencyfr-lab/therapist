import { useStore } from '@/state/store'
import type { JournalPage } from '@/types/domain'
import s from './PatientJournal.module.css'

/** Extrait affiché dans la liste : 96 caractères, sinon la page est dite vide. */
function excerptOf(page: JournalPage): string {
  const text = page.text ?? ''
  return text.slice(0, 96) + (text.length > 96 ? '…' : '') || 'Page vide'
}

/** Journal du patient : la liste des pages, puis la page ouverte. */
export function PatientJournal() {
  const { state, set } = useStore()
  const key = state.sel
  const pages = state.pages[key] ?? []
  const current = pages.find((g) => g.id === state.openPage) ?? null

  /** Écrit un correctif sur la page ouverte. */
  function patchPage(patch: Partial<JournalPage>) {
    set((prev) => ({
      pages: {
        ...prev.pages,
        [key]: (prev.pages[key] ?? []).map((g) =>
          g.id === prev.openPage ? { ...g, ...patch } : g,
        ),
      },
    }))
  }

  function newPage() {
    const id = `p${Date.now()}`
    set((prev) => ({
      pages: {
        ...prev.pages,
        [key]: [
          { id, title: '', date: 'Mardi 8 septembre', shared: false, text: '' },
        ].concat(prev.pages[key] ?? []),
      },
      openPage: id,
    }))
  }

  if (current) {
    return (
      <div className={s.screen}>
        <div className={s.pageTop}>
          <button
            type="button"
            className={s.back}
            onClick={() => set({ pView: 'journal', openPage: null })}
          >
            ‹ Mon journal
          </button>
          <span className={s.saved}>
            {current.text.trim() ? 'Enregistré' : 'Nouvelle page'}
          </span>
        </div>

        <div className={s.pageHead}>
          <input
            className={s.pageTitle}
            value={current.title}
            placeholder="Titre de la page"
            onChange={(e) => patchPage({ title: e.target.value })}
            aria-label="Titre de la page"
          />
          <div className={s.pageDate}>{current.date}</div>
        </div>

        <div className={s.pageBody}>
          <textarea
            className={s.pageText}
            value={current.text}
            placeholder="Écrivez ce que vous voulez garder. Personne n'y a accès tant que vous ne le partagez pas."
            onChange={(e) => patchPage({ text: e.target.value })}
            aria-label="Contenu de la page"
          />
        </div>

        <div className={s.pageFoot}>
          <button
            type="button"
            className={current.shared ? `${s.shareBtn} ${s.shareBtnOn}` : s.shareBtn}
            aria-pressed={current.shared}
            onClick={() => patchPage({ shared: !current.shared })}
          >
            {current.shared ? 'Partagée avec sa thérapeute' : 'Partager cette page avec sa thérapeute'}
          </button>
          <div className={s.pageFootRow}>
            <span className={s.shareHint}>
              {current.shared
                ? 'Elle la verra dans votre dossier avant la séance.'
                : "Tant que ce n'est pas partagé, personne d'autre que vous n'y a accès."}
            </span>
            <button
              type="button"
              className={s.delete}
              onClick={() =>
                set((prev) => ({
                  pages: {
                    ...prev.pages,
                    [key]: (prev.pages[key] ?? []).filter((g) => g.id !== prev.openPage),
                  },
                  pView: 'journal',
                  openPage: null,
                }))
              }
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.screen}>
      <div className={s.backRow}>
        <button type="button" className={s.back} onClick={() => set({ pView: 'home' })}>
          ‹ Aujourd'hui
        </button>
      </div>

      <div className={s.head}>
        <h2 className={s.title}>Mon journal</h2>
        <div className={s.sub}>
          Vos pages restent ici, consultables à tout moment. Vous choisissez page par page ce que
          Sa thérapeute peut lire.
        </div>
      </div>

      <div className={s.newRow}>
        <button type="button" className={s.newBtn} onClick={newPage}>
          Nouvelle page
        </button>
      </div>

      <div className={s.list}>
        {pages.map((page) => (
          <button
            type="button"
            key={page.id}
            className={s.pageRow}
            onClick={() => set({ pView: 'journal', openPage: page.id })}
          >
            <span className={s.rowHead}>
              <span className={s.rowTitle}>{page.title || 'Page sans titre'}</span>
              <span className={s.rowDate}>{page.date}</span>
            </span>
            <span className={s.rowExcerpt}>{excerptOf(page)}</span>
            <span className={page.shared ? `${s.badge} ${s.badgeShared}` : s.badge}>
              {page.shared ? 'Partagée' : 'Privée'}
            </span>
          </button>
        ))}
        {pages.length === 0 && (
          <div className={s.empty}>
            Aucune page pour l'instant. La première peut ne faire que deux lignes.
          </div>
        )}
      </div>
    </div>
  )
}
