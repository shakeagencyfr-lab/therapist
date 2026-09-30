/**
 * Transcription en direct, par l'API Web Speech du navigateur.
 *
 * DEUX LIMITES, à connaître avant de s'appuyer dessus.
 *
 * 1. L'AUDIO SORT DU POSTE. Contrairement à ce que « API du navigateur »
 *    laisse croire, le son part chez l'éditeur du navigateur pour être
 *    transcrit : Google pour Chrome, Microsoft pour Edge, Apple pour Safari.
 *    La parole d'un patient en séance transite donc par un tiers avec qui le
 *    cabinet n'a aucun contrat. Le consentement le dit (src/data/session.ts),
 *    et dit aussi ce que nous garantissons : l'application ne reçoit que le
 *    texte, jamais le son. Le régler vraiment demande de capter l'audio
 *    localement et de le confier à un service de transcription sous contrat
 *    — pas de changer une ligne ici.
 *
 * 2. AUCUNE DIARISATION. La spécification n'a pas de notion de locuteur : ce
 *    module rend un flux de texte unique où la voix de la thérapeute et celle
 *    du patient sont fondues, sans marque. Le serveur le détecte
 *    (hasSpeakerLabels) et l'annonce au modèle, pour qu'il cesse d'attribuer
 *    au patient des phrases qu'il ne peut pas lui attribuer.
 *
 * Chrome, Edge et Safari proposent cette API ; ailleurs (Firefox), l'écran de
 * séance invite à écrire ses notes dans le champ prévu : elles suffisent à
 * rédiger le brouillon.
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

/**
 * Pourquoi une écoute s'est arrêtée sans qu'on le lui demande.
 *
 *   — `relance` : le navigateur a coupé et n'a pas voulu repartir. Safari
 *     refuse les relances qui ne suivent pas un geste, et un micro qui
 *     retombe aussitôt, plusieurs fois de suite, ne reviendra pas ;
 *   — `refus` : le micro est refusé ou absent (le code a été transmis à
 *     onError juste avant) ;
 *   — `remplacee` : une autre écoute a pris le micro.
 */
export type RaisonDeFin = 'relance' | 'refus' | 'remplacee'

/**
 * Qui écoute : la séance, ou un champ de texte.
 *
 * La séance passe avant tout : un champ ne lui prend jamais le micro, alors
 * qu'elle le reprend à n'importe quel champ.
 */
export type UsageEcoute = 'seance' | 'champ'

export interface TranscriberHandlers {
  /**
   * Segment validé, à verser dans la transcription. `suite` est vrai quand il
   * prolonge celui qui vient d'être écrit — la même phrase, plus complète —
   * et faux quand c'est une nouvelle prise de parole.
   */
  onFinal(text: string, suite: boolean): void
  /** Segment en cours de reconnaissance : il remplace le précédent. */
  onInterim(text: string): void
  /**
   * Code d'erreur de l'API, à traduire par l'appelant. Jamais `aborted` :
   * c'est un arrêt voulu, il n'y a rien à en dire.
   */
  onError(code: string): void
  /**
   * L'écoute s'est arrêtée pour de bon, sans que l'appelant ait appelé
   * stop(). Sans ce signal, l'écran continuait d'afficher « j'écoute » sur
   * un micro fermé.
   */
  onFin?(raison: RaisonDeFin): void
}

export interface Transcriber {
  /** Démarre l'écoute. Rend faux si le micro n'a pas pu démarrer. */
  start(): boolean
  stop(): void
}

/* UN SEUL MICRO À LA FOIS, pour toute la page.
 *
 * Deux reconnaissances ouvertes se disputent le micro : la seconde coupe la
 * première, qui se relance, qui coupe la seconde… Et chaque champ de texte a
 * désormais son bouton. Démarrer une écoute arrête donc celle qui tournait,
 * en le lui disant (onFin « remplacee ») — sauf la séance, qu'un champ ne
 * peut pas interrompre : ce serait la transcription d'une heure qui
 * s'arrêterait sur un clic de trop. */

interface Occupant {
  usage: UsageEcoute
  interrompre(): void
}

let occupant: Occupant | null = null
const abonnes = new Set<() => void>()

function annoncer(): void {
  for (const abonne of abonnes) abonne()
}

/** Qui tient le micro en ce moment, s'il est ouvert. */
export function ecouteEnCours(): UsageEcoute | null {
  return occupant?.usage ?? null
}

