import { useEffect, useState } from 'react'
import { Card, EmptyState, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import type { PatientAudio } from '@/types/domain'
import s from './PatientAudios.module.css'

/** Le repère d'une ligne : l'envoi en base, ou son rang en démonstration. */
function repereDe(key: string, a: PatientAudio, i: number): string {
  return a.id ?? `${key}:${i}`
}

/**
 * Audios personnalisés du patient : ceux du dossier, suivis de ceux
 * envoyés depuis la bibliothèque du cabinet. Une ligne ouverte à la fois.
 *
 * LE BOUTON ▶ NE JOUAIT RIEN. Il basculait `audioOn`, que rien ne lisait :
 * l'icône passait à ❙❙ sur un silence. Il ouvre désormais un vrai lecteur,
 * sur la même URL signée et courte que la bibliothèque (`urlEcoute`) — la
 * thérapeute entend ce que son patient entend.
 *
 * La ligne est repérée par l'identifiant de l'envoi, plus par son rang : un
 * audio retiré décalait les rangs, et le lecteur ouvert passait au voisin.
 */
export function PatientAudios() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const key = state.sel
  const fiche = patientOf(state)
  const audios = fiche ? fiche.audios.concat(state.extraAudios[key] ?? []) : []
  const courant = audios.find((a, i) => repereDe(key, a, i) === state.audioOn)
  const audioId = courant?.audioId ?? ''

  /** L'URL signée de l'audio ouvert. Nulle et prête : elle a échoué. */
  const [url, setUrl] = useState<string | null>(null)
  const [prete, setPrete] = useState(false)
  /** L'envoi dont le retrait attend confirmation. */
  const [aRetirer, setARetirer] = useState('')
  const [retrait, setRetrait] = useState(false)
  const [echec, setEchec] = useState('')

  /* Même précaution que la bibliothèque : la dépendance est la fonction, une
     référence stable, et pas le dossier — sinon chaque rendu relancerait la
     demande d'URL et couperait la lecture en cours. */
  const urlEcoute = cabinet?.urlEcoute
  useEffect(() => {
    setUrl(null)
    setPrete(false)
    if (!audioId || !urlEcoute) return
    let vivant = true
    void urlEcoute(audioId)
      .then((u) => {
        if (!vivant) return
        setUrl(u)
        setPrete(true)
      })
      .catch(() => {
        if (vivant) setPrete(true)
      })
    return () => {
      vivant = false
    }
  }, [audioId, urlEcoute])

  // Changer de fiche referme ce qui était ouvert sur la précédente — lecteur
  // compris : revenir sur une fiche ne doit pas relancer un audio tout seul.
  useEffect(() => {
    setARetirer('')
    setEchec('')
    set({ audioOn: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // La carte n'est montée qu'avec un patient ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!fiche) return null

  async function retirer(envoiId: string) {
    if (!cabinet || retrait) return
    setRetrait(true)
    setEchec('')
    const r = await cabinet.retirerAudioPatient(envoiId)
    setRetrait(false)
    setARetirer('')
    if (!r.ok) {
      setEchec(r.message)
      return
    }
    if (state.audioOn === envoiId) set({ audioOn: null })
  }

  return (
    <Card padded={false} flush>
      <div className={s.head}>
        <Title>Audios personnalisés</Title>
        <p className={s.sub}>Enregistrés après séance, écoutables depuis son espace</p>
      </div>

      {audios.length === 0 ? (
        <div className={s.emptyWrap}>
          <EmptyState>
            Aucun audio pour l'instant. Les enregistrements réalisés après séance
            arrivent ici, écoutables depuis son espace.
          </EmptyState>
        </div>
      ) : (
        audios.map((a, i) => {
          const id = repereDe(key, a, i)
          const on = state.audioOn === id
          return (
            <div key={id} className={s.ligne}>
              <div className={s.row}>
                <button
                  type="button"
                  className={s.lecture}
                  aria-pressed={on}
                  aria-label={on ? `Fermer le lecteur de « ${a.title} »` : `Écouter « ${a.title} »`}
                  onClick={() => set((prev) => ({ audioOn: prev.audioOn === id ? null : id }))}
                >
                  <span className={on ? `${s.play} ${s.playOn}` : s.play} aria-hidden>
                    {on ? '❙❙' : '▶'}
                  </span>
                  <span className={s.body}>
                    <span className={s.title}>{a.title}</span>
                    <span className={s.meta}>{a.meta}</span>
                  </span>
                  <span className={s.duration}>{a.duration}</span>
                </button>
                {/* Retirer l'envoi, pas l'audio : il reste dans la
                    bibliothèque et chez les autres patients. */}
                {cabinet?.reel && a.id && aRetirer !== a.id ? (
                  <button
                    type="button"
                    className={s.retirer}
                    onClick={() => setARetirer(a.id ?? '')}
                    aria-label={`Retirer « ${a.title} » de son compte`}
                  >
                    Retirer
                  </button>
                ) : null}
              </div>

              {aRetirer && aRetirer === a.id ? (
                <div className={s.confirmer}>
                  <span>
                    Retirer « {a.title} » de son compte ? Il disparaît de son espace et reste dans
                    votre bibliothèque ; ses écoutes ne sont plus comptées.
                  </span>
                  <span className={s.confirmerGestes}>
                    <button
                      type="button"
                      className={s.retirerOui}
                      disabled={retrait}
                      onClick={() => void retirer(a.id ?? '')}
                    >
                      {retrait ? 'Retrait…' : 'Retirer cet audio'}
                    </button>
                    <button type="button" className={s.retirer} onClick={() => setARetirer('')}>
                      Annuler
                    </button>
                  </span>
                </div>
              ) : null}

              {on ? (
                <div className={s.lecteur}>
                  {!a.audioId ? (
                    <span className={s.meta}>
                      Audio de démonstration : aucun fichier n'y est attaché.
                    </span>
                  ) : url ? (
                    // L'URL est signée et expire : elle ne se partage pas.
                    <audio className={s.player} controls autoPlay preload="none" src={url} />
                  ) : prete ? (
                    <span className={s.meta}>
                      L'écoute n'a pas pu être préparée. Refermez puis rouvrez l'audio pour réessayer.
                    </span>
                  ) : (
                    <span className={s.meta}>Préparation de l'écoute…</span>
                  )}
                </div>
              ) : null}
            </div>
          )
        })
      )}

      {echec ? (
        <div className={s.emptyWrap}>
          <Notice tone="warn">{echec}</Notice>
        </div>
      ) : null}
    </Card>
  )
}
