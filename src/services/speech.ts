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

/**
 * Deux textes comparables : casse, blancs et ponctuation finale mis de côté.
 *
 * C'est en finalisant que le navigateur pose les majuscules et le point. La
 * même phrase republiée ne doit pas passer pour une autre à cause d'eux.
 */
function cle(texte: string): string {
  return texte
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?…]+$/, '')
}

/**
 * `suite` reprend-il `debut` en le prolongeant ?
 *
 * La coupure doit tomber sur une frontière de mot, sinon « il a dit » serait
 * vu comme le début de « il a dites » et deux phrases distinctes
 * fusionneraient.
 */
function prolonge(debut: string, suite: string): boolean {
  const a = cle(debut)
  const b = cle(suite)
  if (!a) return true
  if (a === b) return true
  if (!b.startsWith(a)) return false
  const frontiere = b[a.length]
  return !/[\p{L}\p{N}]/u.test(frontiere)
}

/**
 * Ajoute un segment validé à la transcription.
 *
 * Chaque segment final correspond à une prise de parole séparée par un
 * silence : c'est le SEUL indice de tour de parole que l'API fournisse. Tout
 * concaténer à plat le détruisait — et c'est précisément ce qui manque au
 * modèle pour rattacher une phrase à l'un ou à l'autre. Une ligne par segment
 * le lui rend, sans rien inventer : la ligne dit « ici, quelqu'un a repris la
 * parole », elle ne dit pas qui.
 *
 * MAIS certains navigateurs — Chrome sur Android au premier chef — annoncent
 * comme DÉFINITIF un segment qu'ils rallongent ensuite, et republient depuis
 * le début de la liste à chaque événement. Ajouter aveuglément donnait alors
 * l'empilement observé en séance :
 *
 *     c'est quelqu'un
 *     c'est quelqu'un de
 *     c'est quelqu'un de très
 *     c'est quelqu'un de très dépressif
 *
 * `suite` dit lequel des deux cas se présente, et seul le transcripteur peut
 * le savoir : il suit chaque résultat par son index. Vrai, le segment
 * REMPLACE la dernière ligne — c'est la même phrase qui s'allonge. Faux, il
 * prend une ligne à lui, même s'il commence par les mêmes mots : « oui » puis
 * « oui bien sûr » sont deux tours de parole, et le devinerait-on qu'on
 * aurait tort de les fondre.
 */
export function appendSegment(transcript: string, segment: string, suite = false): string {
  const propre = segment.replace(/\s+/g, ' ').trim()
  if (!propre) return transcript
  if (!transcript) return propre

  const lignes = transcript.split('\n')
  const derniere = lignes[lignes.length - 1]

  if (suite) {
    // La même phrase qui s'allonge : elle reprend la place de la précédente.
    if (prolonge(derniere, propre)) {
      lignes[lignes.length - 1] = propre
      return lignes.join('\n')
    }
    // Republication plus courte de ce qui est déjà écrit : rien à faire.
    if (prolonge(propre, derniere)) return transcript
  }

  return transcript + '\n' + propre
}

/** Un résultat d'un événement de reconnaissance, mis à plat. */
export interface ResultatBrut {
  texte: string
  definitif: boolean
}

/** Un segment définitif à écrire, et s'il prolonge le précédent. */
export interface SegmentFinal {
  texte: string
  /** Vrai quand ce même résultat avait déjà été transmis, plus court. */
  suite: boolean
}

/**
 * Les segments définitifs encore jamais transmis, et le texte en cours.
 *
 * `transmis` porte la mémoire de l'écoute, par index de résultat, et se
 * complète au passage. C'est lui qui rend la fonction sûre face aux
 * navigateurs qui republient toute leur liste à chaque événement : un
 * résultat inchangé ne repart pas.
 *
 * Chaque résultat définitif garde sa propre entrée. Les fondre en une seule
 * chaîne, comme on l'a fait un temps, faisait disparaître les tours de
 * parole : la chaîne s'allongeait par la droite, appendSegment y voyait la
 * même phrase qui grandit, et une séance entière finissait sur une ligne.
 */
