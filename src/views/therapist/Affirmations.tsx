import { useState } from 'react'
import { Button, Card, Notice, Title, type NoticeTone } from '@/components/ui'
import { plural } from '@/lib/format'
import { buildPatientContext, generateAffirmations, messageDEchec } from '@/services/aiClient'
import { patientOf } from '@/state/selectors'
import { useMaybeCabinet } from '@/cabinet/context'
import { useStore } from '@/state/store'
import s from './Affirmations.module.css'

/**
 * Ce que le patient lit en ce moment, en une phrase.
 *
 * Le compte passait tel quel dans un gabarit au pluriel : « 1 affirmations
 * actuellement visibles », « les 1 phrases précédentes ».
 */
export function etatDesAffirmations(prenom: string, publiees: number, enAttente: boolean): string {
  if (enAttente) {
    const lues = publiees === 0 ? 'aucune phrase' : publiees === 1 ? 'la phrase précédente' : `les ${publiees} phrases précédentes`
    return `Corrections non envoyées. ${prenom} lit encore ${lues}.`
  }
  return publiees
    ? `${plural(publiees, 'affirmation actuellement visible', 'affirmations actuellement visibles')} par ${prenom}.`
    : `Rien n'est visible chez ${prenom} pour l'instant.`
}

/**
 * Ce que « Envoyer au patient » fait de la liste éditée.
 *
 * Les lignes vides ne partent pas (la base les écarte aussi). Une liste
 * vidée part — c'est retirer ce que le patient lit — mais seulement une fois
 * confirmé ; vide des deux côtés, il n'y a rien à faire.
 */
export function envoiDesAffirmations(
  liste: readonly string[],
  publiees: number,
  confirme: boolean,
): { geste: 'envoyer'; textes: string[] } | { geste: 'confirmer' } | { geste: 'rien' } {
  const textes = liste.map((x) => x.trim()).filter((x) => x)
  if (textes.length) return { geste: 'envoyer', textes }
  if (!publiees) return { geste: 'rien' }
  return confirme ? { geste: 'envoyer', textes: [] } : { geste: 'confirmer' }
}

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
 *
 * TOUT RETIRER EST UN ENVOI COMME UN AUTRE. Une liste vidée ne partait pas —
 * `publish` s'arrêtait en silence — et le patient gardait des phrases que sa
 * thérapeute avait retirées. Elle part désormais, après une confirmation :
 * c'est l'écran d'accueil du patient qui se vide.
 *
 * ET UN ÉCHEC SE DIT, EN ALERTE. La cause donnée par le serveur (clé absente,
 * refusée) était remplacée par « Réessayez », dans la même ligne grise que
 * les confirmations.
 */
