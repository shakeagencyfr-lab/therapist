import { useState } from 'react'
import { Button, Card, EmptyState, Notice, Overline, Pill, TextArea, TextInput } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { useRappelsReguliers, type EtatRappelsReguliers } from '@/cabinet/useRappelsReguliers'
import { jourDeParis } from '@/lib/assiduite'
import { MOT_MASQUE } from '@/lib/discretion'
import { plural } from '@/lib/format'
import {
  JOURS_DE_LA_SEMAINE,
  etatRappel,
  finMaximale,
  finParDefaut,
  heureDuChamp,
  jourIso,
  libelleRecurrence,
  mentionFuseau,
  phraseDestinataires,
  phrasePremierEnvoi,
  phraseProchainEnvoi,
  rappelsOrdonnes,
  refusRappel,
  type RappelRegulier,
  type SaisieRappel,
} from '@/lib/rappelsReguliers'
import { useStore } from '@/state/store'
import n from './NotificationsView.module.css'
import s from './RappelsReguliers.module.css'

interface Resultat {
  ok: boolean
  message: string
}

interface Personne {
  id: string
  nom: string
}

export interface VueRappelsProps {
  etat: EtatRappelsReguliers
  rappels: RappelRegulier[]
  /** Les suivis en cours du cabinet, dans l'ordre de la liste des patients. */
  personnes: Personne[]
  /** Le groupe que les filtres de l'écran composent, à reprendre d'un geste. */
  groupe: string[]
  /** Téléphones inscrits par fiche ; `null` hors cabinet réel. */
  telephones: Record<string, number> | null
  onProgrammer: (saisie: SaisieRappel) => Promise<Resultat>
  onArreter: (rappelId: string) => Promise<Resultat>
  onRelire: () => void
  /** Pour le banc de rendu : l'heure qu'il est, et le fuseau du navigateur. */
  maintenant?: Date
  fuseau?: string
}

const ETIQUETTES = { 'en-cours': 'En cours', termine: 'Terminé', arrete: 'Arrêté' } as const
const TONS = { 'en-cours': 'ok', termine: 'neutral', arrete: 'warn' } as const

/**
 * Les rappels qui reviennent, tels que l'écran les montre — sans rien lire
 * ni écrire lui-même.
 *
 * « Chaque jour à 20 h », « chaque lundi à 9 h », pour quelques personnes,
 * jusqu'à une date de fin. La base écrit le mot du jour à l'heure dite ; il
 * suit ensuite le chemin de tous les mots — l'espace, le téléphone, le
 * journal des envois.
 */