export function segmentsInedits(
  resultats: ResultatBrut[],
  transmis: string[],
): { finals: SegmentFinal[]; interim: string } {
  const finals: SegmentFinal[] = []
  let interim = ''
  for (let i = 0; i < resultats.length; i++) {
    const r = resultats[i]
    if (!r.definitif) {
      interim += r.texte
      continue
    }
    if (transmis[i] === r.texte) continue
    // Cet index avait déjà parlé : sa phrase s'allonge, elle ne recommence
    // pas. C'est la seule information qui distingue les deux cas, et elle
    // n'existe qu'ici.
    const suite = transmis[i] !== undefined
    transmis[i] = r.texte
    finals.push({ texte: r.texte, suite })
  }
  return { finals, interim }
}

export interface TranscriberHandlers {
  /**
   * Segment validé, à verser dans la transcription. `suite` est vrai quand il
   * prolonge celui qui vient d'être écrit — la même phrase, plus complète —
   * et faux quand c'est une nouvelle prise de parole.
   */
  onFinal(text: string, suite: boolean): void
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
  const Classe = recognizerClass()
  if (!Classe) return null
  // Capturée dans une constante non nullable : `construire` est appelée depuis
  // un rappel, où le rétrécissement de type ne survit pas.
  const Recognizer: SpeechRecognizerConstructor = Classe

  let recognizer: SpeechRecognizer | null = null
  let active = false
  let relance: number | null = null
  /** Horodatage du dernier démarrage, pour ne pas relancer en boucle chaude. */
  let demarre = 0

  /**
   * Un objet neuf à chaque écoute.
   *
   * Redémarrer celui qui vient de se terminer laisse sa liste de résultats en
   * place : le navigateur republie alors ce qui est déjà transcrit. Un objet
   * neuf repart d'une liste vide, ce qui est exactement ce qu'on veut après
   * une coupure — la transcription déjà écrite, elle, est gardée par l'écran.
   */
  function construire(): SpeechRecognizer {
    const r = new Recognizer()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = true

    /**
     * Ce qui a déjà été transmis, par index de résultat, pour CETTE écoute.
     *
     * C'est la pièce qui manquait. Concaténer tous les résultats définitifs
     * d'un événement en une seule chaîne paraissait prudent : sur un
     * navigateur qui republie toute sa liste, la chaîne s'allonge par la
     * droite, appendSegment y reconnaît la même prise de parole et remplace
     * la ligne — si bien qu'une séance entière finissait sur UNE ligne, et
     * que les tours de parole disparaissaient. Or c'est le seul indice de
     * tour de parole que l'API donne, et le modèle s'en sert.
     *
     * En gardant ce qui a été transmis, chaque résultat garde sa ligne, et
     * une republication à l'identique ne coûte rien. Le tableau est propre à
     * l'objet construit ici : une nouvelle écoute repart de zéro.
     */
    const transmis: string[] = []

    r.onresult = (event) => {
      // On lit toute la liste et non depuis `event.resultIndex` : sur Android
      // il reste à zéro pendant qu'elle s'allonge, et s'y fier ferait relire
      // des résultats déjà transmis. C'est `transmis` qui tranche.
      const resultats: ResultatBrut[] = []
      for (let i = 0; i < event.results.length; i++) {
        resultats.push({ texte: event.results[i][0].transcript, definitif: event.results[i].isFinal })
      }
      const { finals, interim } = segmentsInedits(resultats, transmis)
      for (const segment of finals) handlers.onFinal(segment.texte, segment.suite)
      if (interim) handlers.onInterim(interim)
    }

    r.onerror = (event) => handlers.onError(event.error)

    r.onend = () => {
      if (!active) return
      // Une écoute qui se termine aussitôt signale un micro qui refuse : on
      // espace les relances plutôt que de tourner à vide.
      const attente = Date.now() - demarre < 400 ? 700 : 0
      relance = window.setTimeout(() => {
        relance = null
        if (!active) return
        try {
          recognizer = construire()
          demarre = Date.now()
          recognizer.start()
        } catch {
          active = false
        }
      }, attente)
    }

    return r
  }

  return {
    start() {
      try {
        recognizer = construire()
        active = true
        demarre = Date.now()
        recognizer.start()
        return true
      } catch {
        recognizer = null
        active = false
        return false
      }
    },

    stop() {
      active = false
      if (relance !== null) {
        window.clearTimeout(relance)
        relance = null
      }
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
