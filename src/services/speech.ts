/**
 * Transcription en direct, par l'API Web Speech du navigateur.
 *
 * DEUX LIMITES, à connaître avant de s'appuyer dessus.
 *
 * 1. L'AUDIO SORT DU POSTE. Contrairement à ce que « API du navigateur »
 *    laisse croire, Chrome et Edge envoient le son à un service de
 *    reconnaissance distant (Google pour Chrome). La parole d'un patient en
 *    séance transite donc par un tiers, hors du cadre HDS que ce produit
 *    promet. C'est le point qui interdit aujourd'hui un usage clinique réel :
 *    il se règle en captant l'audio localement et en le confiant à un service
 *    de transcription sous contrat, pas en changeant une ligne ici.
 *
 * 2. AUCUNE DIARISATION. La spécification n'a pas de notion de locuteur : ce
 *    module rend un flux de texte unique où la voix de la thérapeute et celle
 *    du patient sont fondues, sans marque. Le serveur le détecte
 *    (hasSpeakerLabels) et l'annonce au modèle, pour qu'il cesse d'attribuer
 *    au patient des phrases qu'il ne peut pas lui attribuer.
 *
 * Seuls Chrome et Edge proposent cette API ; ailleurs, l'écran de séance
 * propose la séance d'exemple.
 *
 * L'API n'est pas dans les typages DOM standard : les interfaces minimales
 * dont ce module a besoin sont déclarées ici.
 */

interface SpeechAlternative {
  readonly transcript: string
}

interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechAlternative
}

interface SpeechResultList {
  readonly length: number
  readonly [index: number]: SpeechResult
}

interface SpeechResultEvent {
  readonly resultIndex: number
  readonly results: SpeechResultList
}

interface SpeechErrorEvent {
  /** « not-allowed », « no-speech », « network »… */
  readonly error: string
}

interface SpeechRecognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognizerConstructor = new () => SpeechRecognizer

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognizerConstructor
  webkitSpeechRecognition?: SpeechRecognizerConstructor
}

function recognizerClass(): SpeechRecognizerConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as SpeechCapableWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Faux hors navigateur compatible : l'appelant affiche alors son message. */
export function isSpeechSupported(): boolean {
  return recognizerClass() !== null
}

export interface TranscriberHandlers {
  /**
   * Segment validé, à concaténer à la transcription déjà saisie. Il se termine
   * par une espace : le prototype recolle puis normalise les blancs.
   */
  onFinal(text: string): void
  /** Segment en cours de reconnaissance : il remplace le précédent. */
  onInterim(text: string): void
  /** Code d'erreur de l'API, à traduire par l'appelant. */
  onError(code: string): void
}

export interface Transcriber {
  /** Démarre l'écoute. Rend faux si le micro n'a pas pu démarrer. */
  start(): boolean
  stop(): void
}

/**
 * Crée un transcripteur, ou rend null si le navigateur ne sait pas transcrire.
 *
 * Tant que l'enregistrement est actif, la reconnaissance est relancée à chaque
 * fin de segment : le navigateur la coupe régulièrement, une séance dure une
 * heure.
 */
export function createTranscriber(handlers: TranscriberHandlers): Transcriber | null {
  const Recognizer = recognizerClass()
  if (!Recognizer) return null

  let recognizer: SpeechRecognizer | null = null
  let active = false

  return {
    start() {
      try {
        const r = new Recognizer()
        r.lang = 'fr-FR'
        r.continuous = true
        r.interimResults = true

        r.onresult = (event) => {
          let fin = ''
          let itm = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript
            if (event.results[i].isFinal) fin += t + ' '
            else itm += t
          }
          if (fin) handlers.onFinal(fin)
          else handlers.onInterim(itm)
        }

        r.onerror = (event) => handlers.onError(event.error)

        r.onend = () => {
          if (!active) return
          try {
            r.start()
          } catch {
            // Relance impossible : l'événement d'erreur a déjà prévenu.
          }
        }

        recognizer = r
        active = true
        r.start()
        return true
      } catch {
        recognizer = null
        active = false
        return false
      }
    },

    stop() {
      active = false
      if (!recognizer) return
      try {
        recognizer.stop()
      } catch {
        // L'objet est déjà arrêté : rien à faire.
      }
      recognizer = null
    },
  }
}
