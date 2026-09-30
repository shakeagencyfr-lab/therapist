import { useEffect, useId, useState } from 'react'
import { Button, Card, EmptyState, Notice, Sub, TextArea, TextInput, Title } from '@/components/ui'
import { useDossierFiche } from '@/cabinet/useDossierFiche'
import type { GestesDossier } from '@/cabinet/dossier'
import { jourDeParis } from '@/lib/assiduite'
import {
  CHAMPS_ANAMNESE,
  LIMITE_CHAMP_ANAMNESE,
  LIMITE_NOTE_DATEE,
  anamneseModifiee,
  dateDeNote,
  refusNoteDatee,
  type Anamnese,
  type NoteDatee,
} from '@/lib/dossier'
import { jourLisible } from '@/lib/honoraires'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './NotesCliniques.module.css'

type Retour = { tone: 'ok' | 'warn'; text: string } | null

/**
 * Le volet « Anamnèse et notes » : ce que la praticienne sait de la personne
 * en dehors des séances.
 *
 * CE QUI S'Y ÉCRIT RESTE AU CABINET. Ni le patient ni le revendeur n'ont de
 * chemin de lecture (0053, supabase/tests/dossier.sql) ; l'écran le dit, pour
 * qu'on y écrive ce qu'on n'écrirait pas ailleurs. Mais la personne y a
 * droit : ces notes figurent dans l'export de son dossier, et l'écran le dit
 * aussi.
 */
export function NotesCliniques() {
  const state = useAppState()
  const fiche = patientOf(state)
  const { etat, dossier, gestes, recharger } = useDossierFiche(state.sel)

  if (!fiche) return null
  const prenom = fiche.name.split(' ')[0] ?? fiche.name

  if (etat === 'demo' || !gestes) {
    return (
      <Card className={s.card}>
        <Title large as="h2">
          Anamnèse et notes
        </Title>
        <EmptyState>
          L’anamnèse et les notes de suivi s’écrivent dans le dossier réel de votre cabinet : la
          fiche de démonstration n’en garde pas.
        </EmptyState>
      </Card>
    )
  }

  if (etat === 'chargement') {
    return (
      <Card className={s.card}>
        <Title large as="h2">
          Anamnèse et notes
        </Title>
        <p className={s.discret} role="status">
          Lecture du dossier…
        </p>
      </Card>
    )
  }

  return (
    <div className={s.pile}>
      <p className={s.confidentiel}>
        Ces notes restent au cabinet : ni {prenom}, ni votre revendeur n’y ont accès. Elles figurent
        en revanche dans l’export de son dossier, auquel {prenom} a droit.
      </p>
      {etat === 'echec' || !dossier || dossier.anamnese === null ? (
        <Card className={s.card}>
          <Title large as="h2">
            Anamnèse
          </Title>
          <Illisible phrase="L’anamnèse n’a pas pu être lue." onRelire={() => void recharger()} />
        </Card>
      ) : (
        /* Pas de clé sur la date de mise à jour : la carte se remonterait à
           chaque enregistrement et la confirmation disparaîtrait aussitôt.
           La saisie se compare à la version enregistrée, relue après coup. */
        <CarteAnamnese
          gestes={gestes}
          patientId={state.sel}
          enregistree={dossier.anamnese}
          modifieeLe={dossier.anamneseModifieeLe}
          onEnregistree={recharger}
        />
      )}
      {etat === 'echec' || !dossier || dossier.notes === null ? (
        <Card className={s.card}>
          <Title large as="h2">
            Notes de suivi
          </Title>
          <Illisible phrase="Les notes de suivi n’ont pas pu être lues." onRelire={() => void recharger()} />
        </Card>
      ) : (
        <CarteNotes gestes={gestes} patientId={state.sel} notes={dossier.notes} onChange={recharger} />
      )}
    </div>
  )
}

/** Ce qui n'a pas été lu n'est pas vide : on le dit, et on propose de relire. */
function Illisible({ phrase, onRelire }: { phrase: string; onRelire: () => void }) {
  return (
    <div className={s.illisible}>
      <Notice tone="warn">
        {phrase} Ce n’est pas une page blanche : rien n’est perdu, réessayez dans
        un instant.
      </Notice>
      <Button variant="secondary" onClick={onRelire}>
        Relire
      </Button>
    </div>
  )
}

