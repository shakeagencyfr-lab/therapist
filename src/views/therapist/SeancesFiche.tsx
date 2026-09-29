import { useState, type ReactNode } from 'react'
import { Button, Card, EmptyState, Notice, Pill, Sub, Title, type PillTone } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useDossierFiche } from '@/cabinet/useDossierFiche'
import {
  LIBELLE_ETAT,
  dateDeSeance,
  dureeDeSeance,
  seanceARelire,
  type EtatSeance,
  type SeanceDuDossier,
} from '@/lib/dossier'
import { jourDeParis } from '@/lib/assiduite'
import { plural } from '@/lib/format'
import {
  jourLisible,
  montantLisible,
  noteDeLaSeance,
  numeroDeNote,
  type NoteHonoraires,
} from '@/lib/honoraires'
import { telechargerNoteHonoraires } from '@/lib/honorairesPdf'
import { logoPourPdf } from '@/lib/logoPdf'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import { NoteHonorairesForm } from './NoteHonorairesForm'
import s from './SeancesFiche.module.css'

const TON_ETAT: Record<EtatSeance, PillTone> = {
  envoyee: 'ok',
  brouillon: 'warn',
  retiree: 'neutral',
  ouverte: 'neutral',
  rangee: 'neutral',
}

/** Une note d'honoraires en cours d'établissement : pour une séance, ou sans. */
type Facturation = { sessionId: string | null; dateSeance: string | null }

/**
 * Le volet « Séances » de la fiche : relire la séance précédente avant de
 * recevoir quelqu'un.
 *
 * La dernière séance qui porte quelque chose est ouverte d'office — c'est
 * elle qu'on vient relire. Les autres se déplient. La transcription n'y est
 * jamais : elle ne se lit pas (src/lib/dossier.ts) et n'existe plus après
 * l'envoi. Ce qui reste, c'est ce que la praticienne a relu et gardé.
 *
 * Les contre-indications notées à l'anamnèse s'affichent en tête : c'est le
 * moment où elles comptent.
 */
