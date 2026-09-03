import { Card, Title } from '@/components/ui'
import { plural } from '@/lib/format'
import { buildPatientContext, generateAffirmations } from '@/services/aiClient'
import { patientOf } from '@/state/selectors'
import { useMaybeCabinet } from '@/cabinet/context'
import { useStore } from '@/state/store'
import s from './Affirmations.module.css'

/**
 * Affirmations de la semaine.
 *
 * Deux modes : automatique — l'IA les écrit et les publie chaque lundi —
 * ou manuel — la thérapeute les écrit ou les fait proposer, les relit dans
 * `affPending`, puis les envoie dans `affs`, seule liste visible du patient.
 */
export function Affirmations() {
  const { state, set } = useStore()
  const key = state.sel
  const p = patientOf(state)

  // La fiche n'est montée qu'avec un patient ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!p) return null
  const first = p.name.split(' ')[0]

  const cabinet = useMaybeCabinet()
  const auto = !!state.affAuto[key]
  const published = state.affs[key] ?? []
  const pending = state.affPending[key]
  /* En mode manuel, on édite la proposition en attente tant qu'il y en a une. */
  const work = auto ? published : (pending !== undefined ? pending : published)
  const busy = state.affGen === key

  function writeAff(fn: (current: string[]) => string[]) {
    set((prev) => {
      const cur = auto
        ? (prev.affs[key] ?? [])
        : prev.affPending[key] !== undefined
          ? prev.affPending[key]
          : (prev.affs[key] ?? [])
      const next = fn(cur)
      return auto
        ? { affs: { ...prev.affs, [key]: next }, affSaved: '' }
        : { affPending: { ...prev.affPending, [key]: next }, affSaved: '' }
    })
  }

  async function propose() {
    // Une seule génération à la fois, tous patients confondus.
    if (state.affGen) return
    set({ affGen: key, affSaved: '' })
    try {
      const result = await generateAffirmations({ context: buildPatientContext(state, key) })
      const list = (result.affirmations ?? []).filter((x) => typeof x === 'string')
      // En automatique sur un cabinet réel, la série générée est publiée en base.
      if (auto && cabinet?.reel) {
        const r = await cabinet.publierAffirmations(key, list)
        set({ affGen: '', affIdx: 0, affSaved: r.ok ? 'Publiées chez le patient.' : r.message })
        return
      }
      set((prev) =>
        auto
          ? {
              affs: { ...prev.affs, [key]: list },
              affGen: '',
              affIdx: 0,
              affSaved: 'Publiées chez le patient.',
            }
          : {
              affPending: { ...prev.affPending, [key]: list },
              affGen: '',
              affSaved: 'Proposition prête, à relire avant envoi.',
            },
      )
    } catch {
      set({ affGen: '', affSaved: 'La génération a échoué. Réessayez.' })
    }
  }

  async function publish() {
    const cur = (pending !== undefined ? pending : published)
      .map((x) => x.trim())
      .filter((x) => x)
    if (!cur.length) return
    if (cabinet?.reel) {
      const r = await cabinet.publierAffirmations(key, cur)
      set((prev) => ({
        affPending: { ...prev.affPending, [key]: cur },
        affIdx: 0,
        affPaused: false,
        affSaved: r.ok ? `${plural(cur.length, 'affirmation envoyée', 'affirmations envoyées')} à ${first}.` : r.message,
      }))
      return
    }
    set((prev) => ({
      affs: { ...prev.affs, [key]: cur },
      affPending: { ...prev.affPending, [key]: cur },
      affIdx: 0,
      affPaused: false,
      affSaved: `${plural(cur.length, 'affirmation envoyée', 'affirmations envoyées')} à ${first}.`,
    }))
  }

  const status =
    state.affSaved ||
    (auto
      ? published.length
        ? `${published.length} affirmations en ligne, renouvelées lundi.`
        : "Aucune affirmation pour l'instant. La première série arrive lundi."
      : published.length
        ? `${published.length} affirmations actuellement visibles par le patient.`
        : "Rien n'est visible côté patient pour l'instant.")

  return (
    <Card padded={false} className={s.card}>
      <Title>Affirmations de la semaine</Title>
      <p className={s.sub}>
        Une phrase à la fois sur l'écran d'accueil du patient. Rien d'autre.
      </p>

      <button
        type="button"
        role="checkbox"
        aria-checked={auto}
        className={s.auto}
        onClick={() => {
          // Le réglage du lundi se conserve en base sur un cabinet réel.
          if (cabinet?.reel) void cabinet.reglerAffirmationsAuto(key, !auto)
          set((prev) => ({
            affAuto: { ...prev.affAuto, [key]: !prev.affAuto[key] },
            affSaved: '',
          }))
        }}
      >
        <span className={auto ? `${s.box} ${s.boxOn}` : s.box} aria-hidden>
          {auto ? '✓' : ''}
        </span>
        <span className={s.autoText}>
          <span className={s.autoTitle}>Génération automatique chaque lundi</span>
          <span className={s.autoHint}>
            {auto
              ? `L'IA les écrit d'après son dossier. ${first} peut aussi les renouveler depuis l'application.`
              : 'Vous les écrivez ou les faites proposer, puis vous les envoyez vous-même.'}
          </span>
          <span className={s.autoRule}>
            Présent, affirmatif, aucun mot de doute : l'inconscient n'entend pas la négation.
          </span>
        </span>
      </button>

      {work.length > 0 ? (
        <div className={s.list}>
          {work.map((text, i) => (
            <div className={s.line} key={i}>
              <span className={s.n}>{i + 1}</span>
              <input
                className={s.input}
                value={text}
                aria-label={`Affirmation ${i + 1}`}
                placeholder="Au présent, à l'affirmatif, avec conviction"
                onChange={(e) => {
                  const v = e.target.value
                  writeAff((cur) => cur.map((x, j) => (j === i ? v : x)))
                }}
              />
              <button
                type="button"
                className={s.remove}
                aria-label={`Supprimer l'affirmation ${i + 1}`}
                onClick={() => writeAff((cur) => cur.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!auto ? (
        <button type="button" className={s.add} onClick={() => writeAff((cur) => cur.concat(['']))}>
          <span className={s.plus} aria-hidden>
            +
          </span>
          <span>Ajouter une affirmation</span>
        </button>
      ) : null}

      <div className={s.actions}>
        <button type="button" className={s.propose} disabled={busy} onClick={propose}>
          {busy ? 'Écriture…' : auto ? 'Regénérer maintenant' : 'Proposer avec l\'IA'}
        </button>
        {!auto ? (
          <button type="button" className={s.publish} onClick={() => void publish()}>
            Envoyer au patient
          </button>
        ) : null}
      </div>

      <p className={s.status}>{status}</p>
    </Card>
  )
}
