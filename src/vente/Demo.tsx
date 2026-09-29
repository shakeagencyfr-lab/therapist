/**
 * Les aperçus du produit sur la page de vente.
 *
 * CE QU'ILS SONT, EXACTEMENT. Le téléphone et le suivi sont des composants
 * de l'application, rendus sur le portefeuille de démonstration de src/data :
 * le téléphone est l'APERÇU PATIENT QUE LA THÉRAPEUTE VOIT dans son espace
 * (src/views/patient), pas l'espace réel du patient (src/patient) — il parle
 * de « sa thérapeute » là où l'espace réel dit « votre thérapeute », et n'a
 * pas le pied d'urgence. La légende de la page le dit.
 *
 * Le brouillon de note (NoteDemo), lui, n'est pas l'écran DraftStep : cet
 * écran porte l'envoi au dossier, la copie du message, l'actualisation du
 * profil — des gestes qui appellent le serveur. C'est un extrait lisible,
 * avec les mêmes rubriques, sur une séance inventée.
 *
 * TOUT EST MARQUÉ « EXEMPLE FICTIF », DANS LE CADRE. Une capture d'un aperçu
 * circule sans le paragraphe qui l'introduit : c'est l'image elle-même qui
 * doit dire qu'elle ne montre aucun résultat réel. Et l'écart spectaculaire
 * de l'échelle (« 8 → 3 en trois semaines ») n'est pas affiché ici — une
 * page de vente n'a pas de chiffre d'efficacité à montrer.
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
import { initialState, type AppState } from '@/state/state'
import { AppStoreProvider, useStore } from '@/state/store'
import { PatientHome } from '@/views/patient/PatientHome'
import { PatientJournal } from '@/views/patient/PatientJournal'
import { PhoneFrame } from '@/views/patient/PhoneFrame'
import { TaskDetail } from '@/views/patient/TaskDetail'
import { ScaleChart } from '@/views/therapist/ScaleChart'
import { StatsRow } from '@/views/therapist/StatsRow'
import { typographie } from './contenu'
import s from './Demo.module.css'

/**
 * Le portefeuille de démonstration, sans ce qui sortirait de la page — ni
 * l'écart de l'échelle, qui se lirait comme un résultat.
 */
const DEMONSTRATION: Partial<AppState> = {
  space: 'cabinet',
  patientsReels: false,
  affAuto: {},
  booking: null,
  pushes: [],
  patients: Object.fromEntries(
    Object.entries(initialState.patients).map(([id, p]) => [id, { ...p, scaleDelta: '' }]),
  ) as AppState['patients'],
}

/** Le suivi s'ouvre sur la fiche qui décroche : c'est ce que l'écran sert à voir. */
const SUIVI: Partial<AppState> = { ...DEMONSTRATION, sel: 'julien' }