export function VueRappelsReguliers({
  etat,
  rappels,
  personnes,
  groupe,
  telephones,
  onProgrammer,
  onArreter,
  onRelire,
  maintenant,
  fuseau,
}: VueRappelsProps) {
  const instant = maintenant ?? new Date()
  const [titre, setTitre] = useState('')
  const [texte, setTexte] = useState('')
  const [frequence, setFrequence] = useState<'jour' | 'semaine'>('jour')
  const [jourSemaine, setJourSemaine] = useState(() => jourIso(jourDeParis(instant)))
  const [heure, setHeure] = useState('20:00')
  const [finLe, setFinLe] = useState(() => finParDefaut(instant))
  const [choisies, setChoisies] = useState<string[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<Resultat | null>(null)
  const [confirme, setConfirme] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [retourListe, setRetourListe] = useState<Resultat | null>(null)
  const [voirFinis, setVoirFinis] = useState(false)

  const demo = etat === 'demo'
  const indisponible = etat === 'indisponible'
  const connues = new Set(personnes.map((p) => p.id))
  // Une fiche close depuis la saisie ne part pas : la base la refuserait.
  const patients = choisies.filter((id) => connues.has(id))
  const saisie: SaisieRappel = { titre, texte, frequence, jourSemaine, heure, finLe, patients }
  const refus = refusRappel(saisie, instant)
  const peut = !refus && !envoi && !demo && !indisponible
  const aPartie = (id: string) => (telephones ? (telephones[id] ?? 0) > 0 : true)
  const sansTelephone = patients.filter((id) => !aPartie(id)).length
  const heureLue = heureDuChamp(heure)
  const fuseauDit = mentionFuseau(fuseau)

  function basculer(id: string) {
    setChoisies((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : avant.concat([id])))
  }

  async function programmer() {
    // Relu au clic : l'heure a pu passer pendant qu'on écrivait.
    if (refusRappel(saisie, new Date()) || envoi || demo) return
    setEnvoi(true)
    setRetour(null)
    const r = await onProgrammer(saisie)
    setEnvoi(false)
    setRetour(r)
    if (r.ok) {
      setTitre('')
      setTexte('')
      setChoisies([])
    }
  }

  async function arreter(id: string) {
    setOccupe(true)
    setRetourListe(null)
    const r = await onArreter(id)
    setOccupe(false)
    setConfirme(null)
    setRetourListe(r)
  }

  const ordonnes = rappelsOrdonnes(rappels, instant)
  const enCours = ordonnes.filter((r) => etatRappel(r, instant) === 'en-cours')
  const finis = ordonnes.filter((r) => etatRappel(r, instant) !== 'en-cours')

  return (
    <Card padded={false} className={s.carte}>
      <div className={s.tete}>
        <h2 className={n.h2}>Rappels réguliers</h2>
        <p className={s.intro}>
          Un même mot, chaque jour ou chaque semaine à la même heure, jusqu'à une date de fin. Il
          part de lui-même à l'heure dite — dans l'espace de chaque personne, et sur son téléphone si
          elle a activé les rappels. Arrêtez-le quand vous voulez.
        </p>
      </div>

      <div className={s.grille}>
        {/* ── Programmer ─────────────────────────────────────────────── */}
        <form
          className={s.formulaire}
          aria-label="Programmer un rappel régulier"
          onSubmit={(e) => {
            e.preventDefault()
            void programmer()
          }}
        >
          <TextInput
            dictee
            value={titre}
            maxLength={120}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre (facultatif)"
            aria-label="Titre du rappel régulier"
          />
          <TextArea
            dictee
            rows={3}
            value={texte}
            maxLength={1000}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Le mot qui partira, deux phrases suffisent."
            aria-label="Texte du rappel régulier"
          />
          <p className={s.discret}>
            Sur l'écran verrouillé, il s'affiche « {MOT_MASQUE.titre} » tant que la personne n'a pas
            choisi d'en montrer le contenu. Restez discret malgré tout sur le motif du suivi.
          </p>

          <div className={s.bloc}>
            <span className={n.label}>
              <Overline>Quand</Overline>
            </span>
            <div className={n.chips} role="group" aria-label="Fréquence">
              {(['jour', 'semaine'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={frequence === f ? `${n.chip} ${n.chipOn}` : n.chip}
                  aria-pressed={frequence === f}
                  onClick={() => setFrequence(f)}
                >
                  {f === 'jour' ? 'Chaque jour' : 'Chaque semaine'}
                </button>
              ))}
            </div>
            {frequence === 'semaine' ? (
              <div className={n.chips} role="group" aria-label="Jour de la semaine" style={{ marginTop: 8 }}>
                {JOURS_DE_LA_SEMAINE.map((jour, i) => (
                  <button
                    key={jour}
                    type="button"
                    className={jourSemaine === i + 1 ? `${n.chip} ${n.chipOn}` : n.chip}
                    aria-pressed={jourSemaine === i + 1}
                    onClick={() => setJourSemaine(i + 1)}
                  >
                    {jour}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={s.rangee}>
            <label className={s.champ}>
              À quelle heure{fuseauDit}
              <input
                type="time"
                step={60}
                className={`${n.quandChamp} ${s.saisie}`}
                value={heure}
                aria-invalid={!heureLue}
                onChange={(e) => setHeure(e.target.value)}
              />
            </label>
            <label className={s.champ}>
              Jusqu'au (inclus)
              <input
                type="date"
                className={`${n.quandChamp} ${s.saisie}`}
                value={finLe}
                min={jourDeParis(instant)}
                max={finMaximale(instant)}
                onChange={(e) => setFinLe(e.target.value)}
              />
            </label>
          </div>

          <div className={s.bloc}>
            <div className={s.personnesTete}>
              <span className={n.label} style={{ marginBottom: 0 }}>
                <Overline>Pour qui</Overline>
              </span>
              <span className={s.raccourcis}>
                <button
                  type="button"
                  className={s.raccourci}
                  disabled={!groupe.length}
                  onClick={() => setChoisies(groupe.filter((id) => connues.has(id)))}
                >
                  Le groupe filtré ({groupe.filter((id) => connues.has(id)).length})
                </button>
                <button
                  type="button"
                  className={s.raccourci}
                  disabled={!personnes.length}
                  onClick={() => setChoisies(personnes.map((p) => p.id))}
                >
                  Tout le monde
                </button>
                <button type="button" className={s.raccourci} disabled={!patients.length} onClick={() => setChoisies([])}>
                  Personne
                </button>
              </span>
            </div>
            {personnes.length ? (
              <ul className={s.personnes} aria-label="Destinataires du rappel régulier">
                {personnes.map((p) => (
                  <li key={p.id} className={s.personne}>
                    <label>
                      <input type="checkbox" checked={patients.includes(p.id)} onChange={() => basculer(p.id)} />
                      <span className={s.personneNom}>{p.nom}</span>
                      {!aPartie(p.id) ? <span className={s.sansTelephone}>sans rappels activés</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState style={{ marginTop: 8 }}>Aucun suivi en cours : il n'y a personne à qui l'envoyer.</EmptyState>
            )}
          </div>

          {!refus && heureLue ? (
            <p className={s.resume}>
              {libelleRecurrence(frequence === 'semaine' ? jourSemaine : null, heureLue)}
              {fuseauDit}, pour {plural(patients.length, 'personne', 'personnes')}.{' '}
              {phrasePremierEnvoi(saisie, instant)}
              {sansTelephone === 1
                ? " Une personne n'a pas activé les rappels : le mot l'attendra dans son espace."
                : sansTelephone > 1
                  ? ` ${sansTelephone} personnes n'ont pas activé les rappels : le mot les attendra dans leur espace.`
                  : ''}
            </p>
          ) : null}

          {retour ? (
            <Notice tone={retour.ok ? 'ok' : 'warn'} style={{ margin: '4px 0 0' }}>
              {retour.message}
            </Notice>
          ) : null}

          <div className={s.envoi}>
            <Button variant="primary" type="submit" disabled={!peut}>
              {envoi ? 'Programmation…' : 'Programmer ce rappel'}
            </Button>
            {refus && !demo && !indisponible ? (
              <p className={n.quandRaison} role="status" style={{ margin: 0 }}>
                {refus}
              </p>
            ) : null}
          </div>
        </form>

        {/* ── Ceux qui courent ──────────────────────────────────────── */}
        <div aria-live="polite">
          <span className={n.label}>
            <Overline>
              {enCours.length ? `${plural(enCours.length, 'rappel en cours', 'rappels en cours')}` : 'En cours'}
            </Overline>
          </span>

          {demo ? (
            <Notice tone="warn">
              Démonstration : les rappels réguliers se programment et se lisent dans votre cabinet,
              pas ici. Rien ne partira.
            </Notice>
          ) : null}
          {indisponible ? (
            <Notice tone="warn">
              Les rappels réguliers ne sont pas encore ouverts sur ce cabinet : la mise à jour de la
              base est attendue.
            </Notice>
          ) : null}
          {etat === 'chargement' ? <p className={s.rappelMeta}>Lecture des rappels…</p> : null}
          {etat === 'echec' ? (
            <Notice tone="warn">
              Les rappels réguliers n'ont pas pu être lus. Ce qui manque ici n'est pas vide — il n'a
              pas été chargé.{' '}
              <button type="button" className={n.logAction} onClick={onRelire}>
                Réessayer
              </button>
            </Notice>
          ) : null}

          {etat === 'pret' && !enCours.length ? (
            <EmptyState>
              Aucun rappel régulier en cours. Programmez-en un : il partira à l'heure dite, jusqu'à
              sa date de fin, sans que vous ayez à y revenir.
            </EmptyState>
          ) : null}

          {enCours.length ? (
            <ul className={s.liste}>
              {enCours.map((r) => (
                <LigneRappel
                  key={r.id}
                  rappel={r}
                  maintenant={instant}
                  fuseauDit={fuseauDit}
                  confirme={confirme === r.id}
                  occupe={occupe}
                  onDemander={() => {
                    setRetourListe(null)
                    setConfirme(r.id)
                  }}
                  onGarder={() => setConfirme(null)}
                  onArreter={() => void arreter(r.id)}
                />
              ))}
            </ul>
          ) : null}

          {retourListe ? (
            <Notice tone={retourListe.ok ? 'ok' : 'warn'} style={{ margin: '10px 0 0' }}>
              {retourListe.message}
            </Notice>
          ) : null}

          {finis.length ? (
            <div className={s.voirFinis}>
              <button
                type="button"
                className={n.logAction}
                aria-expanded={voirFinis}
                onClick={() => setVoirFinis((v) => !v)}
              >
                {voirFinis
                  ? 'Masquer les rappels terminés'
                  : `Voir les rappels terminés ou arrêtés (${finis.length})`}
              </button>
              {voirFinis ? (
                <ul className={s.liste} style={{ marginTop: 10 }}>
                  {finis.map((r) => (
                    <LigneRappel key={r.id} rappel={r} maintenant={instant} fuseauDit={fuseauDit} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function LigneRappel({
  rappel: r,
  maintenant,
  fuseauDit,
  confirme = false,
  occupe = false,
  onDemander,
  onGarder,
  onArreter,
}: {
  rappel: RappelRegulier
  maintenant: Date
  fuseauDit: string
  confirme?: boolean
  occupe?: boolean
  onDemander?: () => void
  onGarder?: () => void
  onArreter?: () => void
}) {
  const etat = etatRappel(r, maintenant)
  return (
    <li className={etat === 'en-cours' ? s.rappel : `${s.rappel} ${s.rappelFini}`}>
      <div className={s.rappelTete}>
        <span className={s.rappelTitre}>{r.titre}</span>
        <Pill tone={TONS[etat]}>{ETIQUETTES[etat]}</Pill>
      </div>
      <div className={s.rappelQuand}>
        {libelleRecurrence(r.jourSemaine, r.heure)}
        {fuseauDit}
      </div>
      <p className={s.rappelTexte}>{r.texte}</p>
      <p className={s.rappelMeta}>
        {phraseDestinataires(r.destinataires)} · {phraseProchainEnvoi(r, maintenant)}
      </p>
      {etat === 'en-cours' && onDemander ? (
        <div className={n.logActions}>
          {confirme ? (
            <>
              <span className={n.logConfirme}>
                Arrêter ce rappel ? Il ne partira plus ; les mots déjà envoyés restent.
              </span>
              <button type="button" className={n.logAction} disabled={occupe} onClick={onArreter}>
                {occupe ? 'Arrêt…' : "Oui, l'arrêter"}
              </button>
              <button type="button" className={n.logAction} disabled={occupe} onClick={onGarder}>
                Le garder
              </button>
            </>
          ) : (
            <button
              type="button"
              className={n.logAction}
              aria-label={`Arrêter le rappel « ${r.titre} »`}
              onClick={onDemander}
            >
              Arrêter
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Les rappels réguliers du cabinet connecté. */
export function RappelsReguliers({ groupe }: { groupe: string[] }) {
  const { state } = useStore()
  const cabinet = useMaybeCabinet()
  const { etat, rappels, recharger, programmer, arreter } = useRappelsReguliers()
  const personnes = state.patientOrder
    .filter((id) => state.patients[id])
    .map((id) => ({ id, nom: state.patients[id].name }))
  const fuseau = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return undefined
    }
  })()
  return (
    <VueRappelsReguliers
      etat={etat}
      rappels={rappels}
      personnes={personnes}
      groupe={groupe}
      telephones={cabinet?.reel ? state.appareils : null}
      onProgrammer={programmer}
      onArreter={arreter}
      onRelire={() => void recharger()}
      fuseau={fuseau}
    />
  )
}