export function Affirmations() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  /* Le retour du dernier geste, et sa couleur. Local à la carte, qui porte
     la clé de la fiche : il ne suit pas sur la fiche suivante. */
  const [retour, setRetour] = useState<{ ton: NoticeTone; texte: string } | null>(null)
  /** Tout retirer attend sa confirmation. */
  const [aVider, setAVider] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const key = state.sel
  const p = patientOf(state)

  // La fiche n'est montée qu'avec un patient ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!p) return null
  const first = p.name.split(' ')[0]

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
      return { affPending: { ...prev.affPending, [key]: fn(cur) } }
    })
    setRetour(null)
    setAVider(false)
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
    set((prev) => ({ affAuto: { ...prev.affAuto, [key]: vise } }))
    setRetour(null)
    if (!cabinet?.reel) return
    const r = await cabinet.reglerAffirmationsAuto(key, vise)
    if (!r.ok) {
      set((prev) => ({ affAuto: { ...prev.affAuto, [key]: !vise } }))
      setRetour({
        ton: 'warn',
        texte: `${r.message || "Le réglage n'a pas pu être enregistré."} La case est revenue à son état précédent.`,
      })
    }
  }

  async function propose() {
    // Une seule génération à la fois, tous patients confondus.
    if (state.affGen) return
    set({ affGen: key })
    setRetour(null)
    setAVider(false)
    try {
      const result = await generateAffirmations({ context: buildPatientContext(state, key) })
      const list = (result.affirmations ?? []).filter((x) => typeof x === 'string' && x.trim())
      /* Une série vide publiée en automatique effacerait celle en place :
         on ne remplace pas ce que le patient lit par rien. */
      if (!list.length) {
        set({ affGen: '' })
        setRetour({ ton: 'warn', texte: "L'analyse n'a rendu aucune affirmation : rien n'a changé. Relancez-la." })
        return
      }
      // En automatique sur un cabinet réel, la série générée est publiée en base.
      if (auto && cabinet?.reel) {
        const r = await cabinet.publierAffirmations(key, list)
        /* La série publiée devient la liste éditée : sans cela, l'écran
           montrerait la nouvelle série et garderait l'ancienne en attente. */
        set((prev) => ({
          affPending: r.ok ? { ...prev.affPending, [key]: list } : prev.affPending,
          affGen: '',
          affIdx: 0,
        }))
        setRetour(r.ok ? { ton: 'ok', texte: `Publiées chez ${first}.` } : { ton: 'warn', texte: r.message })
        return
      }
      set((prev) =>
        auto
          ? {
              affs: { ...prev.affs, [key]: list },
              affPending: { ...prev.affPending, [key]: list },
              affGen: '',
              affIdx: 0,
            }
          : {
              affPending: { ...prev.affPending, [key]: list },
              affGen: '',
            },
      )
      setRetour({
        ton: 'ok',
        texte: auto ? `Publiées chez ${first}.` : 'Proposition prête, à relire avant envoi.',
      })
    } catch (error) {
      set({ affGen: '' })
      /* Le message du serveur, tel quel : « Ce cabinet n'a pas encore sa clé
         Anthropic… » dit quoi faire ; « Réessayez » renvoyait en boucle. */
      setRetour({
        ton: 'warn',
        texte: messageDEchec(error, "Les affirmations n'ont pas pu être écrites. Celles en place n'ont pas bougé."),
      })
    }
  }

  async function publish(confirme = false) {
    if (envoi) return
    const decision = envoiDesAffirmations(work, published.length, confirme)
    if (decision.geste === 'rien') {
      setRetour({ ton: 'warn', texte: `La liste est vide, et rien n'est visible chez ${first} : il n'y a rien à envoyer.` })
      return
    }
    if (decision.geste === 'confirmer') {
      setRetour(null)
      setAVider(true)
      return
    }
    const cur = decision.textes
    const fait = cur.length
      ? `${plural(cur.length, 'affirmation envoyée', 'affirmations envoyées')} à ${first}.`
      : `Toutes les affirmations sont retirées : ${first} n'en voit plus aucune.`
    setAVider(false)
    if (cabinet?.reel) {
      setEnvoi(true)
      const r = await cabinet.publierAffirmations(key, cur)
      setEnvoi(false)
      set((prev) => ({
        affPending: { ...prev.affPending, [key]: cur },
        affIdx: 0,
        affPaused: false,
      }))
      setRetour(r.ok ? { ton: 'ok', texte: fait } : { ton: 'warn', texte: r.message })
      return
    }
    set((prev) => ({
      affs: { ...prev.affs, [key]: cur },
      affPending: { ...prev.affPending, [key]: cur },
      affIdx: 0,
      affPaused: false,
    }))
    setRetour({ ton: 'ok', texte: fait })
  }

  const status = etatDesAffirmations(first, published.length, enAttente)

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
        <button type="button" className={s.publish} disabled={envoi} onClick={() => void publish()}>
          {envoi ? 'Envoi…' : 'Envoyer au patient'}
        </button>
      </div>

      {/* Tout retirer vide l'écran d'accueil du patient : cela se confirme. */}
      {aVider ? (
        <div className={s.vider}>
          <p className={s.viderTexte}>
            Retirer toutes les affirmations ? {first} n'en verra plus aucune sur son écran
            d'accueil
            {auto ? ', jusqu’à la prochaine série automatique du lundi.' : '.'}
          </p>
          <div className={s.viderGestes}>
            <Button variant="danger" disabled={envoi} onClick={() => void publish(true)}>
              Tout retirer
            </Button>
            <Button variant="ghost" disabled={envoi} onClick={() => setAVider(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {retour?.ton === 'warn' ? <Notice tone="warn">{retour.texte}</Notice> : null}
      <p className={s.status} role="status">
        {retour?.ton === 'ok' ? retour.texte : status}
      </p>
    </Card>
  )
}
