import { useEffect, useId, useState } from 'react'
import { Button, Notice, TextArea, TextInput } from '@/components/ui'
import type { GestesDossier } from '@/cabinet/dossier'
import { jourDeParis } from '@/lib/assiduite'
import {
  MENTIONS_TVA,
  MENTION_PAR_DEFAUT,
  PRESTATION_PAR_DEFAUT,
  centimesDepuisSaisie,
  jourLisible,
  manquesIdentite,
  refusMontant,
  type IdentiteFacturation,
  type MentionTva,
  type NoteHonoraires,
  type SourceIdentite,
} from '@/lib/honoraires'
import { enumeration } from '@/lib/format'
import type { EtatEnvoiNotes } from '@/services/cabinet'
import s from './NoteHonoraires.module.css'

/** Le choix de mention, tel que le formulaire le tient. */
type ChoixMention = MentionTva | 'aucune'

const CHOIX_MENTION: Array<{ value: ChoixMention; label: string }> = [
  { value: 'art-293-b', label: MENTIONS_TVA['art-293-b'] },
  { value: 'art-261-4-1', label: MENTIONS_TVA['art-261-4-1'] },
  { value: 'aucune', label: 'Aucune mention' },
]

/**
 * Établir une note d'honoraires.
 *
 * DEPUIS UNE SÉANCE ENVOYÉE, la date est la sienne et ne se choisit pas : la
 * note dit quand la séance a eu lieu. SANS SÉANCE — toutes ne sont pas
 * captées —, la date se choisit, jamais dans le futur.
 *
 * L'IDENTITÉ SE CONFIRME UNE FOIS. Pré-remplie depuis les mentions légales
 * du site vitrine quand elles existent, elle s'affiche dépliée tant qu'elle
 * n'a pas été enregistrée : une note ne part pas au nom de quelqu'un qui ne
 * l'a pas relu. Ensuite, elle tient en une ligne, et se corrige d'un clic.
 *
 * ÉMETTRE EST DÉFINITIF, et le bouton le dit avant : la base attribue le
 * numéro suivant du registre, la note ne se modifie plus, elle s'annule.
 *
 * L'ENVOYER AU PATIENT SE COCHE. Cochée, la case fait partir la note par
 * courriel à l'adresse de la fiche, en plus du téléchargement ; décochée —
 * c'est le défaut —, rien ne part. Sans adresse sur la fiche, ou sans moyen
 * d'envoi, la case se grise et dit pourquoi.
 */
