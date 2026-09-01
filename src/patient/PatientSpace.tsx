import { useEffect, useState } from 'react'
import { Notice, RoundCheck } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { timecode } from '@/lib/format'
import { useAuth } from '@/auth/session'
import { usePatientData } from './usePatientData'
import s from './PatientSpace.module.css'

/** Le prénom seul : c'est ainsi que la thérapeute s'adresse à lui. */
function prenom(nom: string): string {
  return nom.split(' ')[0] ?? nom
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function aujourdhui(): string {
  const d = new Date()
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

export function PatientSpace() {
  const { context, seDeconnecter } = useAuth()
  const patient = context?.patient ?? null
  const { modules, affirmations, audios, scaleToday, scaleQuestion, chargement, erreur, recharger } =
    usePatientData(patient?.id ?? null)

  const [affIdx, setAffIdx] = useState(0)
  const [affFige, setAffFige] = useState(false)
  const [echelle, setEchelle] = useState<number | null>(null)
  const [envoi, setEnvoi] = useState('')

  // L'affirmation tourne toutes les cinq secondes, et s'arrête
  // définitivement au premier tap : on ne reprend pas la main sur quelqu'un
  // qui vient de choisir de lire.
  useEffect(() => {
    if (affFige || affirmations.length < 2) return
    const t = setInterval(() => setAffIdx((i) => (i + 1) % affirmations.length), 5000)
    return () => clearInterval(t)
  }, [affFige, affirmations.length])

  if (!patient) return null

  // Le patient ne voit jamais plus de trois actions : les audios et l'échelle
  // ont leur propre place, le reste tient dans « aujourd'hui ».
  const taches = modules.filter((m) => m.kind !== 'Audio' && m.kind !== 'Échelle')
  const faites = taches.filter((m) => m.done_at).length
  const journeeFaite = taches.length > 0 && faites === taches.length

  async function basculer(id: string, done: boolean) {
    const db = supabase()
    if (!db) return
    const { error } = await db.rpc('patient_set_module_done', { p_module: id, p_done: done })
    if (!error) await recharger()
  }

  async function noterEchelle(valeur: number) {
    const db = supabase()
    if (!db) return
    setEchelle(valeur)
    const { error } = await db.from('scale_entries').insert({
      patient_id: patient!.id,
      cabinet_id: patient!.cabinet_id,
      value: valeur,
    })
    setEnvoi(error ? "L'enregistrement a échoué. Réessayez." : "C'est noté, merci.")
    if (!error) await recharger()
  }

  const valeurEchelle = echelle ?? scaleToday

  return (
    <div className={s.page}>
      <header className={s.head} style={{ background: patient.branding?.dark }}>
        <div className={s.date}>{aujourdhui()}</div>
        <h1 className={s.hello}>Bonjour {prenom(patient.display_name)}</h1>
        {affirmations.length > 0 ? (
          <>
            <p
              className={s.affirmation}
              onClick={() => setAffFige(true)}
              role="button"
              tabIndex={0}
              onKeyDown={() => setAffFige(true)}
            >
              {affirmations[affIdx]}
            </p>
            <div className={s.dots} aria-hidden>
              {affirmations.map((a, i) => (
                <span
                  key={a}
                  className={i === affIdx ? `${s.dot} ${s.dotOn}` : s.dot}
                  style={i === affIdx ? { background: patient.branding?.accent } : undefined}
                />
              ))}
            </div>
          </>
        ) : null}
      </header>

      <div className={s.body}>
        {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
        {chargement ? <p className={s.count}>Chargement…</p> : null}

        {taches.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Aujourd'hui</span>
              <span className={s.count}>
                {faites} / {taches.length}
              </span>
            </div>

            {journeeFaite ? (
              <div className={s.done}>
                <p className={s.doneTitle}>La journée est faite.</p>
                <p className={s.doneText}>
                  Rien d'autre à faire aujourd'hui. À demain.
                </p>
              </div>
            ) : (
              taches.map((m) => {
                const fait = Boolean(m.done_at)
                return (
                  <div key={m.id} className={fait ? `${s.task} ${s.taskDone}` : s.task}>
                    <RoundCheck
                      on={fait}
                      onClick={() => void basculer(m.id, !fait)}
                      label={fait ? `Décocher ${m.title}` : `Cocher ${m.title}`}
                      style={fait ? { background: patient.branding?.accent, borderColor: patient.branding?.accent } : undefined}
                    />
                    <span>
                      <span className={fait ? `${s.taskTitle} ${s.taskTitleDone}` : s.taskTitle}>
                        {m.title}
                      </span>
                      <span className={s.taskMeta}>{m.meta}</span>
                    </span>
                  </div>
                )
              })
            )}
          </section>
        ) : null}

        {audios.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Vos audios</span>
              <span className={s.count}>Écoutables hors connexion</span>
            </div>
            {audios.map((a) => (
              <div key={a.id} className={s.audio}>
                <button
                  type="button"
                  className={s.play}
                  style={{ color: patient.branding?.accent }}
                  aria-label={`Écouter ${a.audio?.title ?? 'cet audio'}`}
                  onClick={() => void supabase()?.rpc('patient_count_listen', { p_audio: a.id })}
                >
                  ▶
                </button>
                <span>
                  <span className={s.audioTitle}>{a.audio?.title}</span>
                  <span className={s.audioMeta}>
                    {a.listens > 0 ? `Écouté ${a.listens} fois` : 'Jamais écouté'}
                  </span>
                </span>
                <span className={s.duration}>{timecode(a.audio?.duration_seconds ?? 0)}</span>
              </div>
            ))}
          </section>
        ) : null}

        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionTitle}>Ce soir</span>
          </div>
          <p className={s.question}>{scaleQuestion}</p>
          <div className={s.scale}>
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                className={valeurEchelle === n ? `${s.step} ${s.stepOn}` : s.step}
                style={
                  valeurEchelle === n
                    ? { background: patient.branding?.accent, borderColor: patient.branding?.accent }
                    : undefined
                }
                onClick={() => void noterEchelle(n)}
                aria-pressed={valeurEchelle === n}
              >
                {n}
              </button>
            ))}
          </div>
          {envoi ? (
            <p className={s.count} style={{ marginTop: 10 }}>
              {envoi}
            </p>
          ) : null}
        </section>

        <p className={s.foot}>
          {patient.cabinet_name}
          <br />
          <button type="button" className={s.footLink} onClick={() => void seDeconnecter()}>
            Me déconnecter
          </button>
        </p>
      </div>
    </div>
  )
}
