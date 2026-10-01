import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  abonnerEcoute,
  appendSegment,
  createTranscriber,
  ecouteEnCours,
  type RaisonDeFin,
  type TranscriberHandlers,
  type UsageEcoute,
} from './speech'

/**
 * Un seul micro à la fois, et un écran qui sait quand il s'est refermé.
 *
 * Chaque champ de la praticienne a maintenant son micro : sans arbitre, deux
 * reconnaissances se disputaient le micro, et un champ pouvait couper la
 * transcription d'une séance d'une heure. Et un micro refermé par le
 * navigateur laissait l'écran afficher « j'écoute ».
 *
 * La reconnaissance du navigateur est remplacée par une fausse, qu'on
 * pilote : démarrer, finir, échouer.
 */

class FausseReconnaissance {
  static instances: FausseReconnaissance[] = []
  static refuser = false
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  arretee = false
  constructor() {
    FausseReconnaissance.instances.push(this)
  }
  start() {
    if (FausseReconnaissance.refuser) throw new Error('relance refusée')
  }
  stop() {
    this.arretee = true
  }
}

const derniere = () => FausseReconnaissance.instances[FausseReconnaissance.instances.length - 1]

function ecoute(usage: UsageEcoute) {
  const fins: RaisonDeFin[] = []
  const erreurs: string[] = []
  const handlers: TranscriberHandlers = {
    onFinal: () => {},
    onInterim: () => {},
    onError: (code) => erreurs.push(code),
    onFin: (raison) => fins.push(raison),
  }
  const transcripteur = createTranscriber(handlers, usage)
  if (!transcripteur) throw new Error('la fausse reconnaissance devait suffire')
  return { transcripteur, fins, erreurs }
}

