import { useEffect, useRef, useState } from 'react'
import { Notice, Overline } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { lireIntegrations } from '@/services/integrations'
import { NOTE_TAGS, NOTE_TAG_PREFIXES } from '@/data/session'
import { clock, euro, plural } from '@/lib/format'
import {
  AiError,
  buildPatientContext,
  derniereReponseEstMaquette,
  draftSessionNote,
} from '@/services/aiClient'
import { PLAFOND_SORTIE, TARIF, estimationBrouillon } from '@/lib/coutIA'
import { CADENCE_SAUVEGARDE_MS, aSauver, type Instantane } from '@/lib/seance'
import {
  appendSegment,
  createTranscriber,
  isSpeechSupported,
  type Transcriber,
} from '@/services/speech'
import { useStore } from '@/state/store'
import s from './RecordStep.module.css'

const cx = (...parts: Array<string | false>) => parts.filter(Boolean).join(' ')

/** Ce qu'on dit à la place de la séance d'exemple, qui n'existe plus. */
const NOTES_SUFFISENT = 'écrivez vos notes dans le champ ci-dessous : elles suffisent à rédiger le brouillon.'

/** Où en est l'enregistrement de la captation dans la séance. */
type Sauvegarde =
  | { etat: 'jamais' }
  | { etat: 'ok'; a: Date }
  | { etat: 'echec'; message: string }

/**
 * Étape 3 : minuteur, transcription en direct, notes écrites, brouillon.
 *
 * L'HYPNOSE NE SE DÉCIDE PLUS ICI. La case y était posée « avant de lancer,
 * là où le coût s'affiche » — sauf qu'elle ne conditionnait pas le lancement :
 * elle réglait la fiche, et l'étape suivante portait déjà le même réglage
 * ET le bouton qui écrit vraiment. Deux endroits pour un choix, dont un seul
 * agit, c'est une question posée trop tôt : on décide en lisant la note.
 */
