import { useEffect, useState } from 'react'
import { Button, Card, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import type { SeanceOuverte } from '@/cabinet/useCabinet'
import { consentPoints } from '@/data/session'
import { DELAI_PURGE_JOURS, ceQuiAEtePris } from '@/lib/seance'
import { etatDeReprise } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './ConsentStep.module.css'

/**
 * Étape 2 : le consentement est bloquant, rien ne s'enregistre avant lui.
 *
 * OU PAS D'ENREGISTREMENT DU TOUT. Tous les patients n'acceptent pas le
 * micro, toutes les séances ne s'y prêtent pas. La séance s'ouvre alors sans
 * consentement à la captation — il n'y a rien à capter : le micro reste
 * fermé, la praticienne écrit ses notes, et le brouillon se rédige à partir
 * d'elles. La base le sait (la date de consentement reste vide) et
 * refuserait une transcription.
 */
export function ConsentStep() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const patient = state.patients[state.sessionPatient]
  const [envoi, setEnvoi] = useState<'' | 'consentement' | 'sans'>('')
  const [echec, setEchec] = useState('')
  /** Une séance de cette fiche, ouverte et jamais envoyée, à reprendre. */
  const [ouverte, setOuverte] = useState<SeanceOuverte | null>(null)
  const [effacement, setEffacement] = useState<'repos' | 'en-cours'>('repos')
  const [avis, setAvis] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)

  /* LA REPRISE. La captation s'enregistre dans la séance au fil de l'eau ;
     encore faut-il la retrouver. Une page rechargée, un onglet fermé en
     pleine séance, et l'écran proposait de signer un nouveau consentement
     comme si rien n'avait eu lieu — la séance restait en base, orpheline,
     jusqu'à la purge. On la propose ici, avant la signature. */
  const reel = Boolean(cabinet?.reel)
  const chercher = cabinet?.seanceOuverte
  const patientId = state.sessionPatient
  useEffect(() => {
    if (!reel || !chercher || !patientId) return
    let vivant = true
    void chercher(patientId).then((o) => {
      if (vivant) setOuverte(o)
    })
    return () => {
      vivant = false
    }
    // La fonction change d'identité à chaque rendu du dossier : seule la
    // fiche décide d'une nouvelle recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel, patientId])

  // Le consentement se donne par quelqu'un : sans fiche, il n'y a rien à signer.
  if (!patient) return null

  const prenom = patient.name.split(' ')[0]

  /**
   * Signer ouvre la séance en base, horodatée : c'est la pièce qui autorise
   * la captation, et elle doit survivre à la page. Sur les fiches de
   * démonstration, rien n'est écrit.
   */
  async function signer(sansEnregistrement = false) {
    /* Sans enregistrement, pas de micro : le mode de captation le dit, et
       l'étape suivante n'ouvre que les notes. Avec, on repart du micro si le
       mode précédent était celui des notes seules. */
    const capture = sansEnregistrement ? 'notes' : state.capture === 'notes' ? 'live' : state.capture
    if (!cabinet?.reel) {
      set({ consent: true, sansEnregistrement, capture })
      return
    }
    setEnvoi(sansEnregistrement ? 'sans' : 'consentement')
    setEchec('')
    const r = await cabinet.ouvrirSeance(state.sessionPatient, { sansEnregistrement })
    setEnvoi('')
    if (!r.ok) {
      setEchec(r.message)
      return
    }
    set({ consent: true, sansEnregistrement, capture, sessionId: r.id ?? null })
  }

  /** Reprendre là où la séance s'est arrêtée : son consentement tient toujours. */
  function reprendre(o: SeanceOuverte) {
    set({ ...etatDeReprise(o, state.sessionPatient), draftMaquette: false })
  }

  /** Effacer ce qui a été pris : c'est un retrait de consentement. */
  async function effacer(o: SeanceOuverte) {
    if (!cabinet) return
    setEffacement('en-cours')
    const r = await cabinet.retirerConsentement(o.id)
    setEffacement('repos')
    if (!r.ok) {
      setAvis({ ton: 'warn', texte: r.message })
      return
    }
    setOuverte(null)
    setAvis({
      ton: 'ok',
      texte:
        'Séance effacée : sa transcription, ses notes et son brouillon ne sont plus dans le dossier. Il reste la date du consentement et celle de son retrait.',
    })
  }

  const le = ouverte
    ? new Date(ouverte.ouverteLe).toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <>
      {ouverte ? (
        <Card className={s.reprise}>
          <Title as="h2">Une séance de {prenom} n'a pas été envoyée</Title>
          <p className={s.repriseTexte}>
            {ouverte.sansEnregistrement ? `Ouverte sans enregistrement le ${le}` : `Consentement signé le ${le}`}.
            Elle contient{' '}
            {ceQuiAEtePris({
              transcript: ouverte.transcript,
              notes: ouverte.notes,
              aUnBrouillon: Boolean(ouverte.draft),
            })}
            . Reprenez-la là où elle s'est arrêtée, ou effacez-la si {prenom} le demande.
            {ouverte.sansEnregistrement
              ? ''
              : ` Sans suite, sa transcription est effacée d'office ${DELAI_PURGE_JOURS} jours après la signature.`}
          </p>
          <div className={s.repriseActions}>
            <Button variant="primary" onClick={() => reprendre(ouverte)} disabled={effacement === 'en-cours'}>
              Reprendre cette séance
            </Button>
            <Button variant="danger" onClick={() => void effacer(ouverte)} disabled={effacement === 'en-cours'}>
              {effacement === 'en-cours' ? 'Effacement…' : 'Effacer ce qui a été pris'}
            </Button>
          </div>
        </Card>
      ) : null}

      {avis ? (
        <div className={s.notice}>
          <Notice tone={avis.ton}>{avis.texte}</Notice>
        </div>
      ) : null}

      <Card padded={false} className={s.card}>
        <div className={s.heading}>
          <Title large as="h2">
            {ouverte ? 'Ou une nouvelle séance' : 'Consentement du patient'}
          </Title>
        </div>
        <div className={s.points}>
          {consentPoints(prenom).map((point) => (
            <div className={s.point} key={point}>
              <span className={s.dot} aria-hidden />
              <span className={s.text}>{point}</span>
            </div>
          ))}
        </div>
        {echec ? (
          <div className={s.notice}>
            <Notice tone="warn">{echec}</Notice>
          </div>
        ) : null}
        <div className={s.foot}>
          <Button variant="primary" className={s.sign} onClick={() => void signer()} disabled={Boolean(envoi)}>
            {envoi === 'consentement' ? 'Enregistrement…' : `${prenom} a donné son accord, signer`}
          </Button>
          {/* « depuis l'espace patient » : cet écran n'existe pas, et n'a jamais
              existé. La révocation se demande de vive voix, et le geste qui
              l'exécute est en haut de la séance. */}
          <span className={s.hint}>
            Révocable à tout moment : il suffit de le dire. « Retirer le consentement », en haut de
            la séance, arrête l'enregistrement et efface ce qui a été pris.
          </span>
        </div>
      </Card>

      {/* Sans micro : une vraie porte, pas un lien discret. C'est souvent le
          choix du patient, et il ne doit pas avoir à se justifier. */}
      <Card className={s.sans}>
        <div className={s.sansTexte}>
          <Title as="h3">Séance sans enregistrement</Title>
          <p className={s.sansCorps}>
            Aucun micro, aucune transcription : vous écrivez vos notes pendant ou après la séance,
            et le brouillon de note se rédige à partir d'elles. Si vous le demandez, vos notes
            partent pour analyse chez Anthropic, comme décrit plus haut — {prenom} doit le savoir.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void signer(true)} disabled={Boolean(envoi)}>
          {envoi === 'sans' ? 'Ouverture…' : 'Ouvrir sans enregistrement'}
        </Button>
      </Card>
    </>
  )
}