/** La marque, dans le cadre même : une capture ne se lit pas comme un résultat. */
function Fictif({ className = '' }: { className?: string }) {
  return <span className={`${s.fictif} ${className}`}>Exemple fictif</span>
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
            <p className={s.bandeauFictif}>
              <Fictif /> Données de démonstration
            </p>
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

/** La liste de la thérapeute : qui suit, qui décroche. */
function Suivi() {
  const { state, set } = useStore()
  const decrochent = new Set(slippingPatients(state))
  const fiche = state.patients[state.sel]

  return (
    <div className={s.suivi}>
      <div className={s.liste}>
        <p className={s.listeTitre} id="demo-patients">
          <span>Vos patients cette semaine</span>
          <Fictif />
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
        <p className={s.ficheTitre}>
          <span>{fiche ? `La fiche de ${fiche.name}` : ''}</span>
          <Fictif />
        </p>
        <StatsRow />
        <ScaleChart />
      </div>
    </div>
  )
}

/** Ce que la thérapeute voit de son côté : l'assiduité, la courbe du soir. */
export function SuiviDemo() {
  return (
    <AppStoreProvider initial={SUIVI}>
      <Suivi />
    </AppStoreProvider>
  )
}

/* ------------------------------------------------------------------ *
 * Le brouillon de note — un extrait, sur une séance inventée
 * ------------------------------------------------------------------ */

interface Proposition {
  titre: string
  pourquoi: string
  /** Un des types que l'IA peut proposer (TYPES_PROPOSABLES). */
  type: 'Exercice' | 'Journal' | 'Écriture'
}

/**
 * Une troisième séance de sevrage tabagique, inventée pour Camille R. — la
 * patiente fictive du téléphone. Les rubriques sont celles du vrai brouillon
 * (DraftStep) ; le texte n'a été rédigé par personne d'autre que nous, et
 * c'est écrit dans le cadre.
 */
const BROUILLON = typographie({
  patiente: 'Camille R.',
  seance: 'Séance 3 sur 6 · Programme Liberté',
  synthese:
    'Camille arrive tendue après un appel difficile avec sa sœur ; l’envie de fumer est revenue le soir même, sans qu’elle cède. Elle dit avoir « laissé passer la vague » avec l’ancrage du souffle. L’induction courte, annoncée avant de commencer, a bien pris ; le travail a porté sur le déclencheur relationnel plutôt que sur le geste.',
  mots: ['laisser passer la vague', 'mon air est à moi', 'je n’ai plus besoin de ce geste'],
  filRouge: ['L’envie revient après les tensions, pas après les repas', 'Le besoin de savoir ce qui vient'],
  vigilance: {
    point: 'Sommeil écourté depuis une dizaine de jours',
    conduite: 'À explorer à la prochaine séance, avant d’allonger les inductions.',
  },
  propositions: [
    { titre: 'Ancrage du souffle après un appel', pourquoi: 'Pour le moment précis où l’envie revient.', type: 'Exercice' },
    { titre: 'Trois lignes le soir : ce qui a été tenu', pourquoi: 'Elle minimise ses avancées.', type: 'Journal' },
    { titre: 'Une lettre à l’envie, jamais envoyée', pourquoi: 'Pour mettre à distance le réflexe.', type: 'Écriture' },
  ] satisfies Proposition[],
})

/**
 * L'extrait du brouillon : ce que la thérapeute relit après la séance. On
 * peut y cocher et décocher, et marquer la synthèse comme relue — rien de
 * plus, et rien ne part : il n'y a ici aucun geste qui écrive quelque part.
 */
export function NoteDemo() {
  const [relue, setRelue] = useState(false)
  const [ecartees, setEcartees] = useState<Record<number, boolean>>({})
  const retenues = BROUILLON.propositions.filter((_, i) => !ecartees[i]).length

  return (
    <figure className={s.note} aria-labelledby="note-demo-legende">
      <div className={s.noteHaut}>
        <p className={s.noteQui}>
          <span className={s.noteNom}>Brouillon de note · {BROUILLON.patiente}</span>
          <span className={s.noteSeance}>{BROUILLON.seance}</span>
        </p>
        <Fictif />
      </div>

      <div className={s.noteBloc}>
        <div className={s.noteBlocTete}>
          <p className={s.noteRubrique}>Synthèse de séance</p>
          <button
            type="button"
            className={relue ? `${s.relue} ${s.relueOui}` : s.relue}
            aria-pressed={relue}
            onClick={() => setRelue((r) => !r)}
          >
            {relue ? '✓ Relue' : 'Marquer comme relue'}
          </button>
        </div>
        <p className={s.noteSynthese}>{BROUILLON.synthese}</p>
      </div>

      <div className={s.notePaire}>
        <div className={s.noteBloc}>
          <p className={s.noteRubrique}>Les mots de la séance</p>
          <ul className={s.mots}>
            {BROUILLON.mots.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div className={s.noteBloc}>
          <p className={s.noteRubrique}>Fil rouge</p>
          <ul className={s.filRouge}>
            {BROUILLON.filRouge.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${s.noteBloc} ${s.noteVigilance}`}>
        <p className={s.noteRubrique}>Point de vigilance</p>
        <p className={s.vigilancePoint}>{BROUILLON.vigilance.point}</p>
        <p className={s.vigilanceConduite}>{BROUILLON.vigilance.conduite}</p>
      </div>

      <div className={s.noteBloc}>
        <div className={s.noteBlocTete}>
          <p className={s.noteRubrique}>Pour l’entre-séances</p>
          <span className={s.compte}>
            {retenues} sur {BROUILLON.propositions.length} retenus
          </span>
        </div>
        <ul className={s.propositions}>
          {BROUILLON.propositions.map((p, i) => {
            const garde = !ecartees[i]
            return (
              <li key={p.titre}>
                <button
                  type="button"
                  className={garde ? s.proposition : `${s.proposition} ${s.propositionEcartee}`}
                  aria-pressed={garde}
                  onClick={() => setEcartees((prev) => ({ ...prev, [i]: !prev[i] }))}
                >
                  <span className={garde ? `${s.case} ${s.caseCochee}` : s.case} aria-hidden="true">
                    {garde ? '✓' : ''}
                  </span>
                  <span className={s.propositionTexte}>
                    <span className={s.propositionTitre}>{p.titre}</span>
                    <span className={s.propositionPourquoi}>{p.pourquoi}</span>
                  </span>
                  <span className={s.propositionType}>{p.type}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <figcaption id="note-demo-legende" className={s.noteLegende}>
        Extrait d’un brouillon, sur une séance inventée. Le vrai ajoute les audios proposés, le message à
        votre patient et la barre d’envoi&nbsp;: rien ne part avant que vous validiez.
      </figcaption>
    </figure>
  )
}

export default TelephoneDemo
