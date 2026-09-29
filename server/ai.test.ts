import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  AI_ROUTES,
  HttpError,
  briefDuModule,
  coutCentimes,
  currentMode,
  describeError,
  MODELE_ANALYSE,
  MODELE_DE_REPLI,
  profilCreux,
  reglageDe,
  rejouerLeRefus,
} from './ai.js'
import { modulePrompt } from './prompts.js'

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
    for (const route of ['session-draft', 'profile', 'module', 'hypnose'] as const) {
      expect(reglageDe(route)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
    }
  })

  it('l’effort n’est envoyé qu’aux modèles qui l’acceptent', () => {
    // Haiku 4.5 répond 400 à output_config.effort. Un effort posé là ferait
    // échouer l'appel au lieu de le rendre moins cher.
    expect(reglageDe('affirmations').effort).toBeUndefined()
    expect(reglageDe('session-draft').effort).toBe('high')
    expect(reglageDe('profile').effort).toBe('high')
    expect(reglageDe('module').effort).toBe('high')
    expect(reglageDe('hypnose').effort).toBe('high')
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
