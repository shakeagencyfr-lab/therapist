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
 * Deux modes, qui décident SEULEMENT de qui écrit le premier jet : l'IA
 * d'après le dossier, ou la thérapeute. Dans les deux cas la correction passe
 * par `affPending`, et un seul geste — « Envoyer au patient » — l'écrit dans
 * `affs`, la seule liste que le patient voit.
 *
 * C'EST LE POINT DE CE FICHIER. En automatique, la liste était éditable et ne
 * s'envoyait nulle part : le champ et la croix n'écrivaient que dans l'état
 * React, les deux boutons qui atteignent la base étaient masqués, et le
 * statut confirmait la suppression — « 4 affirmations en ligne » — à partir
 * de la liste raccourcie à l'écran. Le patient continuait de lire la phrase
 * effacée, et la correction disparaissait au premier `recharger()`, c'est-à-
 * dire au retour sur l'onglet. Éditer devait donc écrire, ou ne pas être
 * offert ; c'est écrire.
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
  /* On édite la proposition en attente tant qu'il y en a une — dans les deux
     modes. `affs` ne se touche plus qu'à l'envoi. */
  const work = pending !== undefined ? pending : published
  const busy = state.affGen === key
  /** Des corrections attendent d'être envoyées. */
  const enAttente =
    pending !== undefined &&
    (pending.length !== published.length || pending.some((x, i) => x !== published[i]))

  function writeAff(fn: (current: string[]) => string[]) {
    set((prev) => {
      const cur =
        prev.affPending[key] !== undefined ? prev.affPending[key] : (prev.affs[key] ?? [])
      return { affPending: { ...prev.affPending, [key]: fn(cur) }, affSaved: '' }
    })
  }

  /**
   * Cocher « chaque lundi », et que ce soit vrai.
   *
   * La case basculait à l'écran, l'écriture partait avec `void`, et son échec
   * n'allait nulle part : le texte d'aide passait à « L'IA les écrit d'après
   * son dossier et les publie chaque lundi matin » sur un réglage que la base
   * n'avait pas enregistré. Aucune affirmation n'arrivait le lundi, et rien
   * ne disait pourquoi.
   */
  async function basculerAuto() {
    const vise = !auto
    set((prev) => ({ affAuto: { ...prev.affAuto, [key]: vise }, affSaved: '' }))
    if (!cabinet?.reel) return
    const r = await cabinet.reglerAffirmationsAuto(key, vise)
    if (!r.ok) {
      set((prev) => ({
        affAuto: { ...prev.affAuto, [key]: !vise },
        affSaved: r.message || "Le réglage n'a pas pu être enregistré. Réessayez.",
      }))
    }
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
        /* La série publiée devient la liste éditée : sans cela, l'écran
           montrerait la nouvelle série et garderait l'ancienne en attente. */
        set((prev) => ({
          affPending: r.ok ? { ...prev.affPending, [key]: list } : prev.affPending,
          affGen: '',
          affIdx: 0,
          affSaved: r.ok ? 'Publiées chez le patient.' : r.message,
        }))
        return
      }
      set((prev) =>
        auto
          ? {
              affs: { ...prev.affs, [key]: list },
              affPending: { ...prev.affPending, [key]: list },
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
    (enAttente
      ? `Corrections non envoyées. ${first} lit encore ${published.length ? `les ${published.length} phrases précédentes` : 'aucune phrase'}.`
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
        onClick={() => void basculerAuto()}
      >
        <span className={auto ? `${s.box} ${s.boxOn}` : s.box} aria-hidden>
          {auto ? '✓' : ''}
        </span>
        <span className={s.autoText}>
          <span className={s.autoTitle}>Génération automatique chaque lundi</span>
          <span className={s.autoHint}>
            {/* « … peut aussi les renouveler depuis l'application » : ce bouton
                n'existait que dans l'aperçu de démonstration. Le patient LIT
                ses affirmations, il ne les commande pas. */}
            {auto
              ? "L'IA les écrit d'après son dossier et les publie chaque lundi matin. Vous pouvez les corriger à tout moment."
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

      <button type="button" className={s.add} onClick={() => writeAff((cur) => cur.concat(['']))}>
        <span className={s.plus} aria-hidden>
          +
        </span>
        <span>Ajouter une affirmation</span>
      </button>

      <div className={s.actions}>
        <button type="button" className={s.propose} disabled={busy} onClick={propose}>
          {busy ? 'Écriture…' : auto ? 'Regénérer maintenant' : 'Proposer avec l\'IA'}
        </button>
        <button type="button" className={s.publish} onClick={() => void publish()}>
          Envoyer au patient
        </button>
      </div>

      <p className={s.status}>{status}</p>
    </Card>
  )
}