export function NoteHonorairesForm({
  gestes,
  patientId,
  beneficiaire,
  email,
  envoiNotes,
  sessionId,
  dateSeance,
  onEmise,
  onFermer,
}: {
  gestes: GestesDossier
  patientId: string
  beneficiaire: string
  /** L'adresse de la fiche : celle où la note partirait. Vide si aucune. */
  email: string
  /** Le cabinet peut-il envoyer par courriel ? `null` tant que ce n'est pas lu. */
  envoiNotes: EtatEnvoiNotes | null
  sessionId: string | null
  /** « AAAA-MM-JJ » : la date de la séance facturée, s'il y en a une. */
  dateSeance: string | null
  onEmise: (note: NoteHonoraires, partager: boolean) => void
  onFermer: () => void
}) {
  const id = useId()
  const [lecture, setLecture] = useState<'chargement' | 'pret' | 'echec'>('chargement')
  const [source, setSource] = useState<SourceIdentite>('a-saisir')
  const [identite, setIdentite] = useState<IdentiteFacturation>({
    praticien: '',
    adresse: '',
    numeroPro: '',
    mentionTva: MENTION_PAR_DEFAUT,
  })
  const [editionIdentite, setEditionIdentite] = useState(false)
  const [date, setDate] = useState(dateSeance ?? jourDeParis())
  const [prestation, setPrestation] = useState(PRESTATION_PAR_DEFAUT)
  const [montant, setMontant] = useState('')
  const [mention, setMention] = useState<ChoixMention>(MENTION_PAR_DEFAUT)
  const [envoi, setEnvoi] = useState(false)
  const [partager, setPartager] = useState(false)
  const [refus, setRefus] = useState('')

  const adresse = email.trim()
  /* Pourquoi la case ne se coche pas, s'il y a une raison : dit sous elle
     plutôt que de la cacher — la praticienne sait alors quoi faire. */
  const empechement = !adresse
    ? `La fiche de ${beneficiaire} n’a pas d’adresse de courriel : ajoutez-la dans ses réglages pour pouvoir lui envoyer ses notes.`
    : envoiNotes === null
      ? 'Vérification de l’envoi par courriel…'
      : !envoiNotes.possible
        ? 'L’envoi par courriel n’est pas encore en service : la note se télécharge, remettez-la vous-même.'
        : ''
  const partage = partager && !empechement

  useEffect(() => {
    let actif = true
    void gestes.lireIdentite().then((lue) => {
      if (!actif) return
      if (!lue) {
        setLecture('echec')
        return
      }
      setIdentite(lue.identite)
      setSource(lue.source)
      setMention(lue.identite.mentionTva ?? 'aucune')
      setEditionIdentite(lue.source !== 'enregistree')
      setLecture('pret')
    })
    return () => {
      actif = false
    }
  }, [gestes])

  const aujourdhui = jourDeParis()

  async function emettre() {
    if (envoi) return
    setRefus('')
    const cents = centimesDepuisSaisie(montant)
    const refusDuMontant = refusMontant(cents)
    if (refusDuMontant) return setRefus(refusDuMontant)
    if (!prestation.trim()) return setRefus('Décrivez la prestation.')
    if (!sessionId && (!date || date > aujourdhui)) {
      return setRefus('Choisissez la date de la séance : aujourd’hui au plus tard.')
    }
    const manque = manquesIdentite(identite)
    if (manque.length) {
      setEditionIdentite(true)
      return setRefus(`Il manque ${enumeration(manque)} pour établir la note.`)
    }

    setEnvoi(true)
    /* L'identité d'abord : si elle ne s'enregistre pas, aucune note ne part
       avec une identité que la base ne connaît pas. */
    if (editionIdentite || source !== 'enregistree') {
      const r = await gestes.enregistrerIdentite({ ...identite, mentionTva: mention === 'aucune' ? null : mention })
      if (!r.ok) {
        setEnvoi(false)
        return setRefus(r.message)
      }
      setSource('enregistree')
      setEditionIdentite(false)
    }
    const r = await gestes.emettreNote({
      patientId,
      sessionId,
      date: sessionId ? null : date,
      prestation,
      montantCents: cents as number,
      mentionTva: mention === 'aucune' ? null : mention,
    })
    setEnvoi(false)
    if (!r.ok || !r.note) return setRefus(r.message)
    onEmise(r.note, partage)
  }

  if (lecture === 'chargement') {
    return (
      <div className={s.panneau} role="status">
        <p className={s.discret}>Lecture de vos coordonnées de facturation…</p>
      </div>
    )
  }

  if (lecture === 'echec') {
    return (
      <div className={s.panneau}>
        <Notice tone="warn">
          Vos coordonnées de facturation n’ont pas pu être lues : la note ne peut pas s’établir sans
          elles. Réessayez dans un instant.
        </Notice>
        <div className={s.actions}>
          <Button variant="ghost" onClick={onFermer}>
            Fermer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className={s.panneau}
      aria-labelledby={`${id}-titre`}
      onSubmit={(e) => {
        e.preventDefault()
        void emettre()
      }}
    >
      <h3 id={`${id}-titre`} className={s.titre}>
        Note d’honoraires pour {beneficiaire}
      </h3>

      {/* L'identité : dépliée tant qu'elle n'est pas confirmée. */}
      {editionIdentite ? (
        <fieldset className={s.identite} disabled={envoi}>
          <legend className={s.legende}>Vos coordonnées, imprimées sur chaque note</legend>
          <p className={s.discret}>
            {source === 'vitrine'
              ? 'Reprises des mentions légales de votre site : vérifiez-les. Elles seront enregistrées avec cette note et resserviront aux suivantes.'
              : 'À saisir une fois : elles resserviront à chaque note.'}
          </p>
          <label className={s.champ}>
            <span className={s.label}>Nom de la praticienne ou du praticien</span>
            <TextInput
              value={identite.praticien}
              maxLength={120}
              autoComplete="name"
              onChange={(e) => setIdentite((i) => ({ ...i, praticien: e.target.value }))}
            />
          </label>
          <label className={s.champ}>
            <span className={s.label}>Adresse du cabinet</span>
            <TextArea
              rows={2}
              maxLength={300}
              value={identite.adresse}
              autoComplete="street-address"
              onChange={(e) => setIdentite((i) => ({ ...i, adresse: e.target.value }))}
            />
          </label>
          <label className={s.champ}>
            <span className={s.label}>Numéro professionnel</span>
            <TextInput
              value={identite.numeroPro}
              maxLength={60}
              placeholder="SIRET 123 456 789 00012, ou ADELI / RPPS"
              onChange={(e) => setIdentite((i) => ({ ...i, numeroPro: e.target.value }))}
            />
            <span className={s.aide}>Écrivez-le avec sa nature : « SIRET … », « ADELI … » ou « RPPS … ».</span>
          </label>
        </fieldset>
      ) : (
        <p className={s.resume}>
          Au nom de <strong>{identite.praticien}</strong>, {identite.adresse.replace(/\n+/g, ', ')} ·{' '}
          {identite.numeroPro}{' '}
          <button type="button" className={s.lien} onClick={() => setEditionIdentite(true)}>
            Modifier
          </button>
        </p>
      )}

      <div className={s.rangee}>
        <label className={s.champ}>
          <span className={s.label}>Date de la séance</span>
          {sessionId ? (
            <span className={s.fixe}>{jourLisible(date)}</span>
          ) : (
            <TextInput type="date" value={date} max={aujourdhui} onChange={(e) => setDate(e.target.value)} disabled={envoi} />
          )}
        </label>
        <label className={s.champ}>
          <span className={s.label}>Montant réglé (€)</span>
          <TextInput
            inputMode="decimal"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="60"
            disabled={envoi}
            required
          />
        </label>
      </div>

      <label className={s.champ}>
        <span className={s.label}>Prestation</span>
        <TextInput
          dictee
          value={prestation}
          maxLength={200}
          onChange={(e) => setPrestation(e.target.value)}
          disabled={envoi}
        />
      </label>

      <fieldset className={s.mentions} disabled={envoi}>
        <legend className={s.label}>Mention de TVA</legend>
        {CHOIX_MENTION.map((c) => (
          <label key={c.value} className={s.option}>
            <input
              type="radio"
              name={`${id}-mention`}
              value={c.value}
              checked={mention === c.value}
              onChange={() => setMention(c.value)}
            />
            <span>{c.label}</span>
          </label>
        ))}
        <span className={s.aide}>
          261-4-1° : professions de santé réglementées. 293 B : franchise en base de TVA. Choisissez
          celle qui vous concerne ; en cas de doute, votre comptable tranchera.
        </span>
      </fieldset>

      <div className={s.partage}>
        <label className={empechement ? `${s.option} ${s.optionEteinte}` : s.option}>
          <input
            type="checkbox"
            checked={partage}
            disabled={envoi || Boolean(empechement)}
            onChange={(e) => setPartager(e.target.checked)}
          />
          <span>
            Partager avec {beneficiaire} : envoyer la note par courriel
            {adresse ? (
              <>
                {' '}
                à <strong>{adresse}</strong>
              </>
            ) : null}
          </span>
        </label>
        <p className={s.aide}>
          {empechement ||
            (envoiNotes?.depuis === 'cabinet'
              ? 'Elle part de l’adresse d’envoi de votre cabinet, en PDF joint. Son PDF se télécharge aussi.'
              : 'Elle part au nom de votre cabinet, en PDF joint ; une réponse vous arrive à votre adresse de connexion. Son PDF se télécharge aussi.')}
        </p>
      </div>

      {refus ? <Notice tone="warn">{refus}</Notice> : null}

      <p className={s.discret}>
        La note reçoit le numéro suivant de votre registre et ne se modifie plus. En cas d’erreur,
        annulez-la : elle garde son numéro, et vous en établissez une autre.
      </p>

      <div className={s.actions}>
        <Button variant="primary" type="submit" disabled={envoi}>
          {envoi ? 'Émission…' : partage ? 'Émettre, envoyer et télécharger' : 'Émettre et télécharger'}
        </Button>
        <Button variant="ghost" onClick={onFermer} disabled={envoi}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
