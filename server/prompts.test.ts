import { describe, expect, it } from 'vitest'
import { hasSpeakerLabels, sessionDraftPrompt, sessionMaterial } from './prompts.js'

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
  it('sans locuteurs, avertit le modèle et lui interdit d’attribuer', () => {
    const p = sessionDraftPrompt(MICRO, ['Détente'], false)
    expect(p).toContain('NE DISTINGUE PAS')
    expect(p).toContain('tableau VIDE')
  })
  it('avec locuteurs, le prompt métier part tel quel', () => {
    const p = sessionDraftPrompt(DIALOGUE, ['Détente'], true)
    expect(p).not.toContain('NE DISTINGUE PAS')
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
