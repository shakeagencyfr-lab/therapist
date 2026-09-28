import { useState } from 'react'
import { Avatar, Button, Card, Notice, Overline, TextArea, TextInput, Title } from '@/components/ui'
import { NOTIF_ADHERENCE_OPTIONS, NOTIF_TEMPLATES } from '@/data/notifications'
import { plural } from '@/lib/format'
import {
  RACCOURCIS,
  libelleDuMoment,
  momentDEnvoi,
  momentSaisi,
  valeurChamp,
} from '@/lib/planification'
import { NOTIF_SITUATIONS, notifRows } from '@/state/selectors'
import { useMaybeAuth } from '@/auth/session'
import { useMaybeCabinet } from '@/cabinet/context'
import { useStore } from '@/state/store'
import type { PushRecord } from '@/types/domain'
import { phraseTelephone } from '@/lib/rappels'
import s from './NotificationsView.module.css'

/** Heure d'envoi conservée dans le journal, au format `14:32`. */
function stampNow(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Notifications ciblées : les filtres composent le groupe à partir de ce que
 * l'application sait déjà, la liste nominative est visible avant l'envoi.
 */
export function NotificationsView() {
  const { state, set } = useStore()
  /** L'envoi en cours, et ce que le serveur en a dit. */
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null)
  /* LA DATE PRÉCISE EST UN CHOIX, PAS UNE VALEUR. Le champ n'existait que
     s'il contenait quelque chose : l'effacer le faisait disparaître, aucune
     pastille ne restait allumée, et l'envoi partait « maintenant ». Le choix
     est tenu à part ; au retour sur l'écran, un libellé qui n'est pas un
     raccourci veut dire qu'une date était en cours. */
  const [dateChoisie, setDateChoisie] = useState(
    () => Boolean(state.nQuand) || !(RACCOURCIS as readonly string[]).includes(state.nWhen),
  )

  /** Le mot programmé en cours de modification, celui dont on confirme l'annulation. */
  const [edition, setEdition] = useState<string | null>(null)
  const [annulation, setAnnulation] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [retourLog, setRetourLog] = useState<{ ok: boolean; message: string } | null>(null)

  const rows = notifRows(state)
  const recipients = rows.filter((row) => row.on)
  const quand = momentDEnvoi(state.nQuand, state.nWhen, dateChoisie)
  const canSend = recipients.length > 0 && state.nMsg.trim().length > 0 && quand.ok

  const cabinet = useMaybeCabinet()
  const cabinetReel = Boolean(cabinet?.reel)
  /* QUI RECEVRA LE MOT SUR SON TÉLÉPHONE. Sans rappels activés, il attend
     dans son espace jusqu'à sa prochaine ouverture — c'est un autre mot, et
     la thérapeute doit le savoir AVANT d'écrire « ce soir, 20 h ». */
  const aTelephone = (cle: string) => (state.appareils[cle] ?? 0) > 0
  const sansTelephone = cabinetReel ? recipients.filter((row) => !aTelephone(row.key)) : []

  /* L'aperçu porte le nom du cabinet connecté : il montrait « Cabinet Laetitia
     Ollivier » à tout le monde, c'est-à-dire le nom d'un autre cabinet sur
     l'écran d'une praticienne. */
  const auth = useMaybeAuth()
  const nomCabinet = auth?.context?.cabinet?.name ?? 'Votre cabinet'
  const previewTitle = state.nTitle.trim()
  /* Les fiches portent le libellé nu ; le catalogue peut être vide sur un
     cabinet qui n'a encore rien nommé. On retombe alors sur les programmes
     réellement portés par les fiches, pour ne pas afficher une liste morte. */
  const programmes = state.programmes.length
    ? state.programmes
    : [...new Set(Object.values(state.patients).map((p) => p.program.replace(/^Programme\s+/i, '')))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'fr'))
  const previewMsg = state.nMsg.trim()

  async function send() {
    if (!canSend) return
    // Relu à l'instant du clic : « Maintenant » est maintenant, pas au rendu.
    const choix = momentDEnvoi(state.nQuand, state.nWhen, dateChoisie)
    if (!choix.ok) return
    const moment = choix.moment
    const entry: PushRecord = {
      title: state.nTitle.trim() || 'Un mot du cabinet',
      message: previewMsg,
      when: state.nWhen,
      names: recipients.map((row) => row.name),
      stamp: stampNow(),
      attend: null,
    }
    // Cabinet réel : la notification et ses destinataires sont enregistrés ;
    // le journal des envois est relu depuis la base.
    if (cabinet?.reel) {
      setEnvoi(true)
      const r = await cabinet.envoyerNotification(
        { title: entry.title, body: entry.message, when: entry.when, quand: moment },
        recipients.map((row) => row.key),
      )
      setEnvoi(false)
      /* L'écran ne disait RIEN, ni en succès ni en échec : le bouton se
         relâchait, le formulaire restait plein, et on recliquait pour voir —
         en envoyant deux fois quand ça marchait. */
      setRetour({ ok: r.ok, message: r.message })
      if (r.ok) set({ nTitle: '', nMsg: '' })
      return
    }
    set((prev) => ({ pushes: [entry].concat(prev.pushes), nTitle: '', nMsg: '' }))
  }

  async function annuler(pushId: string) {
    if (!cabinet?.reel) return
    setOccupe(true)
    const r = await cabinet.annulerNotification(pushId)
    setOccupe(false)
    setAnnulation(null)
    setRetourLog(r)
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Notifications</Overline>
      </div>
      <h1 className={s.h1}>Écrire à un groupe de patients</h1>
      <p className={s.intro}>
        Les filtres composent le groupe à partir de ce que l'application sait déjà : programme,
        assiduité, modules en retard, rendez-vous manquant. Vous voyez la liste nominative avant
        d'envoyer.
      </p>

      <div className={s.grid}>
        {/* Colonne gauche : le ciblage ------------------------------------ */}
        <div className={s.col}>
          <Card padded={false} className={s.filters}>
            <div className={s.filtersHead}>
              <h2 className={s.h2}>Filtres</h2>
              <button
                type="button"
                className={s.reset}
                onClick={() => set({ nProgs: {}, nAdh: 'all', nSits: {} })}
              >
                Tout réinitialiser
              </button>
            </div>

            <span className={s.label}>
              <Overline>Programme</Overline>
            </span>
            <div className={s.chips}>
              {/* Les programmes du cabinet, pas ceux de la démonstration :
                  filtrer sur « Liberté » quand aucun patient ne le suit ne
                  rend jamais personne. */}
              {programmes.map((program) => {
                const on = !!state.nProgs[program]
                return (
                  <button
                    key={program}
                    type="button"
                    className={on ? `${s.chip} ${s.chipOn}` : s.chip}
                    aria-pressed={on}
                    onClick={() =>
                      set((prev) => ({ nProgs: { ...prev.nProgs, [program]: !prev.nProgs[program] } }))
                    }
                  >
                    {program}
                  </button>
                )
              })}
            </div>

            <span className={`${s.label} ${s.labelGap}`}>
              <Overline>Assiduité</Overline>
            </span>
            <div className={s.chips}>
              {NOTIF_ADHERENCE_OPTIONS.map((option) => {
                const on = state.nAdh === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={on ? `${s.chip} ${s.chipOn}` : s.chip}
                    aria-pressed={on}
                    onClick={() => set({ nAdh: option.value })}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <span className={`${s.label} ${s.labelGap}`}>
              <Overline>Situation</Overline>
            </span>
            <div className={s.chips}>
              {NOTIF_SITUATIONS.map((situation) => {
                const on = !!state.nSits[situation]
                return (
                  <button
                    key={situation}
                    type="button"
                    className={on ? `${s.chip} ${s.chipOn}` : s.chip}
                    aria-pressed={on}
                    onClick={() =>
                      set((prev) => ({
                        nSits: { ...prev.nSits, [situation]: !prev.nSits[situation] },
                      }))
                    }
                  >
                    {situation}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card padded={false} flush className={s.recipients}>
            <div className={s.recipientsHead}>
              <h2 className={s.h2}>Destinataires</h2>
              <span className={s.count}>
                {recipients.length} sur {rows.length} patients
              </span>
            </div>
            <ul className={s.list}>
              {recipients.map((row) => (
                <li key={row.key} className={s.row}>
                  <Avatar initials={row.initials} size={28} />
                  <div className={s.rowText}>
                    <span className={s.name}>{row.name}</span>
                    <span className={s.reason}>{row.reason}</span>
                  </div>
                  {cabinetReel ? (
                    <span className={aTelephone(row.key) ? s.telephoneOui : s.telephoneNon}>
                      {aTelephone(row.key) ? 'Rappels activés' : 'Sans rappels'}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {recipients.length === 0 && (
              <div className={s.noRecipients}>
                Aucun patient ne correspond à cette combinaison de filtres.
              </div>
            )}
          </Card>
        </div>

        {/* Colonne droite : le message ------------------------------------- */}
        <div className={s.col}>
          <Card padded={false} className={s.editor}>
            <div className={s.editorHead}>
              <h2 className={s.h2}>Message</h2>
            </div>
            <TextInput
              className={s.title}
              value={state.nTitle}
              onChange={(e) => set({ nTitle: e.target.value })}
              placeholder="Titre de la notification"
              aria-label="Titre de la notification"
            />
            <TextArea
              className={s.message}
              rows={4}
              value={state.nMsg}
              onChange={(e) => set({ nMsg: e.target.value })}
              placeholder="Deux phrases suffisent."
              aria-label="Message de la notification"
            />
            {/* Le mot s'affiche sur l'écran verrouillé, sous les yeux de qui
                tient le téléphone. Le rappel de discrétion vient avant
                l'envoi, pas dans une charte que personne ne relit. */}
            <p className={s.discret}>
              Il peut s'afficher sur l'écran verrouillé de son téléphone : restez discret sur le
              motif du suivi.
            </p>
            <div className={s.templates}>
              {NOTIF_TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  className={s.template}
                  onClick={() => set({ nTitle: template.title, nMsg: template.message })}
                >
                  {template.label}
                </button>
              ))}
            </div>

            <span className={`${s.label} ${s.labelGap}`}>
              <Overline>Moment d'envoi</Overline>
            </span>
            <div className={s.chips}>
              {RACCOURCIS.map((when) => {
                const on = !dateChoisie && state.nWhen === when
                return (
                  <button
                    key={when}
                    type="button"
                    className={on ? `${s.chip} ${s.chipOn}` : s.chip}
                    aria-pressed={on}
                    onClick={() => {
                      setDateChoisie(false)
                      set({ nWhen: when, nQuand: '' })
                    }}
                  >
                    {when}
                  </button>
                )
              })}
              <button
                type="button"
                className={dateChoisie ? `${s.chip} ${s.chipOn}` : s.chip}
                aria-pressed={dateChoisie}
                onClick={() => {
                  // On ouvre sur demain 9 h : une date vide oblige à tout
                  // saisir, et personne ne programme un envoi dans le passé.
                  const demain = new Date()
                  demain.setDate(demain.getDate() + 1)
                  demain.setHours(9, 0, 0, 0)
                  const valeur = valeurChamp(demain)
                  setDateChoisie(true)
                  set({ nQuand: valeur, nWhen: libelleDuMoment(demain) })
                }}
              >
                Date précise…
              </button>
            </div>

            {dateChoisie ? (
              <div className={s.quand}>
                <input
                  type="datetime-local"
                  className={s.quandChamp}
                  value={state.nQuand}
                  aria-label="Date et heure de l'envoi"
                  aria-invalid={!quand.ok}
                  aria-describedby={!quand.ok ? 'notif-quand-raison' : undefined}
                  onChange={(e) => {
                    const valeur = e.target.value
                    const moment = momentSaisi(valeur)
                    set({ nQuand: valeur, nWhen: moment ? libelleDuMoment(moment) : 'Date incomplète' })
                  }}
                />
                <button
                  type="button"
                  className={s.quandAnnuler}
                  onClick={() => {
                    setDateChoisie(false)
                    set({ nQuand: '', nWhen: 'Ce soir, 20 h' })
                  }}
                >
                  Revenir aux raccourcis
                </button>
              </div>
            ) : null}
            {!quand.ok ? (
              <p id="notif-quand-raison" className={s.quandRaison} role="status">
                {quand.raison}
              </p>
            ) : null}

            <div className={s.preview}>
              <div className={s.previewTop}>
                <span className={s.previewFrom}>{nomCabinet}</span>
                <span className={s.previewWhen}>{state.nWhen}</span>
              </div>
              <div className={previewTitle ? s.previewTitle : `${s.previewTitle} ${s.ghost}`}>
                {previewTitle || 'Titre de la notification'}
              </div>
              <div className={previewMsg ? s.previewMsg : `${s.previewMsg} ${s.ghost}`}>
                {previewMsg ||
                  'Le message apparaîtra ici, tel qu\u2019elle le verra en ouvrant son espace.'}
              </div>
            </div>

            {retour ? (
              <Notice tone={retour.ok ? 'ok' : 'warn'} style={{ margin: '0 0 12px' }}>
                {retour.message}
              </Notice>
            ) : null}

            <div className={s.sendRow}>
              <Button
                variant="primary"
                className={s.send}
                disabled={!canSend || envoi}
                onClick={() => void send()}
              >
                {envoi
                  ? 'Envoi…'
                  : canSend
                    ? `Écrire à ${plural(recipients.length, 'patient', 'patients')}`
                    : 'Envoyer'}
              </Button>
              <span className={s.sendHint}>
                {state.pushes.length
                  ? `Dernier envoi : ${plural(state.pushes[0].names.length, 'destinataire', 'destinataires')}.`
                  : "Il arrive sur le téléphone de qui a activé les rappels, et attend dans l'espace des autres."}
              </span>
              {sansTelephone.length > 0 ? (
                <span className={s.sansTelephoneNote}>
                  {sansTelephone.length === 1
                    ? `${sansTelephone[0].name} n'a pas activé les rappels : ce mot l'attendra dans son espace.`
                    : `${sansTelephone.length} destinataires n'ont pas activé les rappels : ce mot les attendra dans leur espace.`}{' '}
                  Vous pouvez le leur proposer en séance — c'est dans « Mon compte », dans leur espace.
                </span>
              ) : null}
            </div>
          </Card>

          {state.pushes.length > 0 && (
            <Card padded={false} className={s.log}>
              <div className={s.logHead}>
                <Title>Derniers mots</Title>
              </div>
              <div className={s.logSub}>
                Chaque mot part sur le téléphone de qui a activé les rappels, et reste dans son
                espace dans tous les cas.
              </div>
              <ul className={s.logList}>
                {state.pushes.map((push, i) =>
                  push.id && edition === push.id ? (
                    <li key={push.id} className={s.logRow}>
                      <ReprogrammerMot
                        push={push}
                        onFini={(r) => {
                          setEdition(null)
                          setRetourLog(r)
                        }}
                        onAnnuler={() => setEdition(null)}
                      />
                    </li>
                  ) : (
                    <li key={push.id ?? `${push.stamp}:${i}`} className={s.logRow}>
                      <div className={s.logTop}>
                        <span className={s.logTitle}>{push.title}</span>
                        <span className={s.logWhen}>{push.when}</span>
                      </div>
                      <div className={s.logMsg}>{push.message}</div>
                      <div className={s.logTo}>
                        {/* « Envoyé » de tout, y compris de ce qui attendait le soir :
                            depuis 0036, l'espace patient ne le voit pas avant l'heure. */}
                        {push.attend ? `Part le ${push.attend} · ` : ''}
                        {plural(push.names.length, 'destinataire', 'destinataires')} ·{' '}
                        {push.names.join(', ')}
                      </div>
                      {push.telephone && phraseTelephone(push.telephone) ? (
                        <div className={s.logTelephone}>{phraseTelephone(push.telephone)}</div>
                      ) : null}
                      {/* Tant qu'il attend son heure, un mot se reprend : on le
                          réécrit, on le déplace, on l'annule. Après, il est parti. */}
                      {cabinetReel && push.id && push.attend ? (
                        <div className={s.logActions}>
                          {annulation === push.id ? (
                            <>
                              <span className={s.logConfirme}>Annuler ce mot ? Il ne partira pas.</span>
                              <button
                                type="button"
                                className={s.logAction}
                                disabled={occupe}
                                onClick={() => void annuler(push.id as string)}
                              >
                                Oui, l'annuler
                              </button>
                              <button type="button" className={s.logAction} onClick={() => setAnnulation(null)}>
                                Le garder
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={s.logAction}
                                aria-label={`Modifier le mot « ${push.title} »`}
                                onClick={() => {
                                  setRetourLog(null)
                                  setEdition(push.id as string)
                                }}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className={s.logAction}
                                aria-label={`Annuler le mot « ${push.title} »`}
                                onClick={() => {
                                  setRetourLog(null)
                                  setAnnulation(push.id as string)
                                }}
                              >
                                Annuler l'envoi
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
              {retourLog ? (
                <Notice tone={retourLog.ok ? 'ok' : 'warn'} style={{ margin: '12px 0 0' }}>
                  {retourLog.message}
                </Notice>
              ) : null}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Reprendre un mot programmé : son titre, son texte, son heure.
 *
 * Le champ de date s'ouvre sur l'heure prévue ; il refuse, comme l'envoi,
 * une date vide, à moitié tapée ou déjà passée. Les destinataires ne
 * changent pas ici : pour écrire à d'autres, on annule et on réécrit.
 */
function ReprogrammerMot({
  push,
  onFini,
  onAnnuler,
}: {
  push: PushRecord
  onFini: (retour: { ok: boolean; message: string }) => void
  onAnnuler: () => void
}) {
  const cabinet = useMaybeCabinet()
  const [titre, setTitre] = useState(push.title)
  const [texte, setTexte] = useState(push.message)
  const [valeur, setValeur] = useState(() => {
    const prevu = push.prevu ? new Date(push.prevu) : null
    return prevu && !Number.isNaN(prevu.getTime()) ? valeurChamp(prevu) : ''
  })
  const [envoi, setEnvoi] = useState(false)

  const quand = momentDEnvoi(valeur, '', true)
  const peut = quand.ok && texte.trim().length > 0 && !envoi

  async function enregistrer() {
    if (!cabinet?.reel || !push.id) return
    // Relu au clic : l'heure a pu passer pendant qu'on écrivait.
    const choix = momentDEnvoi(valeur, '', true)
    if (!choix.ok || !texte.trim()) return
    setEnvoi(true)
    const r = await cabinet.modifierNotification(push.id, {
      title: titre.trim() || 'Un mot du cabinet',
      body: texte.trim(),
      when: libelleDuMoment(choix.moment),
      quand: choix.moment,
    })
    setEnvoi(false)
    onFini(r)
  }

  return (
    <form
      className={s.reprise}
      aria-label={`Modifier le mot « ${push.title} »`}
      onSubmit={(e) => {
        e.preventDefault()
        void enregistrer()
      }}
    >
      <TextInput
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder="Titre de la notification"
        aria-label="Titre du mot"
      />
      <TextArea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Texte du mot" />
      <input
        type="datetime-local"
        className={s.quandChamp}
        value={valeur}
        aria-label="Nouvelle date et heure d'envoi"
        aria-invalid={!quand.ok}
        onChange={(e) => setValeur(e.target.value)}
      />
      {!quand.ok ? (
        <p className={s.quandRaison} role="status">
          {quand.raison}
        </p>
      ) : (
        <p className={s.logSub}>Partira {libelleDuMoment(quand.moment)}.</p>
      )}
      <div className={s.logActions}>
        <Button variant="primary" type="submit" disabled={!peut}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="ghost" type="button" disabled={envoi} onClick={onAnnuler}>
          Laisser tel quel
        </Button>
      </div>
    </form>
  )
}
