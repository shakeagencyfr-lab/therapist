import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Button, Card, Overline } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { plural } from '@/lib/format'
import { useStore } from '@/state/store'
import type { AppState } from '@/state/state'
import type { LibraryAudio, PatientId } from '@/types/domain'
import s from './AudiosView.module.css'

/* Règles métier ------------------------------------------------------- */

/** Le patient a-t-il déjà cet audio, dans sa fiche d'origine ou après un envoi ? */
function hasAudio(state: AppState, key: PatientId, title: string): boolean {
  return (
    (state.patients[key]?.audios ?? []).some((audio) => audio.title === title) ||
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
  const cabinet = useMaybeCabinet()
  const reel = Boolean(cabinet?.reel)
  const [occupe, setOccupe] = useState(false)
  /** Le titre en cours de frappe : il n'est écrit en base qu'au blur. */
  const [titreSaisi, setTitreSaisi] = useState<string | null>(null)
  /** Lecture : l'URL signée de l'audio sélectionné, quand il est réel. */
  const [ecoute, setEcoute] = useState<string | null>(null)
  /** Vrai tant que l'URL se prépare. Faux et sans URL : elle a échoué. */
  const [ecoutePrete, setEcoutePrete] = useState(false)

  const filtered =
    state.libFilter === 'Toutes'
      ? state.lib
      : state.lib.filter((audio) => audio.cat === state.libFilter)
  const selected = state.lib.find((audio) => audio.id === state.libSel) ?? null
  const targets = state.patientOrder.filter((key) => state.libAssign[key])

  /* L'écoute suit la sélection : une URL signée, courte, par audio réel.
     LA DÉPENDANCE EST LA FONCTION, PAS LE DOSSIER. `useCabinet` rend un objet
     neuf à chaque rendu ; le fournisseur se rend à chaque changement de
     l'état partagé — cocher une patiente à qui envoyer l'audio, poser un
     message, filtrer un rayon. L'effet repartait donc en pleine écoute :
     `setEcoute(null)` démontait le lecteur, la lecture se coupait, et une
     nouvelle URL signée était demandée pour rien. `urlEcoute` est un
     `useCallback([])` : sa référence, elle, ne bouge pas. */
  const urlEcoute = cabinet?.urlEcoute
  useEffect(() => {
    setEcoute(null)
    setTitreSaisi(null)
    if (!reel || !urlEcoute || !state.libSel) {
      setEcoutePrete(false)
      return
    }
    let vivant = true
    setEcoutePrete(false)
    void urlEcoute(state.libSel)
      .then((url) => {
        if (!vivant) return
        setEcoute(url)
        setEcoutePrete(true)
      })
      .catch(() => {
        // Rendre la main : « Préparation de l'écoute… » ne devait pas
        // tourner indéfiniment sur un audio qu'on ne pourra pas ouvrir.
        if (vivant) setEcoutePrete(true)
      })
    return () => {
      vivant = false
    }
  }, [reel, urlEcoute, state.libSel])

  /** Import : les fichiers rejoignent le catalogue, rangés dans la catégorie choisie. */
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const cat = state.upCat
    event.target.value = ''

    // Cabinet réel : le fichier monte dans le compartiment privé, la fiche
    // entre en base, et la bibliothèque est rechargée depuis là.
    if (reel && cabinet) {
      setOccupe(true)
      let dernier = ''
      let echec = ''
      for (const file of files) {
        const r = await cabinet.importerAudio(file, cat)
        if (r.ok && r.id) dernier = r.id
        else echec = r.message
      }
      setOccupe(false)
      set({
        libSel: dernier || state.libSel,
        libAssign: {},
        libFilter: 'Toutes',
        libNotice: echec || `${plural(files.length, 'audio importé', 'audios importés')}, rangé${files.length > 1 ? 's' : ''} dans ${cat}.`,
      })
      return
    }

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
  }

  /** Envoi : un audio déjà présent dans un compte n'y est pas ajouté deux fois. */
  async function dispatch() {
    if (!selected || !targets.length) return
    if (reel && cabinet) {
      setOccupe(true)
      const r = await cabinet.envoyerAudio(selected.id, targets)
      setOccupe(false)
      set({
        libAssign: {},
        libNotice: r.ok
          ? `Envoyé dans le compte de ${targets.map((key) => state.patients[key]?.name ?? '').filter(Boolean).join(', ')}.`
          : r.message,
      })
      return
    }
    set((prev) => {
      const extraAudios = { ...prev.extraAudios }
      targets.forEach((key) => {
        const known =
          state.patients[key].audios.some((audio) => audio.title === selected.title) ||
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
        libNotice: `Envoyé dans le compte de ${targets.map((key) => state.patients[key].name).join(', ')}.`,
      }
    })
  }

  /** Création de catégorie à la volée : elle devient aussitôt le filtre et la catégorie d'import. */
  async function addCat() {
    const name = state.catName.trim()
    if (!name) {
      set({ catAdd: false, catName: '' })
      return
    }
    if (reel && cabinet) {
      const r = await cabinet.creerCategorie(name)
      set({
        catAdd: false,
        catName: '',
        libFilter: r.ok ? name : state.libFilter,
        upCat: r.ok ? name : state.upCat,
        libNotice: r.ok
          ? `Catégorie « ${name} » créée. Elle est proposée à l'import et à l'IA en fin de séance.`
          : r.message,
      })
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
    if (event.key === 'Enter') void addCat()
  }

  function renameSelected(title: string) {
    // Réel : on tape librement, l'écriture attend le blur.
    if (reel) {
      setTitreSaisi(title)
      return
    }
    set((prev) => ({
      lib: prev.lib.map((audio) => (audio.id === prev.libSel ? { ...audio, title } : audio)),
    }))
  }

  async function commitTitle() {
    if (!reel || !cabinet || !selected || titreSaisi === null) return
    if (titreSaisi.trim() && titreSaisi.trim() !== selected.title) {
      const r = await cabinet.renommerAudio(selected.id, titreSaisi)
      if (!r.ok) set({ libNotice: r.message })
    }
    setTitreSaisi(null)
  }

  async function recategorise(cat: string) {
    if (reel && cabinet && selected) {
      const r = await cabinet.recategoriserAudio(selected.id, cat)
      if (!r.ok) set({ libNotice: r.message })
      return
    }
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
                {reel
                  ? 'MP3, M4A, AAC, WAV ou OGG, 50 Mo au plus. Le fichier est déposé dans votre espace privé ; la durée est lue automatiquement.'
                  : 'MP3 ou M4A. La durée est lue automatiquement, le fichier reste sur votre poste dans cette démo.'}
              </span>
              <input
                className={s.file}
                type="file"
                accept="audio/*"
                multiple
                disabled={occupe}
                onChange={(e) => void upload(e)}
              />
              {occupe ? <span className={s.dropHint}>Dépôt en cours…</span> : null}
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
                  <button type="button" className={s.catSave} onClick={() => void addCat()}>
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
              const who = state.patientOrder.filter((key) => hasAudio(state, key, audio.title)).length
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
              value={titreSaisi ?? selected.title}
              aria-label="Titre de l'audio"
              onChange={(e) => renameSelected(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <div className={s.detailMeta}>
              {selected.duration} · {selected.meta}
            </div>
            {reel ? (
              ecoute ? (
                // L'écoute de contrôle : l'URL est signée et expire ; elle ne
                // se partage pas.
                <audio className={s.player} controls preload="none" src={ecoute} />
              ) : ecoutePrete ? (
                <div className={s.detailMeta}>
                  L'écoute n'a pas pu être préparée. Le fichier est bien enregistré ; réessayez en
                  resélectionnant l'audio.
                </div>
              ) : (
                <div className={s.detailMeta}>Préparation de l'écoute…</div>
              )
            ) : null}

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
                  onClick={() => void recategorise(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className={s.detailSection}>
              <Overline>Envoyer dans les comptes</Overline>
            </div>
            <div className={s.people}>
              {state.patientOrder.map((key) => {
                const patient = state.patients[key]
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
                disabled={targets.length === 0 || occupe}
                onClick={() => void dispatch()}
              >
                {occupe
                  ? 'Envoi…'
                  : targets.length
                    ? `Envoyer à ${plural(targets.length, 'patient', 'patients')}`
                    : 'Envoyer'}
              </Button>
              <span className={s.dispatchHint}>
                L'audio apparaît dans leur bibliothèque, écoutable depuis leur espace.
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