/** Être prévenu quand le micro change de mains. Rend de quoi se désabonner. */
export function abonnerEcoute(abonne: () => void): () => void {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

/**
 * Les erreurs après lesquelles relancer ne sert à rien : le micro est refusé
 * ou absent, et le restera. Relancer donnait une boucle d'erreurs toutes les
 * 700 ms, sous un écran qui affichait toujours « j'écoute ».
 */
const ERREURS_DEFINITIVES = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
])

/**
 * Combien de coupures immédiates d'affilée un champ tolère avant de s'arrêter.
 * La séance, elle, insiste sans limite : une coupure de réseau d'une minute
 * ne doit pas finir l'enregistrement d'une heure.
 */
const COUPURES_TOLEREES_CHAMP = 5

/**
 * Crée un transcripteur, ou rend null si le navigateur ne sait pas transcrire.
 *
 * Tant que l'enregistrement est actif, la reconnaissance est relancée à chaque
 * fin de segment : le navigateur la coupe régulièrement, une séance dure une
 * heure.
 *
 * `usage` dit qui écoute : la séance (par défaut) ou un champ de texte. Voir
 * plus haut, « un seul micro à la fois ».
 */
export function createTranscriber(
  handlers: TranscriberHandlers,
  usage: UsageEcoute = 'seance',
): Transcriber | null {
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
  /** Coupures immédiates d'affilée : un micro qui retombe aussitôt. */
  let coupures = 0

  const moi: Occupant = { usage, interrompre: () => terminer('remplacee') }

  /** Rend le micro, s'il était à nous, et le dit aux abonnés. */
  function liberer(): void {
    if (occupant !== moi) return
    occupant = null
    annoncer()
  }

  /** Arrête tout, sans prévenir l'appelant. */
  function couper(): void {
    active = false
    if (relance !== null) {
      window.clearTimeout(relance)
      relance = null
    }
    if (recognizer) {
      try {
        recognizer.stop()
      } catch {
        // L'objet est déjà arrêté : rien à faire.
      }
      recognizer = null
    }
    liberer()
  }

  /** L'écoute s'arrête d'elle-même : on coupe, et on le dit. */
  function terminer(raison: RaisonDeFin): void {
    if (!active) return
    couper()
    handlers.onFin?.(raison)
  }

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

    r.onerror = (event) => {
      /* « aborted » suit un arrêt voulu — le nôtre, ou celui d'une autre
         écoute qui a pris le micro : rien à en dire. Et une fois l'écoute
         arrêtée, ses dernières erreurs ne concernent plus personne. */
      if (event.error === 'aborted' || !active) return
      handlers.onError(event.error)
      if (ERREURS_DEFINITIVES.has(event.error)) terminer('refus')
    }

    r.onend = () => {
      // Un objet remplacé entre-temps n'a plus la main.
      if (!active || r !== recognizer) return
      // Une écoute qui se termine aussitôt signale un micro qui refuse : on
      // espace les relances plutôt que de tourner à vide.
      const immediate = Date.now() - demarre < 400
      coupures = immediate ? coupures + 1 : 0
      if (usage === 'champ' && coupures >= COUPURES_TOLEREES_CHAMP) {
        terminer('relance')
        return
      }
      relance = window.setTimeout(
        () => {
          relance = null
          if (!active) return
          try {
            recognizer = construire()
            demarre = Date.now()
            recognizer.start()
          } catch {
            // Safari refuse une relance qui ne suit pas un geste : l'écran
            // doit cesser d'afficher « j'écoute ».
            terminer('relance')
          }
        },
        immediate ? 700 : 0,
      )
    }

    return r
  }

  return {
    start() {
      // Un champ ne prend jamais le micro de la séance.
      if (usage === 'champ' && occupant && occupant !== moi && occupant.usage === 'seance') {
        return false
      }
      // Une écoute déjà ouverte ici repart de zéro, sans se prévenir.
      couper()
      // Celle d'un autre s'arrête, et le sait.
      if (occupant && occupant !== moi) occupant.interrompre()
      try {
        recognizer = construire()
        active = true
        demarre = Date.now()
        coupures = 0
        recognizer.start()
      } catch {
        recognizer = null
        active = false
        return false
      }
      occupant = moi
      annoncer()
      return true
    },

    stop() {
      couper()
    },
  }
}
