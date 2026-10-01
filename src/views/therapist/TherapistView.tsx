import { useEffect, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { EVENEMENT_LISTE_PATIENTS } from '@/components/layout/NavigationBas'
import { libelleNonLus, totalNonLus } from '@/lib/fil'
import { useAppState } from '@/state/store'
import { PatientSidebar } from './PatientSidebar'
import { PatientHeader } from './PatientHeader'
import { FicheSettings, type GesteDeFiche } from './FicheSettings'
import { StatsRow } from './StatsRow'
import { WeekModules } from './WeekModules'
import { HypnosesFiche } from '@/views/therapist/HypnosesFiche'
import { PsychProfile } from '@/views/therapist/PsychProfile'
import { ScaleChart } from '@/views/therapist/ScaleChart'
import { PatientAudios } from '@/views/therapist/PatientAudios'
import { Affirmations } from '@/views/therapist/Affirmations'
import { SharedJournal } from '@/views/therapist/SharedJournal'
import { SeancesFiche } from '@/views/therapist/SeancesFiche'
import { NotesCliniques } from '@/views/therapist/NotesCliniques'
import { ExportDossier } from '@/views/therapist/ExportDossier'
import s from './TherapistView.module.css'

/** Les volets de la fiche. */
type Volet = 'suivi' | 'seances' | 'notes' | 'profil' | 'reglages'

/* « Séances » juste après « Suivi » : relire la séance précédente est le
   geste d'avant chaque rendez-vous (0053). L'anamnèse vient ensuite — elle
   se relit, elle ne se consulte pas chaque jour. */
const VOLETS: Array<{ value: Volet; label: string }> = [
  { value: 'suivi', label: 'Suivi' },
  { value: 'seances', label: 'Séances' },
  { value: 'notes', label: 'Anamnèse et notes' },
  { value: 'profil', label: 'Profil et hypnoses' },
  { value: 'reglages', label: 'Réglages de la fiche' },
]

/**
 * Espace thérapeute : barre latérale de patients + fiche.
 *
 * La fiche se lit en volets. À plat, elle empilait neuf cartes sur
 * deux écrans de hauteur : les modules de la semaine — ce qu'on regarde
 * chaque jour — arrivaient sous le profil psychologique et les hypnoses,
 * qu'on consulte une fois par mois. Le volet « Suivi » ouvre sur ce qui
 * bouge ; le reste est à un clic, pas à trois écrans.
 */
export function TherapistView() {
  /* Tiroir de la barre latérale sous 900px : état d'interface purement local,
     il n'a pas à voyager dans AppState. */
  const [drawer, setDrawer] = useState(false)
  const [volet, setVolet] = useState<Volet>('suivi')
  /* « Clore le suivi » / « Supprimer la fiche », demandés depuis l'en-tête :
     le volet des réglages s'ouvre et descend au bon endroit. L'horodatage
     fait rejouer la descente si l'on redemande le même geste. */
  const [geste, setGeste] = useState<{ quoi: GesteDeFiche; quand: number } | null>(null)
  /* « Patients » touché de nouveau dans la barre du bas, fiche déjà
     ouverte : c'est la liste qu'on demande (NavigationBas). */
  useEffect(() => {
    const ouvrir = () => setDrawer(true)
    window.addEventListener(EVENEMENT_LISTE_PATIENTS, ouvrir)
    return () => window.removeEventListener(EVENEMENT_LISTE_PATIENTS, ouvrir)
  }, [])
  const state = useAppState()
  const cabinet = useMaybeCabinet()

  /* Un cabinet neuf n'a aucun patient : la fiche n'a alors rien à montrer,
     et l'afficher planterait. C'est le premier écran que voit une praticienne
     qui vient d'accepter son invitation — il doit lui dire quoi faire. */
  const fiche = state.patients[state.sel]
  // Une autre fiche ouverte : le geste demandé pour la précédente ne la suit pas.
  useEffect(() => setGeste(null), [state.sel])
  /** Les mots qui attendent, toutes fiches confondues (0054). */
  const enAttente = totalNonLus(state.nonLus, state.patientOrder)

  return (
    <div className={s.layout}>
      <PatientSidebar open={drawer} onClose={() => setDrawer(false)} />

      <main className={s.main}>
        <button
          type="button"
          className={s.drawerBtn}
          onClick={() => setDrawer((open) => !open)}
          aria-expanded={drawer}
          aria-controls="patient-sidebar"
        >
          Patients
          {/* Sur un téléphone, la liste est repliée : ses pastilles aussi.
              Le total des mots qui attendent reste à portée d'œil (0054). */}
          {enAttente > 0 ? <span className={s.drawerNonLus}>{libelleNonLus(enAttente)}</span> : null}
        </button>

        {fiche ? (
          <>
            {/* En démonstration, rien ne se clôt ni ne se supprime : pas de « ⋯ ». */}
            <PatientHeader
              onGeste={
                cabinet?.reel
                  ? (quoi) => {
                      setVolet('reglages')
                      setGeste({ quoi, quand: Date.now() })
                    }
                  : undefined
              }
            />

            <div className={s.volets} role="tablist" aria-label="Volets de la fiche">
              {VOLETS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="tab"
                  aria-selected={volet === v.value}
                  className={volet === v.value ? `${s.volet} ${s.voletOn}` : s.volet}
                  onClick={() => {
                    setGeste(null)
                    setVolet(v.value)
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {volet === 'suivi' ? (
              <>
                <StatsRow />
                <div className={s.split}>
                  <WeekModules />
                  <div className={s.column}>
                    <ScaleChart />
                    <SharedJournal />
                    <PatientAudios />
                    {/* La clé de la fiche : le retour du dernier envoi (« 3
                        affirmations envoyées à Nadia ») ne suit pas sur la
                        fiche de Camille. */}
                    <Affirmations key={`affirmations-${state.sel}`} />
                  </div>
                </div>
              </>
            ) : null}

            {/* Les deux cartes portent la clé de la fiche : sans elle, une
                écriture d'hypnose lancée sur Nadia restait affichée « en
                cours » en passant à Camille, avec les titres de la première. */}
            {volet === 'profil' ? (
              <>
                <PsychProfile key={`profil-${state.sel}`} />
                <HypnosesFiche key={`hypnoses-${state.sel}`} />
              </>
            ) : null}

            {/* La clé de la fiche, ici aussi : une note d'honoraires ouverte
                pour Nadia ne doit pas s'émettre au nom de Camille. */}
            {volet === 'seances' ? <SeancesFiche key={`seances-${state.sel}`} /> : null}
            {volet === 'notes' ? <NotesCliniques key={`notes-${state.sel}`} /> : null}

            {volet === 'reglages' ? (
              <>
                <FicheSettings key={state.sel} ouvertParDefaut geste={geste} />
                <ExportDossier key={`export-${state.sel}`} />
              </>
            ) : null}
          </>
        ) : (
          <div className={s.empty}>
            <h1 className={s.emptyTitle}>
              {cabinet?.chargement
                ? 'Ouverture de votre cabinet…'
                : cabinet?.erreur
                  ? "Votre dossier n'a pas pu être lu"
                  : 'Votre cabinet est prêt'}
            </h1>
            {cabinet?.erreur ? (
              <p className={s.emptyText}>{cabinet.erreur}</p>
            ) : cabinet?.chargement ? null : (
              <p className={s.emptyText}>
                Aucun patient pour l'instant. Ouvrez votre première fiche depuis la colonne de
                gauche : un nom et une adresse suffisent. Le programme, ce que vous suivez et la
                question du soir se règlent ensuite depuis la fiche. Son espace s'ouvrira avec
                cette adresse, sans mot de passe.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