/** L'anamnèse : quatre champs libres, enregistrés ensemble. */
function CarteAnamnese({
  gestes,
  patientId,
  enregistree,
  modifieeLe,
  onEnregistree,
}: {
  gestes: GestesDossier
  patientId: string
  enregistree: Anamnese
  modifieeLe: string | null
  onEnregistree: () => Promise<void>
}) {
  const id = useId()
  const [saisie, setSaisie] = useState<Anamnese>(enregistree)
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<Retour>(null)
  const modifiee = anamneseModifiee(saisie, enregistree)

  async function enregistrer() {
    if (envoi || !modifiee) return
    setEnvoi(true)
    setRetour(null)
    const r = await gestes.enregistrerAnamnese(patientId, saisie)
    setEnvoi(false)
    setRetour({ tone: r.ok ? 'ok' : 'warn', text: r.message })
    if (r.ok) await onEnregistree()
  }

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div>
          <Title large as="h2">
            Anamnèse
          </Title>
          <Sub>
            Ce que vous recueillez au premier rendez-vous et relisez avant chaque induction.{' '}
            {modifieeLe ? `Mise à jour le ${jourLisible(modifieeLe)}.` : 'Rien de consigné pour l’instant.'}
          </Sub>
        </div>
      </div>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault()
          void enregistrer()
        }}
      >
        {CHAMPS_ANAMNESE.map((champ) => (
          <label key={champ.cle} className={s.champ} htmlFor={`${id}-${champ.cle}`}>
            <span className={s.label}>{champ.libelle}</span>
            <TextArea
              id={`${id}-${champ.cle}`}
              rows={champ.cle === 'contreIndications' ? 3 : 2}
              maxLength={LIMITE_CHAMP_ANAMNESE}
              value={saisie[champ.cle]}
              placeholder={champ.exemple}
              aria-describedby={`${id}-${champ.cle}-aide`}
              onChange={(e) => setSaisie((a) => ({ ...a, [champ.cle]: e.target.value }))}
              disabled={envoi}
              dictee
            />
            <span className={s.aide} id={`${id}-${champ.cle}-aide`}>
              {champ.aide}
            </span>
          </label>
        ))}
        {retour ? <Notice tone={retour.tone}>{retour.text}</Notice> : null}
        <div className={s.actions}>
          <Button variant="primary" type="submit" disabled={envoi || !modifiee}>
            {envoi ? 'Enregistrement…' : 'Enregistrer l’anamnèse'}
          </Button>
          {modifiee ? (
            <>
              <span className={s.nonEnregistre} role="status">
                Modifications non enregistrées
              </span>
              <Button variant="ghost" onClick={() => setSaisie(enregistree)} disabled={envoi}>
                Revenir à la version enregistrée
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </Card>
  )
}

