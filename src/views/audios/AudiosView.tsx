import type { ChangeEvent, KeyboardEvent } from 'react'
import { Button, Card, Overline } from '@/components/ui'
import { PATIENTS, PATIENT_ORDER } from '@/data/patients'
import { plural } from '@/lib/format'
import { useStore } from '@/state/store'
import type { AppState } from '@/state/state'
import type { LibraryAudio, PatientId } from '@/types/domain'
import s from './AudiosView.module.css'

/* Règles métier ------------------------------------------------------- */

/** Le patient a-t-il déjà cet audio, dans sa fiche d'origine ou après un envoi ? */
function hasAudio(state: AppState, key: PatientId, title: string): boolean {
  return (
    PATIENTS[key].audios.some((audio) => audio.title === title) ||
    (state.extraAudios[key] ?? []).some((audio) => audio.title === title)
  )
}

/** Titre lisible déduit du nom de fichier : extension retirée, séparateurs en espaces. */
function titleFromFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sans titre'
}

/** `mm:ss` sur deux chiffres, à partir de la durée lue dans le fichier. */
function fileDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`
}

/* Forme d'onde -------------------------------------------------------- */

/** Quatre barres, teintées quand la ligne est sélectionnée. */
function Waveform({ on }: { on: boolean }) {
  return (
    <span className={s.wave} aria-hidden>
      <span className={on ? `${s.bar} ${s.b1} ${s.barOn}` : `${s.bar} ${s.b1}`} />
      <span className={on ? `${s.bar} ${s.b2} ${s.barOn}` : `${s.bar} ${s.b2}`} />
      <span className={on ? `${s.bar} ${s.b3} ${s.barOn}` : `${s.bar} ${s.b3}`} />
      <span className={on ? `${s.bar} ${s.b4} ${s.barOn}` : `${s.bar} ${s.b4}`} />
    </span>
  )
}

/* Écran ---------------------------------------------------------------- */

/**
 * Bibliothèque audio du cabinet : import, rangement par catégorie, envoi dans
 * le compte des patients. La catégorie sert aussi de repère à l'IA en fin de
 * séance, d'où la création de catégorie à la volée.
 */
export function AudiosView() {
  const { state, set } = useStore()

  const filtered =
    state.libFilter === 'Toutes'
      ? state.lib
      : state.lib.filter((audio) => audio.cat === state.libFilter)
  const selected = state.lib.find((audio) => audio.id === state.libSel) ?? null
  const targets = PATIENT_ORDER.filter((key) => state.libAssign[key])

  /** Import : les fichiers rejoignent le catalogue, rangés dans la catégorie choisie. */
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const cat = state.upCat
    files.forEach((file, n) => {
      const id = `u${Date.now()}_${n}`
      const title = titleFromFile(file.name)
      const size = Math.round(file.size / 100000) / 10
      const entry: LibraryAudio = {
        id,
        title,
        cat,
        duration: '—',
        meta: `${size} Mo · importé à l'instant`,
      }
      set((prev) => ({
        lib: [entry].concat(prev.lib),
        libSel: id,
        libAssign: {},
        libFilter: 'Toutes',
        libNotice: `« ${title} » est dans le catalogue, rangé dans ${cat}.`,
      }))
      // La durée n'est pas dans le nom du fichier : on la lit dans les métadonnées.
      const url = URL.createObjectURL(file)
      const element = new Audio(url)
      element.addEventListener('loadedmetadata', () => {
        const length = element.duration
        URL.revokeObjectURL(url)
        if (!isFinite(length) || length <= 0) return
        const duration = fileDuration(length)
        set((prev) => ({
          lib: prev.lib.map((audio) => (audio.id === id ? { ...audio, duration } : audio)),
        }))
      })
    })
    event.target.value = ''
  }

  /** Envoi : un audio déjà présent dans un compte n'y est pas ajouté deux fois. */
  function dispatch() {
    if (!selected || !targets.length) return
    set((prev) => {
      const extraAudios = { ...prev.extraAudios }
      targets.forEach((key) => {
        const known =
          PATIENTS[key].audios.some((audio) => audio.title === selected.title) ||
          (extraAudios[key] ?? []).some((audio) => audio.title === selected.title)
        if (known) return
        extraAudios[key] = (extraAudios[key] ?? []).concat([
          {
            title: selected.title,
            meta: `Envoyé à l'instant · ${selected.cat}`,
            duration: selected.duration === '—' ? '10:00' : selected.duration,
          },
        ])
      })
      return {
        extraAudios,
        libAssign: {},
        libNotice: `Envoyé dans le compte de ${targets.map((key) => PATIENTS[key].name).join(', ')}.`,
      }
    })
  }

  /** Création de catégorie à la volée : elle devient aussitôt le filtre et la catégorie d'import. */
  function addCat() {
    const name = state.catName.trim()
    if (!name) {
      set({ catAdd: false, catName: '' })
      return
    }
    set((prev) => ({
      cats: prev.cats.includes(name) ? prev.cats : prev.cats.concat([name]),
      catAdd: false,
      catName: '',
      libFilter: name,
      upCat: name,
      libNotice: `Catégorie « ${name} » créée. Elle est proposée à l'import et à l'IA en fin de séance.`,
    }))
  }

  function catKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') addCat()
  }

  function renameSelected(title: string) {
    set((prev) => ({
      lib: prev.lib.map((audio) => (audio.id === prev.libSel ? { ...audio, title } : audio)),
    }))
  }

  function recategorise(cat: string) {
    set((prev) => ({
      lib: prev.lib.map((audio) => (audio.id === prev.libSel ? { ...audio, cat } : audio)),
    }))
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Bibliothèque du cabinet</Overline>
      </div>
      <h1 className={s.h1}>Vos audios</h1>
      <p className={s.intro}>
        Importez vos enregistrements une fois, rangez-les par catégorie, puis envoyez-les dans le
        compte des patients concernés. La catégorie sert aussi à l'IA : en fin de séance, elle vous
        propose les audios du bon rayon plutôt qu'un titre inventé.
      </p>

      <div className={s.grid}>
        <div className={s.col}>
          <Card padded={false} className={s.import}>
            <div className={s.importLabel}>
              <Overline>Importer</Overline>
            </div>
            <div className={s.upLabel}>Catégorie à l'import</div>
            <div className={s.chips}>
              {state.cats.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cat === state.upCat ? `${s.chip} ${s.chipOn}` : s.chip}
                  aria-pressed={cat === state.upCat}
                  onClick={() => set({ upCat: cat })}
                >
                  {cat}
                </button>
              ))}
            </div>
            <label className={s.drop}>
              <span className={s.dropTitle}>Choisir des fichiers audio</span>
              <span className={s.dropHint}>
                MP3 ou M4A. La durée est lue automatiquement, le fichier reste sur votre poste dans
                cette démo.
              </span>
              <input
                className={s.file}
                type="file"
                accept="audio/*"
                multiple
                onChange={upload}
              />
            </label>
            {state.libNotice ? <div className={s.libNotice}>{state.libNotice}</div> : null}
          </Card>

          <Card padded={false} flush className={s.catalogue}>
            <div className={s.catalogueHead}>
              <h2 className={s.catalogueTitle}>Catalogue</h2>
              <span className={s.catalogueCount}>
                {state.lib.length} audios · {state.cats.length} catégories
              </span>
            </div>

            <div className={s.filters}>
              {['Toutes'].concat(state.cats).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cat === state.libFilter ? `${s.chip} ${s.chipOn}` : s.chip}
                  aria-pressed={cat === state.libFilter}
                  onClick={() => set({ libFilter: cat })}
                >
                  {cat === 'Toutes'
                    ? 'Toutes'
                    : `${cat} (${state.lib.filter((audio) => audio.cat === cat).length})`}
                </button>
              ))}
              {state.catAdd ? (
                <span className={s.catForm}>
                  <input
                    className={s.catInput}
                    value={state.catName}
                    aria-label="Nom de la catégorie"
                    placeholder="Nom de la catégorie"
                    autoFocus
                    onChange={(e) => set({ catName: e.target.value })}
                    onKeyDown={catKey}
                  />
                  <button type="button" className={s.catSave} onClick={addCat}>
                    Créer
                  </button>
                  <button
                    type="button"
                    className={s.catCancel}
                    aria-label="Annuler la création de catégorie"
                    onClick={() => set({ catAdd: false, catName: '' })}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={s.catOpen}
                  onClick={() => set({ catAdd: true, catName: '' })}
                >
                  <span className={s.catPlus} aria-hidden>
                    +
                  </span>
                  <span>Catégorie</span>
                </button>
              )}
            </div>

            {filtered.map((audio) => {
              const on = audio.id === state.libSel
              const who = PATIENT_ORDER.filter((key) => hasAudio(state, key, audio.title)).length
              return (
                <button
                  key={audio.id}
                  type="button"
                  className={on ? `${s.row} ${s.rowOn}` : s.row}
                  aria-pressed={on}
                  onClick={() => set({ libSel: audio.id, libAssign: {}, libNotice: '' })}
                >
                  <Waveform on={on} />
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{audio.title}</span>
                    <span className={s.rowMeta}>
                      {audio.meta}
                      {who ? ` · ${plural(who, 'patient', 'patients')}` : ' · dans aucun compte'}
                    </span>
                  </span>
                  <span className={s.rowCat}>{audio.cat}</span>
                  <span className={s.rowDuration}>{audio.duration}</span>
                </button>
              )
            })}

            {filtered.length === 0 ? (
              <div className={s.catalogueEmpty}>
                Aucun audio dans cette catégorie. Importez un fichier en le rangeant ici, ou changez
                la catégorie d'un audio existant.
              </div>
            ) : null}
          </Card>
        </div>

        {selected ? (
          <Card padded={false} className={s.detail}>
            <div className={s.detailLabel}>
              <Overline>Audio sélectionné</Overline>
            </div>
            <input
              className={s.detailTitle}
              value={selected.title}
              aria-label="Titre de l'audio"
              onChange={(e) => renameSelected(e.target.value)}
            />
            <div className={s.detailMeta}>
              {selected.duration} · {selected.meta}
            </div>

            <div className={s.detailSection}>
              <Overline>Catégorie</Overline>
            </div>
            <div className={s.chips}>
              {state.cats.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cat === selected.cat ? `${s.chip} ${s.chipOn}` : s.chip}
                  aria-pressed={cat === selected.cat}
                  onClick={() => recategorise(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className={s.detailSection}>
              <Overline>Envoyer dans les comptes</Overline>
            </div>
            <div className={s.people}>
              {PATIENT_ORDER.map((key) => {
                const patient = PATIENTS[key]
                const on = !!state.libAssign[key]
                const has = hasAudio(state, key, selected.title)
                return (
                  <button
                    key={key}
                    type="button"
                    className={on ? `${s.person} ${s.personOn}` : s.person}
                    aria-pressed={on}
                    onClick={() =>
                      set((prev) => ({ libAssign: { ...prev.libAssign, [key]: !prev.libAssign[key] } }))
                    }
                  >
                    <span className={on ? `${s.box} ${s.boxOn}` : s.box} aria-hidden>
                      {on ? '✓' : ''}
                    </span>
                    <span className={s.personText}>
                      <span className={s.personName}>{patient.name}</span>
                      <span className={s.personSub}>{patient.subtitle}</span>
                    </span>
                    {has ? <span className={s.personNote}>déjà dans son compte</span> : null}
                  </button>
                )
              })}
            </div>

            <div className={s.detailFoot}>
              <Button
                variant="primary"
                className={s.dispatch}
                disabled={targets.length === 0}
                onClick={dispatch}
              >
                {targets.length ? `Envoyer à ${plural(targets.length, 'patient', 'patients')}` : 'Envoyer'}
              </Button>
              <span className={s.dispatchHint}>
                L'audio apparaît dans leur bibliothèque, écoutable hors connexion.
              </span>
            </div>
          </Card>
        ) : (
          <div className={s.empty}>
            <span className={s.emptyTitle}>Sélectionnez un audio</span>
            <span className={s.emptyText}>
              Vous pourrez changer sa catégorie et l'envoyer dans le compte des patients concernés.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
