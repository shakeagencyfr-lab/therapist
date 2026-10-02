import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  AI_ROUTES,
  HttpError,
  additionner,
  briefDuModule,
  contenuDeLaDemande,
  coutCentimes,
  currentMode,
  describeError,
  MODELE_ANALYSE,
  MODELE_DE_REPLI,
  profilCreux,
  reglageDe,
  rejouerLaPanne,
  rejouerLeRefus,
  usageDe,
} from './ai.js'
import { hypnosePrompt, hypnosePromptEnParties, modulePrompt, modulePromptEnParties, type HypnoseInput } from './prompts.js'

describe('coutCentimes — au tarif du modèle', () => {
  it('Opus 5 : 5 $ / 25 $ le million', () => {
    // 1 M en entrée + 1 M en sortie = 30 $ = 3000 centimes
    expect(coutCentimes('claude-opus-5', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(3000)
  })
  it('Opus 5.5 : 4 $ / 20 $ le million, 20 % de moins', () => {
    expect(coutCentimes('claude-opus-5-5', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(2400)
  })
  it('un appel ordinaire coûte des fractions de centime', () => {
    expect(coutCentimes('claude-opus-5', { input: 3000, output: 900 })).toBeCloseTo(3.75, 2)
  })
  it('modèle inconnu : tarif Opus, jamais zéro', () => {
    expect(coutCentimes('claude-inconnu', { input: 1000, output: 0 })).toBeGreaterThan(0)
  })
})

describe('reglageDe — le bon modèle et le bon effort par action', () => {
  it('le brouillon de séance garde Opus : c’est la pièce clinique', () => {
    expect(reglageDe('session-draft').model).toBe('claude-opus-5-5')
  })

  it('tout ce qui demande du jugement clinique reste sur Opus', () => {
    // La qualité prime sur le coût : ces textes sont lus par une praticienne
    // et, pour l'hypnose, lus à voix haute à quelqu'un.
    expect(reglageDe('profile').model).toBe('claude-opus-5-5')
    expect(reglageDe('module').model).toBe('claude-opus-5-5')
    expect(reglageDe('hypnose').model).toBe('claude-opus-5-5')
  })

  it('seules les affirmations descendent : sept phrases ne valent pas Opus', () => {
    expect(reglageDe('affirmations').model).toBe('claude-haiku-4-5')
  })

  it('aucun modèle n’est un identifiant fantaisiste', () => {
    // Un identifiant inconnu retomberait sur le tarif Opus sans rien dire, et
    // la facture du revendeur serait fausse dans le silence le plus complet.
    const TARIFS_PUBLIES: Record<string, number> = {
      'claude-opus-5-5': 2400,
      'claude-opus-5': 3000,
      'claude-sonnet-5': 1200,
      'claude-haiku-4-5': 600,
      'claude-fable-5-1': 6000,
    }
    for (const route of AI_ROUTES) {
      const { model } = reglageDe(route)
      const attendu = TARIFS_PUBLIES[model]
      expect(attendu, `tarif inconnu pour ${model}`).toBeDefined()
      expect(coutCentimes(model, { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(attendu as number)
    }
  })

  /* Opus 5.5 : l'effort par défaut est « medium », un cran sous Opus 5.
     Omis, il ferait réfléchir moins qu'avant sans que rien ne le dise. */
  it('l’effort est posé explicitement, jamais laissé au défaut du modèle', () => {
    for (const route of ['session-draft', 'profile', 'module', 'hypnose', 'revision'] as const) {
      // « medium » depuis le 2 octobre 2026 : posé, pas laissé au défaut du modèle.
      expect(reglageDe(route)).toEqual({ model: 'claude-opus-5-5', effort: 'medium' })
    }
  })

  it('l’effort n’est envoyé qu’aux modèles qui l’acceptent', () => {
    // Haiku 4.5 répond 400 à output_config.effort. Un effort posé là ferait
    // échouer l'appel au lieu de le rendre moins cher.
    expect(reglageDe('affirmations').effort).toBeUndefined()
    expect(reglageDe('session-draft').effort).toBe('medium')
    expect(reglageDe('profile').effort).toBe('medium')
    expect(reglageDe('module').effort).toBe('medium')
    expect(reglageDe('hypnose').effort).toBe('medium')
    expect(reglageDe('revision').effort).toBe('medium')
  })

  it('le mode courant nomme chaque action, pour le journal de démarrage', () => {
    const mode = currentMode()
    for (const route of AI_ROUTES) expect(mode).toContain(route)
  })
})

/**
 * Le profil creux.
 *
 * Constaté en production : un profil enregistré avec un portrait de 2 259
 * caractères et trois tableaux vides. Le modèle avait tout versé dans le
 * portrait ; la carte affichait « Comment l'accompagner » et « Points
 * d'attention » suivis de rien, et le profil complet de la version
 * précédente avait été remplacé par celui-là.
 *
 * Le schéma de sortie ne peut pas l'empêcher — les contraintes de
 * cardinalité sur un tableau ne font pas partie du sous-ensemble de JSON
 * Schema que l'API accepte, et le SDK les retire avant l'envoi. La
 * vérification est donc du code, et ce code se teste.
 */
describe('profilCreux — ce que le modèle a oublié', () => {
  const complet = { axes: [1, 2, 3, 4, 5], levers: [1, 2, 3, 4], care: [1] }

  it('ne signale rien sur un profil complet', () => {
    expect(profilCreux(complet)).toBe('')
  })

  it('nomme ce qui manque, dans la langue de la reprise', () => {
    expect(profilCreux({ ...complet, axes: [] })).toBe('les axes')
    expect(profilCreux({ ...complet, care: [] })).toBe("les points d'attention")
    expect(profilCreux({ axes: [], levers: [], care: [] })).toBe(
      "les axes, les leviers, les points d'attention",
    )
  })

  /* Le cas réel : les trois tableaux absents de la réponse, pas seulement
     vides. `undefined` doit compter comme manquant, sans lever. */
  it('traite une clé absente comme un tableau vide', () => {
    expect(profilCreux({})).toBe("les axes, les leviers, les points d'attention")
  })
})

/**
 * La route « module » et le dossier du patient.
 *
 * Le brief était recomposé champ par champ — intention, type, quiz — et le
 * contexte n'y était pas recopié : les consignes écrites après une séance
 * partaient avec le dossier de la personne, et l'IA écrivait un exercice de
 * manuel. Le brief se lit maintenant sans appel au modèle : on vérifie ici
 * que le dossier survit jusqu'au prompt.
 */
describe('briefDuModule — le dossier arrive jusqu’au prompt', () => {
  const INTENTION = 'Installer un geste d’ancrage à reprendre quand l’envie monte.'
  /** Un dossier tel qu'un onglet resté sur l'ancienne version l'envoie : sans échelle datée. */
  const DOSSIER = {
    name: 'Camille Laurent',
    program: 'Programme Liberté',
    subtitle: 'Arrêt du tabac',
    weekLabel: '3 séances sur 6',
    sessions: 3,
    totalSessions: 6,
    adherence: 67,
    scaleLabel: 'Envie de fumer',
    scaleDelta: '',
    modules: [{ title: 'Trois respirations', done: true }],
    journal: [{ date: 'lundi 7 sept.', text: 'La pause de 10 h a été la plus dure.' }],
    shared: '',
    profile: { updated: '', portrait: 'Avance par petites victoires.', axes: [], levers: [], care: [] },
  }

  it('garde le dossier, et le prompt écrit pour la personne', () => {
    const brief = briefDuModule({ intent: INTENTION, type: 'Exercice', quiz: false, context: DOSSIER })
    expect(brief.context?.name).toBe('Camille Laurent')
    const prompt = modulePrompt(brief)
    expect(prompt).toContain('Camille Laurent')
    expect(prompt).toContain('Avance par petites victoires.')
    expect(prompt).toContain('La pause de 10 h a été la plus dure.')
  })

  it('sans dossier, un module générique : l’atelier en fabrique aussi', () => {
    const brief = briefDuModule({ intent: INTENTION, type: 'Journal' })
    expect(brief.context).toBeUndefined()
    expect(brief.quiz).toBe(true)
    expect(modulePrompt(brief)).not.toContain('Personne :')
  })

  it('complète un dossier ancien plutôt que de lever au milieu du prompt', () => {
    const brief = briefDuModule({ intent: INTENTION, type: 'Exercice', context: DOSSIER })
    expect(brief.context?.echelle).toEqual([])
    expect(brief.context?.scaleQuestion).toBe('')
  })

  it('refuse un dossier d’un mauvais type, en le disant', () => {
    expect(() =>
      briefDuModule({ intent: INTENTION, type: 'Exercice', context: { ...DOSSIER, modules: 'trois' } }),
    ).toThrow(/Rechargez la page/)
  })

  it('refuse d’écrire la consigne d’un module qui ne se fait pas', () => {
    for (const type of ['Audio', 'Échelle']) {
      let erreur: unknown
      try {
        briefDuModule({ intent: INTENTION, type, context: DOSSIER })
      } catch (e) {
        erreur = e
      }
      expect(erreur, type).toBeInstanceOf(HttpError)
      expect((erreur as HttpError).status).toBe(400)
    }
  })

  it('refuse un type inconnu, un brief vide et un brief démesuré', () => {
    expect(() => briefDuModule({ intent: INTENTION, type: 'Podcast' })).toThrow(/n'existe pas/)
    expect(() => briefDuModule({ intent: 'court' })).toThrow(/une phrase ou deux/)
    expect(() => briefDuModule({ intent: 'x'.repeat(5000) })).toThrow(/trop long/)
  })
})

/**
 * Ce que l'écran lit quand le service d'analyse refuse.
 *
 * « Réessayez » n'a de sens que pour une panne passagère. Un refus de la
 * demande échouera pareil au prochain essai : le dire autrement.
 */
describe('describeError — un message qui dit quoi faire', () => {
  const erreur = (status: number) => Anthropic.APIError.generate(status, undefined, 'x', new Headers())

  it('une panne du service invite à réessayer', () => {
    expect(describeError(erreur(529))).toEqual({
      status: 502,
      message: "Le service d'analyse est momentanément saturé. Réessayez dans un instant.",
    })
    expect(describeError(erreur(500)).message).toMatch(/Réessayez dans un instant/)
  })

  it('un refus de la demande ne renvoie pas tourner en rond', () => {
    const { status, message } = describeError(erreur(400))
    expect(status).toBe(400)
    expect(message).not.toMatch(/Réessayez/)
    expect(message).toMatch(/Rien n'a été produit/)
  })

  it('une HttpError passe telle quelle', () => {
    expect(describeError(new HttpError(400, 'Le brief est trop long.'))).toEqual({
      status: 400,
      message: 'Le brief est trop long.',
    })
  })
})

/* Opus 5.5 a des filtres plus larges qu'Opus 5 : un faux positif ne doit pas
   devenir une panne. Le refus est rejoué une fois, sur Opus 5. */
describe('rejouerLeRefus — un refus du modèle d’analyse se rejoue une fois', () => {
  it('rejoue un refus d’Opus 5.5 sur Opus 5', () => {
    expect(MODELE_ANALYSE).toBe('claude-opus-5-5')
    expect(MODELE_DE_REPLI).toBe('claude-opus-5')
    expect(rejouerLeRefus('claude-opus-5-5', 'bio')).toBe(true)
    expect(rejouerLeRefus('claude-opus-5-5', null)).toBe(true)
  })

  it('ne rejoue ni l’extraction du raisonnement, ni un autre modèle, ni le repli lui-même', () => {
    expect(rejouerLeRefus('claude-opus-5-5', 'reasoning_extraction')).toBe(false)
    expect(rejouerLeRefus('claude-haiku-4-5', 'cyber')).toBe(false)
    expect(rejouerLeRefus('claude-opus-5', 'bio')).toBe(false)
  })
})

/* Le jour de la bascule, Opus 5.5 répondait 503 à la clé d'un cabinet : la
   praticienne restait sans brouillon alors qu'Opus 5 répondait. */
describe('rejouerLaPanne — une panne du modèle d’analyse se rejoue sur Opus 5', () => {
  it('rejoue l’indisponibilité, la saturation, le débit et le modèle introuvable', () => {
    for (const statut of [503, 500, 529, 429, 404]) {
      expect({ [statut]: rejouerLaPanne('claude-opus-5-5', statut) }).toEqual({ [statut]: true })
    }
  })

  it('ne rejoue ni une clé refusée, ni une demande mal formée, ni un autre modèle', () => {
    for (const statut of [400, 401, 403]) {
      expect({ [statut]: rejouerLaPanne('claude-opus-5-5', statut) }).toEqual({ [statut]: false })
    }
    expect(rejouerLaPanne('claude-opus-5', 503)).toBe(false)
    expect(rejouerLaPanne('claude-haiku-4-5', 503)).toBe(false)
    expect(rejouerLaPanne('claude-opus-5-5', undefined)).toBe(false)
  })
})

describe('le cache du contexte répété (2 octobre 2026)', () => {
  it('prix : l’écriture du cache à 1,25 fois l’entrée, la relecture au vingtième sur Opus 5.5', () => {
    // Un million de jetons de chaque sorte, en centimes : 4 $ l'entrée, 5 $ l'écriture, 0,20 $ la relecture.
    expect(coutCentimes('claude-opus-5-5', { input: 0, output: 0, cacheEcrit: 1_000_000 })).toBeCloseTo(500)
    expect(coutCentimes('claude-opus-5-5', { input: 0, output: 0, cacheLu: 1_000_000 })).toBeCloseTo(20)
    // Ailleurs, la relecture vaut le dixième de l'entrée.
    expect(coutCentimes('claude-sonnet-5-5', { input: 0, output: 0, cacheLu: 1_000_000 })).toBeCloseTo(20)
    expect(coutCentimes('claude-haiku-4-5', { input: 0, output: 0, cacheLu: 1_000_000 })).toBeCloseTo(10)
  })

  it('lit l’usage d’une réponse, cache compris, et additionne deux appels', () => {
    const u = usageDe({ input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: null })
    expect(u).toEqual({ input: 10, output: 20, cacheEcrit: 30, cacheLu: 0 })
    expect(additionner(u, { input: 1, output: 2, cacheLu: 5 })).toEqual({ input: 11, output: 22, cacheEcrit: 30, cacheLu: 5 })
  })

  it('sans début répété, la demande reste une chaîne — aucun point de cache', () => {
    expect(contenuDeLaDemande(undefined, 'bonjour')).toBe('bonjour')
    expect(contenuDeLaDemande([], 'bonjour')).toBe('bonjour')
    expect(contenuDeLaDemande([''], 'bonjour')).toBe('bonjour')
  })

  it('avec un début répété, un seul point de cache, sur sa dernière partie, et le même texte', () => {
    const blocs = contenuDeLaDemande(['dossier', ' puis le premier mouvement'], ' et la consigne')
    expect(Array.isArray(blocs)).toBe(true)
    const liste = blocs as Anthropic.TextBlockParam[]
    expect(liste.map((b) => b.text).join('')).toBe('dossier puis le premier mouvement et la consigne')
    expect(liste.filter((b) => b.cache_control).length).toBe(1)
    expect(liste[1]?.cache_control).toEqual({ type: 'ephemeral' })
    expect(liste[2]?.cache_control).toBeUndefined()
  })

  const contexte = {
    name: 'Camille',
    program: 'Liberté',
    weekLabel: 'Semaine 3 sur 6',
    adherence: 86,
    subtitle: 'Arrêter de fumer',
    scaleLabel: 'Envie',
    echelle: [],
    profile: { portrait: 'Tendue après les appels de sa sœur.', levers: [], axes: [], care: [] },
    modules: [],
    journal: [],
    shared: '',
  } as unknown as Parameters<typeof modulePrompt>[0]['context']

  it('le module coupé en deux dit mot pour mot ce que disait le module d’une pièce', () => {
    for (const brief of [
      { intent: 'Ancrage du souffle après un appel', type: 'Exercice', quiz: false, context: contexte },
      { intent: 'Un module générique', type: 'Exercice', quiz: true },
    ] as Array<Parameters<typeof modulePrompt>[0]>) {
      const { prefixe, suite } = modulePromptEnParties(brief)
      expect(prefixe.join('') + suite).toBe(modulePrompt(brief))
    }
    // Les consignes d'une même séance partagent leur début : c'est lui que le cache relit.
    const a = modulePromptEnParties({ intent: 'Un', type: 'Exercice', quiz: false, context: contexte })
    const b = modulePromptEnParties({ intent: 'Deux', type: 'Écriture', quiz: false, context: contexte })
    expect(a.prefixe).toEqual(b.prefixe)
    expect(a.prefixe.length).toBe(1)
  })

  it('le mouvement coupé en parties dit mot pour mot ce qu’il disait, et chaque mouvement reprend le début du précédent', () => {
    const base: HypnoseInput = {
      context: null,
      mots: [],
      themes: [],
      synthese: '',
      intention: 'Retrouver un sommeil profond et réparateur',
      precedents: [],
    }
    const t1 = 'Installez-vous confortablement.'
    const t2 = 'Plus loin, plus profond.'
    const second = { ...base, precedents: [{ mouvement: 'induction' as const, texte: t1 }] }
    const troisieme = {
      ...base,
      precedents: [
        { mouvement: 'induction' as const, texte: t1 },
        { mouvement: 'approfondissement' as const, texte: t2 },
      ],
    }
    for (const [m, input] of [
      ['induction', base],
      ['approfondissement', second],
      ['travail', troisieme],
    ] as const) {
      const { prefixe, suite } = hypnosePromptEnParties(m, input)
      expect(prefixe.join('') + suite).toBe(hypnosePrompt(m, input))
    }
    const p2 = hypnosePromptEnParties('approfondissement', second).prefixe
    const p3 = hypnosePromptEnParties('travail', troisieme).prefixe
    // Le troisième relit le début du deuxième tel quel, plus un mouvement.
    expect(p3.slice(0, p2.length)).toEqual(p2)
    expect(p3.length).toBe(p2.length + 1)
  })
})