export function SeancesFiche() {
  const state = useAppState()
  const fiche = patientOf(state)
  const { etat, dossier, gestes, recharger } = useDossierFiche(state.sel)
  const logoUrl = useMaybeAuth()?.context?.cabinet?.branding?.logoUrl ?? null
  const [ouverte, setOuverte] = useState<string | null | undefined>(undefined)
  const [facturation, setFacturation] = useState<Facturation | null>(null)
  const [annulation, setAnnulation] = useState('')
  const [pdf, setPdf] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  if (!fiche) return null
  const prenom = fiche.name.split(' ')[0] ?? fiche.name

  async function telecharger(note: NoteHonoraires) {
    if (pdf) return
    setPdf(note.id)
    try {
      // Le logo du cabinet en tête, s'il en a un ; sans lui, la note part quand même.
      await telechargerNoteHonoraires(note, await logoPourPdf(logoUrl))
    } catch {
      setNotice({ tone: 'warn', text: 'Le PDF n’a pas pu être fabriqué. La note est bien émise : réessayez de la télécharger.' })
    }
    setPdf('')
  }

  async function emise(note: NoteHonoraires) {
    setFacturation(null)
    setNotice({
      tone: 'ok',
      text: `Note n° ${numeroDeNote(note.numero)} émise pour ${montantLisible(note.montantCents)}. Son PDF se télécharge.`,
    })
    await telecharger(note)
    await recharger()
  }

  async function annuler(note: NoteHonoraires) {
    if (!gestes) return
    setAnnulation('')
    const r = await gestes.annulerNote(note.id)
    setNotice(
      r.ok
        ? { tone: 'ok', text: `Note n° ${numeroDeNote(note.numero)} annulée. Son numéro reste pris ; vous pouvez en établir une autre.` }
        : { tone: 'warn', text: r.message },
    )
    await recharger()
  }

  const seances = dossier?.seances ?? null
  const honoraires = dossier?.honoraires ?? null
  const aRelire = seances ? seanceARelire(seances) : null
  // Tant que la praticienne n'a rien replié, la séance à relire est ouverte.
  const ouverteEffective = ouverte === undefined ? aRelire : ouverte
  const contreIndications = dossier?.anamnese?.contreIndications.trim() ?? ''

  const formulaire = (f: Facturation) =>
    gestes ? (
      <NoteHonorairesForm
        gestes={gestes}
        patientId={state.sel}
        beneficiaire={fiche.name}
        sessionId={f.sessionId}
        dateSeance={f.dateSeance}
        onEmise={(note) => void emise(note)}
        onFermer={() => setFacturation(null)}
      />
    ) : null

  /** Ce qui se fait de la note d'une séance envoyée. */
  const honorairesDeLaSeance = (seance: SeanceDuDossier): ReactNode => {
    if (seance.etat !== 'envoyee' || !gestes) return null
    if (honoraires === null) {
      return <p className={s.discret}>Les notes d’honoraires n’ont pas pu être lues.</p>
    }
    const note = noteDeLaSeance(honoraires, seance.id)
    if (facturation?.sessionId === seance.id) return formulaire(facturation)
    if (!note) {
      return (
        <div className={s.honoraires}>
          <Button
            variant="secondary"
            onClick={() => setFacturation({ sessionId: seance.id, dateSeance: jourDeParis(seance.le) })}
            disabled={Boolean(facturation)}
          >
            Établir la note d’honoraires
          </Button>
        </div>
      )
    }
    return (
      <LigneNote
        note={note}
        pdf={pdf === note.id}
        confirmer={annulation === note.id}
        onTelecharger={() => void telecharger(note)}
        onAnnuler={() => setAnnulation(note.id)}
        onConfirmer={() => void annuler(note)}
        onGarder={() => setAnnulation('')}
      />
    )
  }

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div>
          <Title large as="h2">
            Séances de {prenom}
          </Title>
          <Sub>
            De la plus récente à la plus ancienne. La transcription n’y figure pas — elle s’efface
            à l’envoi : ce qui reste, c’est ce que vous avez relu et gardé.
          </Sub>
        </div>
        {etat === 'pret' && gestes && honoraires !== null ? (
          <Button
            variant="ghost"
            onClick={() => setFacturation({ sessionId: null, dateSeance: null })}
            disabled={Boolean(facturation)}
          >
            Note d’honoraires sans séance captée
          </Button>
        ) : null}
      </div>

      {notice ? (
        <div className={s.notice} role="status">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}

      {contreIndications ? (
        <div className={s.alerte}>
          <Notice tone="hot">
            <strong>Contre-indications notées :</strong> {contreIndications}
          </Notice>
        </div>
      ) : null}

      {facturation && facturation.sessionId === null ? formulaire(facturation) : null}

      {etat === 'demo' ? (
        <EmptyState>
          L’historique des séances se lit sur le dossier réel de votre cabinet : la fiche de
          démonstration n’en a pas.
        </EmptyState>
      ) : etat === 'chargement' ? (
        <p className={s.discret} role="status">
          Lecture des séances…
        </p>
      ) : etat === 'echec' || seances === null ? (
        <div className={s.echec}>
          <Notice tone="warn">
            Les séances n’ont pas pu être lues. Ce n’est pas un dossier vide : réessayez dans un
            instant.
          </Notice>
          <Button variant="secondary" onClick={() => void recharger()}>
            Relire
          </Button>
        </div>
      ) : (
        <>
          <ListeDesSeances
            seances={seances}
            ouverte={ouverteEffective}
            onBasculer={(id) => setOuverte(ouverteEffective === id ? null : id)}
            apres={honorairesDeLaSeance}
          />
          {dossier && dossier.sansRien > 0 ? (
            <p className={s.discret}>
              {plural(dossier.sansRien, 'séance ouverte', 'séances ouvertes')} sans rien d’enregistré{' '}
              {dossier.sansRien > 1 ? 'ne sont pas listées' : 'n’est pas listée'} : le consentement
              avait été signé, puis rien n’a été pris.
            </p>
          ) : null}
        </>
      )}

      {etat === 'pret' && honoraires && honoraires.length ? (
        <RegistreDeLaFiche
          notes={honoraires}
          pdf={pdf}
          onTelecharger={(n) => void telecharger(n)}
        />
      ) : null}
    </Card>
  )
}

/**
 * La liste des séances, sans lecture ni geste : ce que le banc de rendu
 * éprouve. `apres` ajoute, sous une séance ouverte, ce que l'écran en fait.
 */
