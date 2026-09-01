import { useEffect, useRef } from 'react'
import { RoundCheck } from '@/components/ui'
import { durationToSeconds, timecode } from '@/lib/format'
import { buildPatientContext, generateAffirmations } from '@/services/aiClient'
import { allModules, isModuleDone, patientOf, toggleModulePatch } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientHome.module.css'

const SCALE_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Accueil de l'application patient : une à trois tâches, un audio, une échelle. */
export function PatientHome() {
  const { state, set, read } = useStore()
  const key = state.sel
  const p = patientOf(state)
  // Un cabinet qui vient d'ouvrir n'a aucune patiente : l'aperçu n'a alors
  // personne à montrer. PatientView affiche l'explication à sa place.
  const first = p ? p.name.split(' ')[0] : ''

  /* Lecteur ------------------------------------------------------------ */
  const audios = (p?.audios ?? []).concat(state.extraAudios[key] ?? [])
  const currentIndex = Math.min(state.pAudio, audios.length - 1)
  const current = audios[currentIndex]
  const duration = current ? durationToSeconds(current.duration) || 600 : 600
  const durationRef = useRef(duration)
  durationRef.current = duration

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!read().playing) return
      set((prev) => ({ playPos: prev.playPos >= durationRef.current ? 0 : prev.playPos + 1 }))
    }, 1000)
    return () => window.clearInterval(id)
  }, [read, set])

  /* Affirmations ------------------------------------------------------- */
  const published = state.affs[key] ?? []
  const affIndex = published.length ? state.affIdx % published.length : 0
  const affBusy = state.affGen === key
  /* La rotation s'arrête définitivement au premier tap (affPaused). */
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = read()
      if (now.affPaused) return
      if ((now.affs[now.sel] ?? []).length < 2) return
      set((prev) => ({ affIdx: prev.affIdx + 1 }))
    }, 5000)
    return () => window.clearInterval(id)
  }, [read, set])

  async function renewAffirmations() {
    // Une seule génération à la fois, tous patients confondus.
    if (state.affGen) return
    set({ affGen: key, affSaved: '' })
    try {
      const result = await generateAffirmations({ context: buildPatientContext(state, key) })
      const list = (result.affirmations ?? []).filter((x) => typeof x === 'string')
      set((prev) => ({
        affs: { ...prev.affs, [key]: list },
        affGen: '',
        affIdx: 0,
        affSaved: 'Publiées chez le patient.',
      }))
    } catch {
      set({ affGen: '', affSaved: 'La génération a échoué. Réessayez.' })
    }
  }

  /* Tâches du jour ----------------------------------------------------- */
  const modules = allModules(state, key)
  const tasks = modules
    .map((m, i) => ({ module: m, index: i }))
    .filter((x) => x.module.kind !== 'Audio' && x.module.kind !== 'Échelle')
  const doneCount = tasks.filter((x) => isModuleDone(state, key, x.index, x.module.done)).length
  /* L'encart pointillé ne remplace la liste que s'il n'y a aucune tâche du jour. */
  const noTasks = tasks.length === 0

  /* Échelle du soir ---------------------------------------------------- */
  const logged = (state.scaleLog[key] ?? []).length
  const feedback =
    logged === 0
      ? "Quinze secondes, une fois par jour. C'est tout ce qui est demandé."
      : state.scale <= 2
        ? `Noté à ${state.scale}. Laetitia le verra avant votre séance.`
        : state.scale <= 5
          ? `Noté à ${state.scale}. En baisse par rapport à la semaine dernière.`
          : `Noté à ${state.scale}. Pensez à l'audio de la semaine ce soir.`

  /* Journal ------------------------------------------------------------ */
  const pages = state.pages[key] ?? []
  const shared = pages.filter((g) => g.shared).length
  const journalSubtitle = pages.length
    ? `${pages.length} ${pages.length > 1 ? 'pages' : 'page'} · ${shared} partagée${shared > 1 ? 's' : ''} avec Laetitia`
    : 'Aucune page encore. Vous pouvez commencer quand vous voulez.'

  /* Notification récente ------------------------------------------------ */
  const push = state.pushes[0]
  const hasPush = !!push && !!p && push.names.includes(p.name)

  function shareNote() {
    const text = state.note.trim()
    if (!text) return
    set((prev) => ({
      note: '',
      noteSent: true,
      noteLog: {
        ...prev.noteLog,
        [key]: [
          { date: "À l'instant", trigger: 'Partagé par le patient', text },
        ].concat(prev.noteLog[key] ?? []),
      },
    }))
  }


  // Sans patiente, l'aperçu n'a personne à montrer : PatientView affiche
  // l'explication à sa place.
  if (!p) return null

  return (
    <div className={s.screen}>
      {hasPush && push && (
        <div className={s.push}>
          <div className={s.pushHead}>
            <span className={s.pushFrom}>Cabinet Laetitia Ollivier</span>
            <span className={s.pushAgo}>{push.when}</span>
          </div>
          <div className={s.pushTitle}>{push.title}</div>
          <div className={s.pushMsg}>{push.message}</div>
        </div>
      )}

      <div className={s.head}>
        <div className={s.overline}>{`Mardi 8 septembre · ${p.weekLabel}`}</div>
        <h2 className={s.hello}>{`Bonjour ${first}`}</h2>
      </div>

      {published.length > 0 && (
        <div className={s.affBlock}>
          <button
            type="button"
            className={s.affButton}
            onClick={() => set((prev) => ({ affIdx: prev.affIdx + 1, affPaused: true }))}
            aria-label="Affirmation suivante"
          >
            <span className={s.affText}>{published[affIndex]}</span>
            <span className={s.affDots} aria-hidden>
              {published.map((text, i) => (
                <span
                  key={`${text}-${i}`}
                  className={i === affIndex ? `${s.affDot} ${s.affDotOn}` : s.affDot}
                />
              ))}
            </span>
          </button>
        </div>
      )}

      {!!state.affAuto[key] && (
        <div className={s.affLinkRow}>
          <button
            type="button"
            className={affBusy ? `${s.affLink} ${s.affLinkBusy}` : s.affLink}
            onClick={renewAffirmations}
          >
            {affBusy
              ? 'Écriture en cours…'
              : published.length
                ? 'Renouveler mes affirmations de la semaine'
                : 'Générer mes affirmations de la semaine'}
          </button>
        </div>
      )}

      <div className={s.playerRow}>
        <div className={s.player}>
          <div className={s.playerOverline}>Votre séance d'écoute</div>
          <div className={s.playerTitle}>{current ? current.title : '—'}</div>
          <div className={s.playerMeta}>
            {`Enregistré par Laetitia · ${current ? current.duration : '00:00'}`}
          </div>
          <div className={s.playerTrack}>
            <div
              className={s.playerFill}
              style={{ width: `${Math.round((state.playPos / duration) * 100)}%` }}
            />
          </div>
          <div className={s.playerControls}>
            <span className={s.playerTime}>{timecode(Math.min(state.playPos, duration))}</span>
            <button
              type="button"
              className={state.playing ? `${s.playerBtn} ${s.playerBtnOn}` : s.playerBtn}
              onClick={() => set((prev) => ({ playing: !prev.playing }))}
              aria-label={state.playing ? 'Mettre en pause' : 'Lancer la lecture'}
            >
              {state.playing ? '❙❙' : '▶'}
            </button>
            <span className={s.playerTime}>{current ? current.duration : '00:00'}</span>
          </div>
        </div>
      </div>

      <div className={s.section}>
        <div className={s.overline}>Sa bibliothèque</div>
        <div className={s.audioList}>
          {audios.map((a, i) => {
            const on = i === currentIndex
            return (
              <button
                type="button"
                key={`${a.title}-${i}`}
                className={on ? `${s.audioRow} ${s.audioRowOn}` : s.audioRow}
                onClick={() => set({ pAudio: i, playPos: 0, playing: true })}
                aria-pressed={on}
              >
                <span className={on ? `${s.audioTitle} ${s.audioTitleOn}` : s.audioTitle}>
                  {a.title}
                </span>
                <span className={s.audioDuration}>{a.duration}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.overline}>Aujourd'hui</span>
          <span className={s.taskCount}>{`${doneCount} / ${tasks.length} aujourd'hui`}</span>
        </div>
        <div className={s.taskList}>
          {tasks.map((t) => {
            const on = isModuleDone(state, key, t.index, t.module.done)
            return (
              <div
                key={`${t.module.title}-${t.index}`}
                className={on ? `${s.taskRow} ${s.taskRowOn}` : s.taskRow}
              >
                <RoundCheck
                  on={on}
                  label={
                    on
                      ? `Marquer « ${t.module.title} » comme non fait`
                      : `Marquer « ${t.module.title} » comme fait`
                  }
                  onClick={() => set(toggleModulePatch(key, t.index, t.module.done))}
                />
                <button
                  type="button"
                  className={s.taskOpen}
                  onClick={() => set({ openTask: t.index, pView: 'home' })}
                >
                  <span className={s.taskBody}>
                    <span className={on ? `${s.taskTitle} ${s.taskTitleDone}` : s.taskTitle}>
                      {t.module.title}
                    </span>
                    <span className={s.taskMeta}>{t.module.meta}</span>
                  </span>
                  <span className={s.chevron} aria-hidden>
                    ›
                  </span>
                </button>
              </div>
            )
          })}
          {noTasks && (
            <div className={s.taskEmpty}>
              Rien à faire aujourd'hui. Écoute libre : prenez l'audio qui vous appelle.
            </div>
          )}
        </div>
      </div>

      <div className={s.section}>
        <div className={s.panel}>
          <div className={s.panelTitle}>Un mot pour Laetitia</div>
          <div className={s.panelSub}>
            Ce que vous écrivez ici arrive dans son dossier avant la séance.
          </div>
          <textarea
            className={s.noteArea}
            rows={3}
            value={state.note}
            placeholder="Ce qui s'est passé, ce qui a déclenché…"
            onChange={(e) => set({ note: e.target.value, noteSent: false })}
            aria-label="Un mot pour Laetitia"
          />
          <button
            type="button"
            className={state.note.trim() ? `${s.noteBtn} ${s.noteBtnOn}` : s.noteBtn}
            onClick={shareNote}
          >
            {state.noteSent && !state.note ? '✓ Transmis à Laetitia' : 'Partager avec Laetitia'}
          </button>
        </div>
      </div>

      <div className={s.scaleSection}>
        <div className={s.panel}>
          <div className={s.panelTitle}>{p.scaleQuestion || `Où en est ${p.scaleLabel} ?`}</div>
          <div className={s.panelSub}>0 = au plus bas · 10 = au plus fort</div>
          <div className={s.scaleRow}>
            {SCALE_STEPS.map((n) => (
              <button
                type="button"
                key={n}
                className={n === state.scale ? `${s.scaleDot} ${s.scaleDotOn}` : s.scaleDot}
                aria-pressed={n === state.scale}
                onClick={() =>
                  set((prev) => ({
                    scale: n,
                    scaleLog: { ...prev.scaleLog, [key]: (prev.scaleLog[key] ?? []).concat([n]) },
                  }))
                }
              >
                {n}
              </button>
            ))}
          </div>
          <div className={s.scaleFeedback}>{feedback}</div>
        </div>
      </div>

      <div className={s.journalSection}>
        <button
          type="button"
          className={s.journalBtn}
          onClick={() => set({ pView: 'journal', openPage: null })}
        >
          <svg
            viewBox="0 0 24 24"
            className={s.journalIcon}
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5.6 C 10.2 4.2, 7.4 3.5, 4.4 3.6 L 4.4 18 C 7.4 17.9, 10.2 18.6, 12 20 Z" />
            <g className={s.journalCover}>
              <path d="M12 5.6 C 13.8 4.2, 16.6 3.5, 19.6 3.6 L 19.6 18 C 16.6 17.9, 13.8 18.6, 12 20 Z" />
              <g className={s.journalLines} strokeWidth="1.1">
                <path d="M14.6 8.4 H 17.6" />
                <path d="M14.6 11.4 H 17.6" />
                <path d="M14.6 14.4 H 16.3" />
              </g>
            </g>
            <path d="M12 5.6 V 20" />
          </svg>
          <span className={s.journalBody}>
            <span className={s.journalTitle}>Mon journal</span>
            <span className={s.journalSub}>{journalSubtitle}</span>
          </span>
          <span className={s.chevron} aria-hidden>
            ›
          </span>
        </button>
      </div>
    </div>
  )
}
