import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, EmptyState, Notice, Pill, Sub, Title, type PillTone } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useDossierFiche } from '@/cabinet/useDossierFiche'
import { useReprendreBrouillon } from '@/cabinet/useReprendreBrouillon'
import {
  dateDeSeance,
  libelleDeSeance,
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
import { preparerNotePdf, type NotePdf } from '@/lib/honorairesPdf'
import { logoPourPdf } from '@/lib/logoPdf'
import { envoyerNoteHonoraires, lireEnvoiNotes, type EtatEnvoiNotes } from '@/services/cabinet'
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
  const reprendreBrouillon = useReprendreBrouillon()
  const [reprise, setReprise] = useState('')
  const [ouverte, setOuverte] = useState<string | null | undefined>(undefined)
  const [facturation, setFacturation] = useState<Facturation | null>(null)
  const [annulation, setAnnulation] = useState('')
  const [pdf, setPdf] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  /* L'envoi par courriel est-il possible ? Lu une fois, quand le dossier
     réel est là ; en cas d'échec de lecture, la case se dit indisponible. */
  const [envoiNotes, setEnvoiNotes] = useState<EtatEnvoiNotes | null>(null)
  useEffect(() => {
    if (etat !== 'pret' || !gestes) return
    let actif = true
    lireEnvoiNotes()
      .then((e) => actif && setEnvoiNotes(e))
      .catch(() => actif && setEnvoiNotes({ possible: false, depuis: null }))
    return () => {
      actif = false
    }
  }, [etat, gestes])

  if (!fiche) return null
  const prenom = fiche.name.split(' ')[0] ?? fiche.name
  const email = fiche.email?.trim() ?? ''

  /** La note en PDF, logo du cabinet en tête s'il en a un ; sans lui, elle se fabrique quand même. */
  async function fabriquer(note: NoteHonoraires): Promise<NotePdf | null> {
    try {
      return await preparerNotePdf(note, await logoPourPdf(logoUrl))
    } catch {
      return null
    }
  }

  /** Envoyer la note par courriel ; rend la phrase à dire, bonne ou mauvaise. */
  async function partager(fichier: NotePdf): Promise<{ ok: boolean; text: string }> {
    try {
      const r = await envoyerNoteHonoraires(fichier.noteId, fichier.base64())
      return { ok: true, text: `Elle est partie par courriel à ${r.destinataire}.` }
    } catch (e) {
      return { ok: false, text: `Le courriel n’est pas parti : ${(e as Error).message}` }
    }
  }

  async function telecharger(note: NoteHonoraires) {
    if (pdf) return
    setPdf(note.id)
    const fichier = await fabriquer(note)
    if (fichier) fichier.enregistrer()
    else setNotice({ tone: 'warn', text: 'Le PDF n’a pas pu être fabriqué. La note est bien émise : réessayez de la télécharger.' })
    setPdf('')
  }

  async function envoyer(note: NoteHonoraires) {
    if (pdf) return
    setPdf(note.id)
    const fichier = await fabriquer(note)
    const r = fichier ? await partager(fichier) : { ok: false, text: 'Le PDF n’a pas pu être fabriqué : réessayez.' }
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: `Note n° ${numeroDeNote(note.numero)} : ${r.text}` })
    setPdf('')
    if (r.ok) await recharger()
  }

  async function emise(note: NoteHonoraires, partage: boolean) {
    setFacturation(null)
    const debut = `Note n° ${numeroDeNote(note.numero)} émise pour ${montantLisible(note.montantCents)}.`
    setNotice({ tone: 'ok', text: `${debut} Son PDF se prépare…` })
    setPdf(note.id)
    const fichier = await fabriquer(note)
    if (!fichier) {
      setNotice({
        tone: 'warn',
        text: `${debut} Le PDF n’a pas pu être fabriqué${partage ? ', et rien n’est parti par courriel' : ''} : réessayez depuis sa ligne.`,
      })
    } else {
      fichier.enregistrer()
      if (partage) {
        const r = await partager(fichier)
        setNotice({
          tone: r.ok ? 'ok' : 'warn',
          text: r.ok
            ? `${debut} ${r.text} Son PDF se télécharge aussi.`
            : `${debut} Son PDF se télécharge. ${r.text} Vous pouvez la renvoyer depuis sa ligne.`,
        })
      } else {
        setNotice({ tone: 'ok', text: `${debut} Son PDF se télécharge.` })
      }
    }
    setPdf('')
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
        email={email}
        envoiNotes={envoiNotes}
        sessionId={f.sessionId}
        dateSeance={f.dateSeance}
        onEmise={(note, partage) => void emise(note, partage)}
        onFermer={() => setFacturation(null)}
      />
    ) : null

  /** Reprendre une séance jamais envoyée : l'écran de séance s'ouvre sur elle. */
  async function reprendre(seance: SeanceDuDossier) {
    setReprise(seance.id)
    const r = await reprendreBrouillon(seance.id)
    setReprise('')
    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
  }

  /** Ce qui se fait d'une séance : la reprendre si elle attend, la facturer si elle est envoyée. */
  const apresLaSeance = (seance: SeanceDuDossier): ReactNode => {
    if ((seance.etat === 'brouillon' || seance.etat === 'ouverte') && gestes) {
      return (
        <div className={s.honoraires}>
          <Button variant="primary" onClick={() => void reprendre(seance)} disabled={Boolean(reprise)}>
            {reprise === seance.id
              ? 'Ouverture…'
              : seance.etat === 'brouillon'
                ? 'Reprendre ce brouillon'
                : 'Reprendre cette séance'}
          </Button>
        </div>
      )
    }
    return honorairesDeLaSeance(seance)
  }

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
        envoyable={Boolean(email && envoiNotes?.possible)}
        confirmer={annulation === note.id}
        onTelecharger={() => void telecharger(note)}
        onEnvoyer={() => void envoyer(note)}
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
            apres={apresLaSeance}
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
          envoyable={Boolean(email && envoiNotes?.possible)}
          onTelecharger={(n) => void telecharger(n)}
          onEnvoyer={(n) => void envoyer(n)}
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
                {seance.sansEnregistrement && seance.etat !== 'retiree' ? (
                  <span>Sans enregistrement</span>
                ) : null}
                <Pill tone={TON_ETAT[seance.etat]}>{libelleDeSeance(seance)}</Pill>
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
        {seance.sansEnregistrement ? 'Séance abandonnée' : 'Consentement retiré'}
        {seance.retireeLe ? ` le ${jourLisible(seance.retireeLe)}` : ''} : tout ce qui avait été pris
        pendant cette séance a été effacé. Elle reste datée au dossier, sans contenu.
      </p>
    )
  }
  const b = seance.brouillon
  return (
    <>
      {seance.etat !== 'envoyee' ? (
        <p className={s.discret}>
          Cette séance n’a pas été envoyée : rien n’est dans le parcours du patient. Reprenez-la pour
          la relire et la valider.
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

/** « envoyée le 29 septembre 2026 à anna@exemple.fr » : ce que la ligne rappelle. */
function mentionEnvoi(note: NoteHonoraires): string {
  return note.envoi ? `envoyée le ${jourLisible(note.envoi.le)} à ${note.envoi.a}` : ''
}

/** La note d'une séance : la relire, l'envoyer, ou l'annuler en le confirmant. */
function LigneNote({
  note,
  pdf,
  envoyable,
  confirmer,
  onTelecharger,
  onEnvoyer,
  onAnnuler,
  onConfirmer,
  onGarder,
}: {
  note: NoteHonoraires
  pdf: boolean
  /** La fiche a une adresse, et le cabinet un moyen d'envoi. */
  envoyable: boolean
  confirmer: boolean
  onTelecharger: () => void
  onEnvoyer: () => void
  onAnnuler: () => void
  onConfirmer: () => void
  onGarder: () => void
}) {
  const envoi = mentionEnvoi(note)
  return (
    <div className={s.honoraires}>
      <span className={s.noteResume}>
        Note d’honoraires n° {numeroDeNote(note.numero)} · {montantLisible(note.montantCents)} · émise le{' '}
        {jourLisible(note.emiseLe)}
        {envoi ? ` · ${envoi}` : ''}
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
          {envoyable ? (
            <Button variant="ghost" onClick={onEnvoyer} disabled={pdf}>
              {note.envoi ? 'Renvoyer par courriel' : 'Envoyer par courriel'}
            </Button>
          ) : null}
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
  envoyable,
  onTelecharger,
  onEnvoyer,
}: {
  notes: NoteHonoraires[]
  pdf: string
  envoyable: boolean
  onTelecharger: (n: NoteHonoraires) => void
  onEnvoyer: (n: NoteHonoraires) => void
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
            {n.annuleeLe ? <Pill tone="warn">Annulée</Pill> : n.envoi ? <Pill tone="ok">Envoyée</Pill> : null}
            <Button variant="ghost" onClick={() => onTelecharger(n)} disabled={Boolean(pdf)}>
              {pdf === n.id ? 'Préparation…' : 'PDF'}
            </Button>
            {envoyable && !n.annuleeLe ? (
              <Button
                variant="ghost"
                onClick={() => onEnvoyer(n)}
                disabled={Boolean(pdf)}
                title={n.envoi ? mentionEnvoi(n) : undefined}
              >
                {n.envoi ? 'Renvoyer' : 'Envoyer'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