export function ListeDesSeances({
  seances,
  ouverte,
  onBasculer,
  apres,
}: {
  seances: SeanceDuDossier[]
  ouverte: string | null
  onBasculer: (id: string) => void
  apres?: (s: SeanceDuDossier) => ReactNode
}) {
  if (!seances.length) {
    return (
      <EmptyState>
        Aucune séance au dossier pour l’instant. Une séance y entre dès que vous la captez depuis
        l’onglet Séance, et se relit ici une fois rédigée.
      </EmptyState>
    )
  }
  return (
    <ul className={s.liste}>
      {seances.map((seance) => {
        const ouvert = ouverte === seance.id
        const corps = `seance-${seance.id}`
        const duree = dureeDeSeance(seance.dureeSecondes)
        return (
          <li key={seance.id} className={s.item}>
            <button
              type="button"
              className={s.entete}
              aria-expanded={ouvert}
              aria-controls={corps}
              onClick={() => onBasculer(seance.id)}
            >
              <span className={s.date}>{dateDeSeance(seance.le)}</span>
              <span className={s.meta}>
                {duree ? <span>{duree}</span> : null}
                <Pill tone={TON_ETAT[seance.etat]}>{LIBELLE_ETAT[seance.etat]}</Pill>
              </span>
              <span className={s.bascule} aria-hidden>
                {ouvert ? 'Replier' : 'Relire'}
              </span>
            </button>
            {ouvert ? (
              <div className={s.corps} id={corps}>
                <ContenuDeSeance seance={seance} />
                {apres ? apres(seance) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Ce qu'une séance garde : la note relue, jamais le verbatim. */
function ContenuDeSeance({ seance }: { seance: SeanceDuDossier }) {
  if (seance.etat === 'retiree') {
    return (
      <p className={s.texte}>
        Consentement retiré{seance.retireeLe ? ` le ${jourLisible(seance.retireeLe)}` : ''} : tout ce
        qui avait été pris pendant cette séance a été effacé. Elle reste datée au dossier, sans
        contenu.
      </p>
    )
  }
  const b = seance.brouillon
  return (
    <>
      {seance.etat !== 'envoyee' ? (
        <p className={s.discret}>
          Cette séance n’a pas été envoyée : reprenez-la depuis l’onglet Séance pour la verser au
          dossier.
        </p>
      ) : null}
      {b?.synthese ? (
        <section className={s.bloc}>
          <h3 className={s.blocTitre}>Synthèse</h3>
          <p className={s.texte}>{b.synthese}</p>
        </section>
      ) : seance.etat === 'envoyee' ? (
        <p className={s.discret}>Aucune synthèse rédigée pour cette séance.</p>
      ) : null}
      {seance.notes ? (
        <section className={s.bloc}>
          <h3 className={s.blocTitre}>Vos notes de séance</h3>
          <p className={s.texte}>{seance.notes}</p>
        </section>
      ) : null}
      {b?.mots.length ? (
        <section className={s.bloc}>
          <h3 className={s.blocTitre}>Les mots de la séance</h3>
          <ul className={s.mots}>
            {b.mots.map((m, i) => (
              <li key={`${i}-${m}`} className={s.mot}>
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {b?.questions.length ? (
        <section className={s.bloc}>
          <h3 className={s.blocTitre}>Questions à reprendre</h3>
          <ul className={s.puces}>
            {b.questions.map((q, i) => (
              <li key={`${i}-${q}`}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {b?.vigilance.length ? (
        <section className={s.bloc}>
          <h3 className={s.blocTitre}>Points de vigilance</h3>
          <ul className={s.puces}>
            {b.vigilance.map((v, i) => (
              <li key={`${i}-${v.point}`}>
                <strong className={s.point}>{v.point}</strong>
                {v.conduite ? ` — ${v.conduite}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** La note d'une séance : la relire, ou l'annuler en le confirmant. */
function LigneNote({
  note,
  pdf,
  confirmer,
  onTelecharger,
  onAnnuler,
  onConfirmer,
  onGarder,
}: {
  note: NoteHonoraires
  pdf: boolean
  confirmer: boolean
  onTelecharger: () => void
  onAnnuler: () => void
  onConfirmer: () => void
  onGarder: () => void
}) {
  return (
    <div className={s.honoraires}>
      <span className={s.noteResume}>
        Note d’honoraires n° {numeroDeNote(note.numero)} · {montantLisible(note.montantCents)} · émise le{' '}
        {jourLisible(note.emiseLe)}
      </span>
      {confirmer ? (
        <span className={s.gestes}>
          <span className={s.discret}>Annuler la note ? Elle reste numérotée, marquée annulée.</span>
          <Button variant="danger" onClick={onConfirmer}>
            Annuler la note
          </Button>
          <Button variant="ghost" onClick={onGarder}>
            La garder
          </Button>
        </span>
      ) : (
        <span className={s.gestes}>
          <Button variant="secondary" onClick={onTelecharger} disabled={pdf}>
            {pdf ? 'Préparation…' : 'Télécharger'}
          </Button>
          <Button variant="ghost" onClick={onAnnuler}>
            Annuler…
          </Button>
        </span>
      )}
    </div>
  )
}

/**
 * Toutes les notes de la fiche, annulées comprises : celles d'une séance non
 * captée n'ont pas d'autre endroit où se retrouver.
 */
function RegistreDeLaFiche({
  notes,
  pdf,
  onTelecharger,
}: {
  notes: NoteHonoraires[]
  pdf: string
  onTelecharger: (n: NoteHonoraires) => void
}) {
  return (
    <section className={s.registre} aria-labelledby="registre-fiche">
      <h3 id="registre-fiche" className={s.blocTitre}>
        Notes d’honoraires de cette fiche
      </h3>
      <ul className={s.registreListe}>
        {notes.map((n) => (
          <li key={n.id} className={s.registreLigne}>
            <span className={s.registreTexte}>
              <strong>n° {numeroDeNote(n.numero)}</strong> · {jourLisible(n.datePrestation)} · {n.prestation} ·{' '}
              {montantLisible(n.montantCents)}
            </span>
            {n.annuleeLe ? <Pill tone="warn">Annulée</Pill> : null}
            <Button variant="ghost" onClick={() => onTelecharger(n)} disabled={pdf === n.id}>
              {pdf === n.id ? 'Préparation…' : 'PDF'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