/** Les notes datées : en ajouter une, relire, corriger, retirer. */
function CarteNotes({
  gestes,
  patientId,
  notes,
  onChange,
}: {
  gestes: GestesDossier
  patientId: string
  notes: NoteDatee[]
  onChange: () => Promise<void>
}) {
  const id = useId()
  const aujourdhui = jourDeParis()
  const [le, setLe] = useState(aujourdhui)
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<Retour>(null)
  const [edition, setEdition] = useState<{ id: string; le: string; texte: string } | null>(null)
  const [suppression, setSuppression] = useState('')

  async function ajouter() {
    const refus = refusNoteDatee(texte, le, aujourdhui)
    if (refus) return setRetour({ tone: 'warn', text: refus })
    setEnvoi(true)
    setRetour(null)
    const r = await gestes.ajouterNote(patientId, le, texte)
    setEnvoi(false)
    if (!r.ok) return setRetour({ tone: 'warn', text: r.message })
    setTexte('')
    setLe(aujourdhui)
    await onChange()
  }

  async function modifier() {
    if (!edition) return
    const refus = refusNoteDatee(edition.texte, edition.le, aujourdhui)
    if (refus) return setRetour({ tone: 'warn', text: refus })
    setEnvoi(true)
    setRetour(null)
    const r = await gestes.modifierNote(edition.id, edition.le, edition.texte)
    setEnvoi(false)
    if (!r.ok) return setRetour({ tone: 'warn', text: r.message })
    setEdition(null)
    await onChange()
  }

  async function supprimer(noteId: string) {
    setEnvoi(true)
    setRetour(null)
    const r = await gestes.supprimerNote(noteId)
    setEnvoi(false)
    setSuppression('')
    if (!r.ok) return setRetour({ tone: 'warn', text: r.message })
    await onChange()
  }

  // Une note corrigée ailleurs, ou retirée : on ne garde pas l'édition d'une note disparue.
  useEffect(() => {
    if (edition && !notes.some((n) => n.id === edition.id)) setEdition(null)
  }, [notes, edition])

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div>
          <Title large as="h2">
            Notes de suivi
          </Title>
          <Sub>Un appel, un courriel, une information reçue entre deux séances : datée du jour où elle compte.</Sub>
        </div>
      </div>

      <form
        className={s.ajout}
        onSubmit={(e) => {
          e.preventDefault()
          void ajouter()
        }}
      >
        <label className={s.champ} htmlFor={`${id}-texte`}>
          <span className={s.label}>Nouvelle note</span>
          <TextArea
            id={`${id}-texte`}
            rows={3}
            maxLength={LIMITE_NOTE_DATEE}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Appel du 3 : la séance de jeudi est déplacée, le sommeil s’améliore."
            disabled={envoi}
            dictee
          />
        </label>
        <div className={s.ajoutLigne}>
          <label className={s.champDate} htmlFor={`${id}-le`}>
            <span className={s.label}>Datée du</span>
            <TextInput
              id={`${id}-le`}
              type="date"
              value={le}
              max={aujourdhui}
              onChange={(e) => setLe(e.target.value)}
              disabled={envoi}
            />
          </label>
          <Button variant="primary" type="submit" disabled={envoi || !texte.trim()}>
            {envoi && !edition ? 'Ajout…' : 'Ajouter la note'}
          </Button>
        </div>
      </form>

      {retour ? <Notice tone={retour.tone}>{retour.text}</Notice> : null}

      {notes.length === 0 ? (
        <p className={s.discret}>Aucune note de suivi pour l’instant.</p>
      ) : (
        <ul className={s.notes}>
          {notes.map((n) => (
            <li key={n.id} className={s.note}>
              {edition?.id === n.id ? (
                <form
                  className={s.form}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void modifier()
                  }}
                >
                  <TextArea
                    rows={4}
                    maxLength={LIMITE_NOTE_DATEE}
                    value={edition.texte}
                    aria-label={`Texte de la note du ${dateDeNote(n.le)}`}
                    onChange={(e) => setEdition({ ...edition, texte: e.target.value })}
                    disabled={envoi}
                    dictee
                  />
                  <div className={s.ajoutLigne}>
                    <TextInput
                      type="date"
                      value={edition.le}
                      max={aujourdhui}
                      aria-label="Date de la note"
                      onChange={(e) => setEdition({ ...edition, le: e.target.value })}
                      disabled={envoi}
                    />
                    <Button variant="primary" type="submit" disabled={envoi}>
                      {envoi ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEdition(null)} disabled={envoi}>
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className={s.noteTete}>
                    <span className={s.noteDate}>
                      {dateDeNote(n.le)}
                      {n.auteur ? <span className={s.auteur}> · par {n.auteur}</span> : null}
                    </span>
                    {suppression === n.id ? (
                      <span className={s.gestes}>
                        <span className={s.discretEnLigne}>Supprimer cette note ?</span>
                        <Button variant="danger" onClick={() => void supprimer(n.id)} disabled={envoi}>
                          Supprimer
                        </Button>
                        <Button variant="ghost" onClick={() => setSuppression('')} disabled={envoi}>
                          La garder
                        </Button>
                      </span>
                    ) : (
                      <span className={s.gestes}>
                        <Button
                          variant="ghost"
                          onClick={() => setEdition({ id: n.id, le: n.le, texte: n.texte })}
                          disabled={envoi || Boolean(edition)}
                        >
                          Modifier
                        </Button>
                        <Button variant="ghost" onClick={() => setSuppression(n.id)} disabled={envoi}>
                          Supprimer
                        </Button>
                      </span>
                    )}
                  </div>
                  <p className={s.noteTexte}>{n.texte}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