export function RecordStep() {
  const { state, set, read } = useStore()
  const cabinet = useMaybeCabinet()
  const transcriber = useRef<Transcriber | null>(null)

  /* QUI PAIE L'APPEL — et, depuis que le repli sur la clé de la plateforme
     est retiré, s'il y a un appel du tout. Sans clé au cabinet, l'analyse
     répond 503 : autant le dire ici, où le geste s'engage, plutôt que de
     laisser dicter une séance entière avant de refuser. */
  const [saCle, setSaCle] = useState<boolean | null>(null)
  useEffect(() => {
    let vivant = true
    lireIntegrations()
      .then((e) => vivant && setSaCle(Boolean(e.anthropic)))
      .catch(() => vivant && setSaCle(null))
    return () => {
      vivant = false
    }
  }, [])

  /**
   * LA CAPTATION S'ENREGISTRE PENDANT LA SÉANCE.
   *
   * La transcription n'existait qu'en mémoire jusqu'à « Terminer », alors que
   * l'écran promettait des segments « envoyés au fur et à mesure » et que
   * « rien n'est perdu si la connexion tombe ». Une heure de séance tenait à
   * un onglet. La séance existe en base dès le consentement : le texte et les
   * notes y sont déposés toutes les quinze secondes quand ils ont changé, à
   * chaque pause, quand l'onglet passe en arrière-plan (fermeture comprise,
   * autant que le navigateur laisse partir la requête) et en quittant
   * l'écran. Au retour, l'étape du consentement propose de reprendre.
   *
   * Une fonction tenue dans une référence : l'intervalle et les écouteurs
   * sont posés une fois, et appellent toujours la version à jour.
   */
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>({ etat: 'jamais' })
  const dernierSauve = useRef<Instantane | null>(null)
  const enVol = useRef(false)
  const monte = useRef(true)
  const sauver = async () => {
    if (!cabinet?.reel || enVol.current) return
    const now = read()
    // Le brouillon a pris le relais : c'est lui qui écrit la séance désormais.
    if (!now.sessionId || now.sent || now.draft) return
    const courant: Instantane = { transcript: now.transcript, notes: now.sessionNotes }
    if (!aSauver(courant, dernierSauve.current)) return
    enVol.current = true
    const r = await cabinet.sauverCaptation(now.sessionId, {
      transcript: courant.transcript,
      notes: courant.notes,
      dureeSecondes: now.elapsed,
    })
    enVol.current = false
    if (r.ok) dernierSauve.current = courant
    if (!monte.current) return
    setSauvegarde(r.ok ? { etat: 'ok', a: new Date() } : { etat: 'echec', message: r.message })
  }
  const sauverRef = useRef(sauver)
  sauverRef.current = sauver

  useEffect(() => {
    monte.current = true
    const id = window.setInterval(() => void sauverRef.current(), CADENCE_SAUVEGARDE_MS)
    const auMasquage = () => {
      if (document.visibilityState === 'hidden') void sauverRef.current()
    }
    const aLaFermeture = () => void sauverRef.current()
    document.addEventListener('visibilitychange', auMasquage)
    window.addEventListener('pagehide', aLaFermeture)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', auMasquage)
      window.removeEventListener('pagehide', aLaFermeture)
      monte.current = false
      // En quittant l'écran : ce qui a été pris depuis la dernière écriture.
      void sauverRef.current()
    }
  }, [])

  // Le minuteur n'avance que pendant l'enregistrement, et jamais après.
  useEffect(() => {
    if (!state.recording) return
    const id = window.setInterval(() => set((prev) => ({ elapsed: prev.elapsed + 1 })), 1000)
    return () => window.clearInterval(id)
  }, [state.recording, set])

  // Micro coupé si l'on quitte l'écran en cours de séance : l'état d'enregistrement
  // retombe avec lui, sinon le minuteur repartirait au retour sans rien transcrire.
  useEffect(
    () => () => {
      set({ recording: false, interim: '' })
      transcriber.current?.stop()
      transcriber.current = null
    },
    [set],
  )

  function stopRec() {
    set({ recording: false, interim: '' })
    transcriber.current?.stop()
    transcriber.current = null
    // Une pause est un bon moment pour déposer ce qui vient d'être dit.
    void sauverRef.current()
  }

  /* LA SÉANCE D'EXEMPLE N'EXISTE PLUS : cinq messages y renvoyaient encore.
     Ce qui reste vrai, et suffit, ce sont les notes écrites — le brouillon
     se rédige à partir d'elles seules. */
  function startRec() {
    if (!isSpeechSupported()) {
      set({
        notice: `Ce navigateur ne transcrit pas la parole (Chrome, Edge et Safari le font). En attendant, ${NOTES_SUFFISENT}`,
      })
      return
    }
    /* Le navigateur livre encore la dernière phrase APRÈS l'arrêt du micro.
       En pause, c'est ce qu'on veut ; mais après un retrait du consentement
       ou un changement de fiche, cette phrase tomberait dans la séance
       suivante. Elle n'est versée que dans la séance qui l'a captée. */
    const origine = read()
    const memeSeance = (prev: typeof origine) =>
      prev.consent && prev.sessionPatient === origine.sessionPatient && prev.sessionId === origine.sessionId
    const next = createTranscriber({
      onFinal: (text, suite) =>
        set((prev) =>
          memeSeance(prev) ? { transcript: appendSegment(prev.transcript, text, suite), interim: '' } : {},
        ),
      onInterim: (text) => set((prev) => (memeSeance(prev) ? { interim: text } : {})),
      onError: (code) =>
        set({
          notice:
            code === 'not-allowed'
              ? `Accès au micro refusé. Autorisez le microphone, ou ${NOTES_SUFFISENT}`
              : `Transcription interrompue (${code}). Relancez le micro, ou ${NOTES_SUFFISENT}`,
        }),
    })
    if (!next || !next.start()) {
      set({ notice: `Impossible de démarrer le micro ici. En attendant, ${NOTES_SUFFISENT}` })
      return
    }
    transcriber.current = next
    set({ recording: true, notice: '' })
  }

  /** Insère l'horodatage du minuteur, et le préfixe du bouton, en fin de note. */
  function stampNote(label: string) {
    const prefix = NOTE_TAG_PREFIXES[label] ?? ''
    set((prev) => ({
      sessionNotes:
        prev.sessionNotes +
        (prev.sessionNotes && !/\n$/.test(prev.sessionNotes) ? '\n' : '') +
        clock(prev.elapsed) +
        ' ' +
        prefix,
    }))
  }

  async function generate() {
    const now = read()
    const transcript = now.transcript.trim()
    const notes = now.sessionNotes.trim()
    // Les notes écrites comptent dans la matière disponible : elles priment au moment de rédiger.
    const material = notes ? `${transcript}\n\n${notes}` : transcript
    if (material.length < 80) {
      set({
        notice: `Il faut un peu plus de matière : dictez quelques phrases, ou ${NOTES_SUFFISENT}`,
      })
      return
    }
    stopRec()
    set({ generating: true, notice: '' })
    try {
      const draft = await draftSessionNote({
        context: buildPatientContext(now, now.sessionPatient),
        transcript,
        notes,
        categories: now.cats,
      })
      const maquette = derniereReponseEstMaquette()
      set({
        draft,
        draftMaquette: maquette,
        generating: false,
        syntheseOk: false,
        proposalOff: {},
        sent: false,
        sugOff: {},
        sugSent: '',
      })
      /* Le brouillon rejoint la séance en base dès qu'il existe : recharger la
         page ne le perd plus. Un texte de maquette, lui, n'y entre jamais.
         Un refus se dit — une séance déjà close, par exemple, que ce
         brouillon ne doit pas rouvrir. */
      if (cabinet?.reel && now.sessionId && !maquette) {
        const r = await cabinet.enregistrerBrouillon(now.sessionId, {
          transcript,
          notes,
          dureeSecondes: now.elapsed,
          draft,
        })
        if (!r.ok) {
          set({
            notice: `${r.message} Le brouillon reste à l'écran, mais pas encore dans la séance.`,
          })
        }
      }
    } catch (error) {
      const message = error instanceof AiError ? error.message : "le serveur n'a pas répondu"
      set({ generating: false, notice: `La génération a échoué : ${message}. Réessayez.` })
    }
  }

  const wordsNow = state.transcript ? state.transcript.trim().split(/\s+/).length : 0
  /**
   * Ce que l'analyse coûtera, calculé sur la matière réelle.
   *
   * L'ancienne version prenait le temps écoulé pour du texte, à 2,3 mots par
   * seconde : le chiffre montait pendant les silences et annonçait une
   * dépense qui n'aurait pas lieu. Ici, tant que rien n'a été dit, il n'y a
   * rien à facturer et l'écran l'écrit.
   *
   * L'estimation reste grossière (cinq brouillons mesurés) : l'écran annonce
   * donc la borne, « jusqu'à », que le plafond du serveur garantit.
   *
   * Les notes écrites comptent : elles partent avec la transcription.
   */
  const devis = estimationBrouillon(state.transcript, state.sessionNotes)

  /* Tant qu'on ne sait pas, on ne dit rien : annoncer le mauvais payeur est
     pire que de ne pas nommer le payeur. */
  const qui =
    saCle === null
      ? ''
      : saCle
        ? " L'appel est facturé sur le compte Anthropic de votre cabinet."
        : " Votre cabinet n'a pas encore de clé Anthropic : posez-la dans Réglages › Intégrations, sans quoi l'analyse ne pourra pas être écrite."

  const recLabel = state.recording
    ? 'Enregistrement en cours'
    : state.transcript
      ? 'En pause'
      : state.capture === 'live'
        ? 'Démarrer la séance'
        : 'Démarrer la dictée'

  const recHint = state.recording
    ? 'Parlez normalement. Le texte apparaît au fur et à mesure.'
    : state.capture === 'live'
      ? 'Posez le téléphone sur la table, écran vers le bas.'
      : 'Quatre-vingt-dix secondes suffisent.'

  const transcriptView =
    state.transcript + (state.interim ? ' ' + state.interim : '') ||
    (state.recording ? '…' : 'La transcription apparaîtra ici.')

  /* Ce que l'écran dit de l'enregistrement, sans rien promettre de plus que
     ce qui vient d'être fait. */
  const etatSauvegarde = !cabinet?.reel
    ? "Démonstration : rien n'est écrit"
    : sauvegarde.etat === 'ok'
      ? `Enregistrée à ${sauvegarde.a.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : sauvegarde.etat === 'echec'
        ? 'Échec, nouvel essai sous 15 s'
        : 'Toutes les 15 secondes'

  return (
    <div className={s.step}>
      <section className={cx(s.card, s.pad)}>
        <div className={s.overline}>
          <Overline>Mode de capture</Overline>
        </div>
        <div className={s.modes}>
          <button
            type="button"
            className={cx(s.mode, state.capture === 'live' && s.modeOn)}
            aria-pressed={state.capture === 'live'}
            onClick={() => set({ capture: 'live' })}
          >
            <span className={s.modeTitle}>Séance complète</span>
            <span className={s.modeBody}>
              Le micro tourne pendant toute la séance. Le plus riche, le plus intrusif.
            </span>
          </button>
          <button
            type="button"
            className={cx(s.mode, state.capture === 'dictation' && s.modeOn)}
            aria-pressed={state.capture === 'dictation'}
            onClick={() => set({ capture: 'dictation' })}
          >
            <span className={s.modeTitle}>Synthèse dictée</span>
            <span className={s.modeBody}>
              Une fois la séance terminée, vous la résumez à voix haute en 90 secondes.
            </span>
          </button>
        </div>
      </section>

      <section className={cx(s.card, s.flush)}>
        <div className={s.recRow}>
          <button
            type="button"
            className={cx(s.recBtn, state.recording && s.recBtnOn)}
            aria-label={state.recording ? "Arrêter l'enregistrement" : recLabel}
            onClick={() => (state.recording ? stopRec() : startRec())}
          >
            <span aria-hidden>{state.recording ? '❙❙' : '●'}</span>
          </button>
          <div className={s.recText}>
            <span className={s.recLabel}>{recLabel}</span>
            <span className={s.recHint}>{recHint}</span>
          </div>
          <span className={s.recTime}>{clock(state.elapsed)}</span>
        </div>

        <div className={s.facts}>
          {/* « Découpage : N segments de 15 min » décrivait un mécanisme qui
              n'a jamais existé. Ce qui existe, c'est l'enregistrement dans la
              séance : on en montre l'état réel. */}
          <div className={s.fact}>
            <div className={s.factLabel}>Dans la séance</div>
            <div className={s.factValue}>{etatSauvegarde}</div>
          </div>
          <div className={s.fact}>
            <div className={s.factLabel}>À analyser</div>
            <div className={s.factValue}>
              {wordsNow > 0
                ? `${wordsNow.toLocaleString('fr-FR')} ${wordsNow > 1 ? 'mots' : 'mot'}`
                : 'Rien encore'}
            </div>
          </div>
          <div className={s.fact}>
            <div className={s.factLabel}>Coût d'analyse</div>
            <div className={s.factValue}>{devis.euros === 0 ? '—' : `jusqu'à ${euro(devis.eurosMax)}`}</div>
          </div>
        </div>

        <div className={s.factNote}>
          {cabinet?.reel
            ? "Aucune limite de durée. Le texte et vos notes s'enregistrent dans la séance toutes les quinze secondes, à chaque pause et quand l'onglet passe en arrière-plan : si la page se ferme, vous perdez au plus les dernières secondes, et la séance vous sera proposée à la reprise quand vous en rouvrirez une pour cette personne. Si la connexion tombe, le texte reste à l'écran et l'enregistrement reprend dès qu'elle revient."
            : "Aucune limite de durée. En démonstration, le texte ne vit qu'à l'écran : rien n'est enregistré."}{' '}
          {sauvegarde.etat === 'echec' ? `${sauvegarde.message} ` : ''}
          {devis.euros === 0
            ? "Le coût d'analyse s'affiche dès les premiers mots transcrits, et suit ce qui est réellement dit."
            : `Estimation grossière, calée sur les brouillons déjà facturés : ${devis.entree.toLocaleString('fr-FR')} jetons envoyés — votre matière et le cadre de l'analyse — et jusqu'à ${PLAFOND_SORTIE.toLocaleString('fr-FR')} rendus, à ${TARIF.entree} $ et ${TARIF.sortie} $ le million. La longueur du brouillon est plafonnée : l'appel ne dépassera pas ${euro(devis.eurosMax)}, et tourne plutôt autour de ${euro(devis.euros)}.${qui}`}
        </div>

        <div className={s.body}>
          <div className={s.transcriptHead}>
            <Overline>Transcription en direct</Overline>
            <span className={s.count}>{wordsNow ? plural(wordsNow, 'mot', 'mots') : ''}</span>
          </div>
          <div className={s.transcript}>{transcriptView}</div>

          <div className={s.notes}>
            <div className={s.notesHead}>
              <div className={s.notesTitles}>
                <span className={s.notesTitle}>Vos notes écrites</span>
                <span className={s.notesHint}>
                  Prioritaires sur la transcription au moment de rédiger le brouillon.
                </span>
              </div>
              <span className={s.notesCount}>
                {state.sessionNotes.trim() ? plural(state.sessionNotes.trim().split(/\s+/).length, 'mot', 'mots') : ''}
              </span>
            </div>
            <div className={s.tags}>
              {NOTE_TAGS.map((tag) => (
                <button type="button" key={tag} className={s.tag} onClick={() => stampNote(tag)}>
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              className={s.notesField}
              rows={6}
              value={state.sessionNotes}
              aria-label="Vos notes écrites"
              placeholder="Observations, mots exacts à retenir, hypothèse de travail, ce que vous voulez donner pour l'entre-séances…"
              onChange={(e) => set({ sessionNotes: e.target.value })}
            />
          </div>

          <div className={s.actions}>
            <button
              type="button"
              className={cx(s.generate, state.generating && s.generateBusy)}
              onClick={generate}
              disabled={state.generating}
            >
              {state.generating ? 'Rédaction du brouillon…' : 'Terminer et rédiger la note'}
            </button>
            <button
              type="button"
              className={s.clear}
              onClick={() => set({ transcript: '', interim: '', elapsed: 0, notice: '' })}
            >
              Effacer
            </button>

            {/* Le prix se lit là où l'on décide de le payer. Il est déjà en
                haut de l'écran, mais personne ne remonte vérifier un chiffre
                avant de cliquer : c'est ici que la dépense est engagée. */}
            {devis.euros > 0 ? (
              <span className={s.devis}>
                Cet appel vous coûtera jusqu'à <strong>{euro(devis.eurosMax)}</strong>.
              </span>
            ) : null}
          </div>

          {state.notice ? (
            <div className={s.notice}>
              <Notice tone="warn">{state.notice}</Notice>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