beforeEach(() => {
  vi.useFakeTimers()
  FausseReconnaissance.instances = []
  FausseReconnaissance.refuser = false
  vi.stubGlobal('window', {
    SpeechRecognition: FausseReconnaissance,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('un seul micro à la fois', () => {
  it('ouvrir un champ referme celui qui écoutait, en le lui disant', () => {
    const a = ecoute('champ')
    const b = ecoute('champ')
    expect(a.transcripteur.start()).toBe(true)
    const premiere = derniere()
    expect(b.transcripteur.start()).toBe(true)

    expect(premiere.arretee).toBe(true)
    expect(a.fins).toEqual(['remplacee'])
    expect(b.fins).toEqual([])
    expect(ecouteEnCours()).toBe('champ')

    b.transcripteur.stop()
    expect(ecouteEnCours()).toBeNull()
    // Arrêté par son propriétaire : rien à lui annoncer.
    expect(b.fins).toEqual([])
  })

  it('un champ ne prend jamais le micro de la séance', () => {
    const seance = ecoute('seance')
    const champ = ecoute('champ')
    seance.transcripteur.start()

    expect(champ.transcripteur.start()).toBe(false)
    expect(seance.fins).toEqual([])
    expect(ecouteEnCours()).toBe('seance')
    seance.transcripteur.stop()
    expect(ecouteEnCours()).toBeNull()
  })

  it('la séance reprend le micro à un champ', () => {
    const champ = ecoute('champ')
    const seance = ecoute('seance')
    champ.transcripteur.start()
    seance.transcripteur.start()

    expect(champ.fins).toEqual(['remplacee'])
    expect(ecouteEnCours()).toBe('seance')
    seance.transcripteur.stop()
  })

  it('prévient les abonnés quand le micro change de mains', () => {
    const vu: Array<string | null> = []
    const desabonner = abonnerEcoute(() => vu.push(ecouteEnCours()))
    const seance = ecoute('seance')
    seance.transcripteur.start()
    seance.transcripteur.stop()
    desabonner()
    seance.transcripteur.start()
    seance.transcripteur.stop()
    expect(vu).toEqual(['seance', null])
  })
})

describe('les fins et les erreurs', () => {
  it('tait « aborted » : c’est un arrêt voulu', () => {
    const champ = ecoute('champ')
    champ.transcripteur.start()
    derniere().onerror?.({ error: 'aborted' })
    expect(champ.erreurs).toEqual([])
    champ.transcripteur.stop()
  })

  it('s’arrête pour de bon sur un micro refusé, sans relancer en boucle', () => {
    const seance = ecoute('seance')
    seance.transcripteur.start()
    const r = derniere()
    r.onerror?.({ error: 'not-allowed' })
    r.onend?.()
    vi.runAllTimers()

    expect(seance.erreurs).toEqual(['not-allowed'])
    expect(seance.fins).toEqual(['refus'])
    expect(FausseReconnaissance.instances).toHaveLength(1)
    expect(ecouteEnCours()).toBeNull()
  })

  it('transmet un silence sans s’arrêter : l’appelant décide', () => {
    const champ = ecoute('champ')
    champ.transcripteur.start()
    derniere().onerror?.({ error: 'no-speech' })
    expect(champ.erreurs).toEqual(['no-speech'])
    expect(champ.fins).toEqual([])
    expect(ecouteEnCours()).toBe('champ')
    champ.transcripteur.stop()
  })

  it('tait les erreurs qui arrivent après l’arrêt', () => {
    const champ = ecoute('champ')
    champ.transcripteur.start()
    const r = derniere()
    champ.transcripteur.stop()
    r.onerror?.({ error: 'network' })
    expect(champ.erreurs).toEqual([])
  })

  it('relance après une coupure ordinaire du navigateur', () => {
    const seance = ecoute('seance')
    seance.transcripteur.start()
    vi.advanceTimersByTime(5000)
    derniere().onend?.()
    vi.runOnlyPendingTimers()
    expect(FausseReconnaissance.instances).toHaveLength(2)
    expect(seance.fins).toEqual([])
    seance.transcripteur.stop()
  })

  /* Safari refuse de relancer hors d'un geste : l'écran affichait
     « j'écoute » sur un micro fermé. */
  it('dit la fin quand la relance est refusée', () => {
    const champ = ecoute('champ')
    champ.transcripteur.start()
    vi.advanceTimersByTime(5000)
    FausseReconnaissance.refuser = true
    derniere().onend?.()
    vi.runOnlyPendingTimers()
    expect(champ.fins).toEqual(['relance'])
    expect(ecouteEnCours()).toBeNull()
  })

  it('un champ dont le micro retombe aussitôt, cinq fois, s’arrête', () => {
    const champ = ecoute('champ')
    champ.transcripteur.start()
    for (let i = 0; i < 5; i++) {
      derniere().onend?.()
      vi.advanceTimersByTime(700)
    }
    expect(champ.fins).toEqual(['relance'])
    expect(FausseReconnaissance.instances).toHaveLength(5)
    expect(ecouteEnCours()).toBeNull()
  })

  it('la séance, elle, insiste', () => {
    const seance = ecoute('seance')
    seance.transcripteur.start()
    for (let i = 0; i < 8; i++) {
      derniere().onend?.()
      vi.advanceTimersByTime(700)
    }
    expect(seance.fins).toEqual([])
    expect(FausseReconnaissance.instances).toHaveLength(9)
    seance.transcripteur.stop()
  })
})

/** Un événement de reconnaissance tel que le navigateur le livre. */
function evenement(definitifs: string[]) {
  const results = definitifs.map((transcript) => Object.assign([{ transcript }], { isFinal: true }))
  return { resultIndex: 0, results }
}

describe('la séance sur un téléphone Android', () => {
  function seance(userAgent: string) {
    vi.stubGlobal('navigator', { userAgent })
    let transcript = ''
    const t = createTranscriber({
      onFinal: (texte, suite) => {
        transcript = appendSegment(transcript, texte, suite)
      },
      onInterim: () => {},
      onError: () => {},
    })
    if (!t) throw new Error('la fausse reconnaissance devait suffire')
    t.start()
    const versions = ['bonjour', 'bonjour', 'bonjour je', 'bonjour je viens', 'bonjour je viens', 'bonjour je viens de parler']
    for (let n = 1; n <= versions.length; n++) derniere().onresult?.(evenement(versions.slice(0, n)))
    t.stop()
    return transcript
  }

  it('écrit la phrase une fois, sur une ligne', () => {
    expect(seance('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe(
      'bonjour je viens de parler',
    )
  })

  it('un ordinateur garde la règle de l’index, inchangée', () => {
    const t = seance('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36')
    expect(t.split('\n').length).toBeGreaterThan(1)
  })
})
