import { describe, expect, it } from 'vitest'
import {
  SESSION_DRAFT_SYSTEM,
  hasSpeakerLabels,
  ligneEchelle,
  modulePrompt,
  profilePrompt,
  sessionDraftPrompt,
  sessionMaterial,
} from './prompts.js'
import type { PatientContext } from './schemas.js'

const DIALOGUE = 'Thérapeute : comment ça va ?\n\nCamille : mieux, mais jeudi…\n\nThérapeute : racontez-moi.'
const MICRO = 'comment ça va\nmieux mais jeudi\nracontez moi'

describe('hasSpeakerLabels', () => {
  it('reconnaît un dialogue étiqueté', () => {
    expect(hasSpeakerLabels(DIALOGUE)).toBe(true)
  })
  it('ne prend pas une dictée au micro pour un dialogue', () => {
    expect(hasSpeakerLabels(MICRO)).toBe(false)
  })
  it('un seul « Nom : » ne suffit pas', () => {
    expect(hasSpeakerLabels('Note : il pleut\nil fait froid')).toBe(false)
  })
})

describe('sessionDraftPrompt', () => {
  it('sans locuteurs, avertit le modèle sans pour autant lui interdire de relever', () => {
    const p = sessionDraftPrompt(MICRO, ['Détente'], false)
    expect(p).toContain('NE DISTINGUE PAS')
    // L'ancienne consigne ordonnait le vide faute d'attribution certaine : la
    // rubrique « les mots » ne se remplissait donc JAMAIS en production. On
    // demande maintenant les formulations marquantes, sans prétendre les
    // attribuer — une image forte reste réutilisable.
    expect(p).toContain('FORMULATIONS MARQUANTES')
    expect(p).toContain('ne cherche pas à attribuer')
    expect(p).not.toMatch(/rends un tableau VIDE/)
  })
  it('avec locuteurs, le prompt métier part tel quel', () => {
    const p = sessionDraftPrompt(DIALOGUE, ['Détente'], true)
    expect(p).not.toContain('NE DISTINGUE PAS')
  })
  it('ne demande plus d’induction : l’hypnose est une fonction à part', () => {
    expect(sessionDraftPrompt(DIALOGUE, ['Détente'])).not.toContain('"induction"')
  })
  it('les catégories d’audios sont citées telles quelles', () => {
    expect(sessionDraftPrompt('x', ['Détente', 'Sommeil'])).toContain('« Détente, Sommeil »')
  })
})

describe('sessionMaterial', () => {
  it('les notes priment et sont annoncées', () => {
    const m = sessionMaterial('transcription', 'note')
    expect(m.startsWith('transcription')).toBe(true)
    expect(m).toContain('à prendre en priorité')
    expect(m.endsWith('note')).toBe(true)
  })
  it('sans notes, la transcription seule', () => {
    expect(sessionMaterial(' t ', '')).toBe('t')
  })
})

/**
 * L'écran de séance annonce à la thérapeute ce que l'analyse va lui coûter,
 * avant qu'elle la lance. Ce calcul (src/lib/coutIA.ts) ne peut pas importer
 * les prompts — ils n'ont rien à faire dans le navigateur — il en garde donc
 * la taille en constante. Ce test la tient honnête : si les consignes
 * doublent, l'estimation devient fausse en silence, et c'est ici qu'on le
 * découvre.
 */
describe("le gabarit du prompt, tel que l'estimation le suppose", () => {
  it('reste proche des 2 402 caractères mesurés', () => {
    const categories = ['Détente', 'Sommeil', 'Ancrage', 'Confiance', 'Dépendance', 'Émotions']
    const gabarit = SESSION_DRAFT_SYSTEM.length + sessionDraftPrompt('', categories).length
    // ±20 % : de quoi retoucher une consigne sans faire échouer les tests,
    // pas de quoi laisser l'estimation dériver d'un facteur deux.
    expect(gabarit).toBeGreaterThan(2402 * 0.8)
    expect(gabarit).toBeLessThan(2402 * 1.2)
  })
})

/** Un dossier minimal, à la forme que le serveur accepte de lire. */
const dossier = (surcharge: Partial<PatientContext> = {}): PatientContext => ({
  name: 'Camille Laurent',
  program: 'Programme Liberté',
  subtitle: 'Arrêt du tabac',
  weekLabel: '3 séances sur 6',
  sessions: 3,
  totalSessions: 6,
  adherence: 67,
  scaleLabel: 'Envie de fumer',
  scaleQuestion: "Quelle a été la force de l'envie aujourd'hui ?",
  scaleDelta: '8 → 4 en 3 semaines',
  echelle: [
    { date: '2026-09-01', valeur: 8 },
    { date: '2026-09-21', valeur: 4 },
  ],
  modules: [],
  journal: [],
  shared: '',
  profile: { updated: '', portrait: '', axes: [], levers: [], care: [] },
  ...surcharge,
})

describe('propositions du brouillon : des tâches seulement', () => {
  it('n’annonce ni « Audio » ni « Échelle » comme type proposable', () => {
    const p = sessionDraftPrompt(DIALOGUE, ['Détente'])
    const types = p.slice(p.indexOf('"propositions"'), p.indexOf('"questions"'))
    expect(types).toContain('Exercice, Journal ou Écriture')
    expect(types).not.toMatch(/type vaut[^;]*Audio/)
    expect(types).not.toMatch(/type vaut[^;]*Échelle/)
  })
})

/**
 * L'échelle du soir dans les prompts.
 *
 * Le prompt du profil écrivait « Auto-évaluation suivie : Envie () » : l'écart
 * n'était jamais calculé, aucune note n'arrivait jusqu'au modèle.
 */
describe('ligneEchelle — les notes du soir, avec leur question', () => {
  it('cite l’écart, la question et les notes datées', () => {
    const ligne = ligneEchelle(dossier())
    expect(ligne).toContain('Envie de fumer (8 → 4 en 3 semaines)')
    expect(ligne).toContain("« Quelle a été la force de l'envie aujourd'hui ? »")
    expect(ligne).toContain('2026-09-01 : 8 · 2026-09-21 : 4')
  })

  it('n’écrit jamais de parenthèses vides', () => {
    const ligne = ligneEchelle(dossier({ scaleDelta: '', echelle: [] }))
    expect(ligne).not.toContain('()')
    expect(ligne).toContain("Aucune note du soir pour l'instant.")
  })

  it('une note sans date se cite par sa seule valeur', () => {
    expect(ligneEchelle(dossier({ echelle: [{ date: '', valeur: 6 }] }))).toContain('récente : 6.')
  })

  it('le profil la reprend, sans « () »', () => {
    const p = profilePrompt({ context: dossier({ scaleDelta: '' }), notes: '', synthese: '', transcript: '' })
    expect(p).not.toContain('()')
    expect(p).toContain('2026-09-21 : 4')
  })

  it('le module écrit pour quelqu’un la reprend aussi', () => {
    const p = modulePrompt({ intent: 'Un geste pour la pause de 10 h.', type: 'Exercice', quiz: false, context: dossier() })
    expect(p).toContain('Camille Laurent')
    expect(p).toContain('8 → 4 en 3 semaines')
  })

  it('le module cite les DERNIERS mots du journal, pas les plus anciens', () => {
    const journal = Array.from({ length: 8 }, (_, i) => ({ date: '', text: `entrée ${8 - i}` }))
    const p = modulePrompt({ intent: 'Un geste.', type: 'Exercice', quiz: false, context: dossier({ journal }) })
    expect(p).toContain('entrée 8')
    expect(p).not.toContain('entrée 1')
  })
})
