/**
 * L'aperçu du produit sur la page de vente — les VRAIS écrans.
 *
 * Pas une capture, pas une maquette dessinée pour l'occasion : ce sont les
 * composants de l'application (l'aperçu patient de la thérapeute, sa courbe,
 * ses compteurs), rendus sur le portefeuille de démonstration de src/data.
 * Ce que la visiteuse touche ici, c'est ce que ses patients toucheront.
 *
 * Chargé à part (import dynamique, depuis PageDeVente) : il tire le magasin
 * d'état et les données de démonstration, que la page elle-même n'a pas à
 * attendre pour s'afficher.
 *
 * RIEN NE PART D'ICI. Le portefeuille de démonstration n'est relié à aucune
 * base ; le seul geste qui appellerait le serveur — régénérer les
 * affirmations — n'est pas proposé (`affAuto` vide), et l'agenda tiers
 * n'est pas encadré (`booking` nul) : aucune ressource extérieure.
 */
import { useState } from 'react'
import { BRAND_PRESETS } from '@/data/reseller'
import { variablesDeMarque } from '@/lib/couleurs'
import { allModules, riskColor, slippingPatients } from '@/state/selectors'
import type { AppState } from '@/state/state'
import { AppStoreProvider, useStore } from '@/state/store'
import { PatientHome } from '@/views/patient/PatientHome'
import { PatientJournal } from '@/views/patient/PatientJournal'
import { PhoneFrame } from '@/views/patient/PhoneFrame'
import { TaskDetail } from '@/views/patient/TaskDetail'
import { ScaleChart } from '@/views/therapist/ScaleChart'
import { StatsRow } from '@/views/therapist/StatsRow'
import s from './Demo.module.css'

/** Le portefeuille de démonstration, sans ce qui sortirait de la page. */
const DEMONSTRATION: Partial<AppState> = {
  space: 'cabinet',
  patientsReels: false,
  affAuto: {},
  booking: null,
  pushes: [],
}

/** L'écran que montrerait le téléphone, selon l'endroit où l'on a touché. */
function EcranPatient() {
  const { state } = useStore()
  const modules = allModules(state, state.sel)
  const tacheOuverte = state.pView === 'home' && state.openTask !== null && Boolean(modules[state.openTask])
  if (state.pView === 'journal') return <PatientJournal />
  if (tacheOuverte) return <TaskDetail />
  return <PatientHome />
}

/**
 * Le téléphone du patient, et les couleurs d'un cabinet à essayer dessus.
 *
 * Les teintes sont celles que le revendeur propose à l'ouverture d'un cabinet
 * (BRAND_PRESETS), appliquées par la même fonction que la marque réelle
 * (variablesDeMarque) : c'est la marque blanche, pour de vrai.
 */
export function TelephoneDemo() {
  const [teinte, setTeinte] = useState(0)
  const marque = BRAND_PRESETS[teinte] ?? BRAND_PRESETS[0]
  return (
    <AppStoreProvider initial={DEMONSTRATION}>
      <div className={s.telephone} style={variablesDeMarque(marque)}>
        <PhoneFrame>
          <div
            className={s.ecran}
            role="region"
            aria-label="Aperçu interactif de l'espace patient, sur des données de démonstration"
            tabIndex={0}
          >
            <EcranPatient />
          </div>
        </PhoneFrame>
      </div>
      <fieldset className={s.teintes}>
        <legend className={s.teintesTitre}>Essayez les couleurs d’un cabinet</legend>
        <div className={s.pastilles}>
          {BRAND_PRESETS.map((p, i) => (
            <label key={p.label} className={s.pastille}>
              <input
                type="radio"
                name="teinte-demo"
                className={s.pastilleChoix}
                checked={i === teinte}
                onChange={() => setTeinte(i)}
              />
              <span className={s.pastilleCouleur} style={{ background: p.accent }} aria-hidden />
              <span className={s.pastilleNom}>{p.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </AppStoreProvider>
  )
}

/** La liste de la praticienne : qui suit, qui décroche. */
function Suivi() {
  const { state, set } = useStore()
  const decrochent = new Set(slippingPatients(state))
  const fiche = state.patients[state.sel]

  return (
    <div className={s.suivi}>
      <div className={s.liste}>
        <p className={s.listeTitre} id="demo-patients">
          Vos patients cette semaine
        </p>
        <ul className={s.patients} aria-labelledby="demo-patients">
          {state.patientOrder.map((id) => {
            const p = state.patients[id]
            if (!p) return null
            const choisi = id === state.sel
            return (
              <li key={id}>
                <button
                  type="button"
                  className={choisi ? `${s.patient} ${s.patientChoisi}` : s.patient}
                  aria-pressed={choisi}
                  onClick={() => set({ sel: id, openTask: null, pView: 'home' })}
                >
                  <span className={s.pastilleRisque} style={{ background: riskColor(p.adherence) }} aria-hidden />
                  <span className={s.patientNoms}>
                    <span className={s.patientNom}>{p.name}</span>
                    <span className={s.patientSous}>{p.subtitle}</span>
                  </span>
                  <span className={s.patientDroite}>
                    <span className={s.assiduite}>{p.adherence} %</span>
                    {decrochent.has(id) ? <span className={s.decroche}>décroche</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div className={s.fiche} aria-live="polite">
        <p className={s.ficheTitre}>{fiche ? `La fiche de ${fiche.name}` : ''}</p>
        <StatsRow />
        <ScaleChart />
      </div>
    </div>
  )
}

/** Ce que la praticienne voit de son côté : l'assiduité, la courbe du soir. */
export function SuiviDemo() {
  return (
    <AppStoreProvider initial={DEMONSTRATION}>
      <Suivi />
    </AppStoreProvider>
  )
}

export default TelephoneDemo
