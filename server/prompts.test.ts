import { describe, expect, it } from 'vitest'
import {
  SESSION_DRAFT_SYSTEM,
  hasSpeakerLabels,
  sessionDraftPrompt,
  sessionMaterial,
} from './prompts.js'

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
