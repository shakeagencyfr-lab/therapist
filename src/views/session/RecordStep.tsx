import { useEffect, useRef, useState } from 'react'
import { Notice, Overline } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { lireIntegrations } from '@/services/integrations'
import { NOTE_TAGS, NOTE_TAG_PREFIXES } from '@/data/session'
import { clock, euro } from '@/lib/format'
import {
  AiError,
  buildPatientContext,
  derniereReponseEstMaquette,
  draftSessionNote,
} from '@/services/aiClient'
import { MODELE_ANALYSE, TARIF, estimationBrouillon } from '@/lib/coutIA'
import {
  appendSegment,
  createTranscriber,
  isSpeechSupported,
  type Transcriber,
} from '@/services/speech'
import { useStore } from '@/state/store'
import s from './RecordStep.module.css'

/** L'enregistrement part par segments de quinze minutes : aucune limite de durée. */
const SEGMENT = 900

const cx = (...parts: Array<string | false>) => parts.filter(Boolean).join(' ')

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
  }

  function startRec() {
    if (!isSpeechSupported()) {
      set({
        notice:
          "Ce navigateur ne gère pas la transcription en direct (Chrome et Edge le font). Chargez la séance d'exemple pour tester la génération du brouillon.",
      })
      return
    }
    const next = createTranscriber({
      onFinal: (text, suite) =>
        set((prev) => ({ transcript: appendSegment(prev.transcript, text, suite), interim: '' })),
      onInterim: (text) => set({ interim: text }),
      onError: (code) =>
        set({
          notice:
            code === 'not-allowed'
              ? "Accès au micro refusé. Autorisez le microphone, ou chargez la séance d'exemple."
              : `Transcription interrompue (${code}). La séance d'exemple permet de tester la suite.`,
        }),
    })
    if (!next || !next.start()) {
      set({ notice: "Impossible de démarrer le micro ici. Chargez la séance d'exemple." })
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
        notice: "Il faut un peu plus de matière. Dictez quelques phrases ou chargez la séance d'exemple.",
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
      // Le brouillon rejoint la séance en base dès qu'il existe : recharger la
      // page ne le perd plus. Un texte de maquette, lui, n'y entre jamais.
      if (cabinet?.reel && now.sessionId && !maquette) {
        void cabinet.enregistrerBrouillon(now.sessionId, {
          transcript,
          notes,
          dureeSecondes: now.elapsed,
          draft,
        })
      }
    } catch (error) {
      const message = error instanceof AiError ? error.message : "le serveur n'a pas répondu"
      set({ generating: false, notice: `La génération a échoué : ${message}. Réessayez.` })
    }
  }

  const segCount = Math.max(1, Math.ceil(Math.max(state.elapsed, 1) / SEGMENT))
  const wordsNow = state.transcript ? state.transcript.trim().split(/\s+/).length : 0
  /**
   * Ce que l'analyse coûtera, calculé sur la matière réelle.
   *
   * L'ancienne version prenait le temps écoulé pour du texte, à 2,3 mots par
   * seconde : le chiffre montait pendant les silences et annonçait une
   * dépense qui n'aurait pas lieu. Ici, tant que rien n'a été dit, il n'y a
   * rien à facturer et l'écran l'écrit.
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
              Après le départ du patient, vous résumez à voix haute en 90 secondes.
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
          <div className={s.fact}>
            <div className={s.factLabel}>Découpage</div>
            <div className={s.factValue}>
              {segCount === 1 ? 'Un seul segment' : `${segCount} segments de 15 min`}
            </div>
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
            <div className={s.factValue}>{devis.euros === 0 ? '—' : euro(devis.euros)}</div>
          </div>
        </div>

        <div className={s.factNote}>
          {state.elapsed >= 5400
            ? "Séance longue. L'enregistrement est découpé en segments de quinze minutes envoyés au fur et à mesure : aucune limite de durée, et rien n'est perdu si la connexion tombe."
            : "Aucune limite de durée : l'enregistrement est découpé en segments de quinze minutes transcrits au fil de la séance."}{' '}
          {devis.euros === 0
            ? "Le coût d'analyse s'affiche dès les premiers mots transcrits, et suit ce qui est réellement dit."
            : `Estimation au tarif de ${MODELE_ANALYSE} — ${TARIF.entree} $ le million de jetons envoyés, ${TARIF.sortie} $ le million rendus — sur ${devis.entree.toLocaleString('fr-FR')} jetons envoyés et ${devis.sortie.toLocaleString('fr-FR')} attendus en retour. Elle ne dépassera pas ${euro(devis.eurosMax)} : la longueur du brouillon est plafonnée.${qui}`}
        </div>

        <div className={s.body}>
          <div className={s.transcriptHead}>
            <Overline>Transcription en direct</Overline>
            <span className={s.count}>{wordsNow ? `${wordsNow} mots` : ''}</span>
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
                {state.sessionNotes.trim() ? `${state.sessionNotes.trim().split(/\s+/).length} mots` : ''}
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
                Cet appel vous coûtera environ <strong>{euro(devis.euros)}</strong>, au plus{' '}
                {euro(devis.eurosMax)}.
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
