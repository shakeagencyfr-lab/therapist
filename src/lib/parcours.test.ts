import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Consigne } from '@/types/domain'
import { consigneCorrigee, etapesDe } from './parcours'

const QUIZ: NonNullable<Consigne['quiz']> = [
  { question: 'Quand ?', options: ['Le matin', 'Le soir'], correct: 0, feedback: 'Le matin.' },
]

describe('les étapes, une par ligne', () => {
  it('ignore les lignes vides et les espaces autour', () => {
    expect(etapesDe('  Posez les pieds.\n\n   \nRespirez.  \n')).toEqual(['Posez les pieds.', 'Respirez.'])
    expect(etapesDe('')).toEqual([])
  })
})

describe('la consigne corrigée', () => {
  /* Le défaut d'origine : corriger le « pourquoi » effaçait le quiz. */
  it('garde le quiz qu’elle ne montre pas', () => {
    const avant: Consigne = { duree: '2 min', quand: 'Le matin', steps: ['A'], why: 'Parce que.', quiz: QUIZ }
    const apres = consigneCorrigee(avant, { duree: '3 min', quand: 'Le matin', why: 'Parce que, vraiment.', etapes: 'A\nB' })
    expect(apres.quiz).toEqual(QUIZ)
    expect(apres).toMatchObject({ duree: '3 min', steps: ['A', 'B'], why: 'Parce que, vraiment.' })
  })

  it('part de rien quand le module n’avait pas de consigne', () => {
    const apres = consigneCorrigee(undefined, { duree: ' ', quand: '', why: ' Pour dormir. ', etapes: 'Éteindre.' })
    expect(apres).toEqual({ duree: '', quand: '', steps: ['Éteindre.'], why: 'Pour dormir.' })
  })
})

/* Sur le texte : l'éditeur ne doit plus fabriquer sa consigne lui-même. S'il
   le refait, le quiz repart avec la prochaine correction. */
describe("l'éditeur de consigne", () => {
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const editeur = readFileSync(join(racine, 'src', 'views', 'therapist', 'ConsigneEditeur.tsx'), 'utf8')

  it('écrit à partir de la consigne existante', () => {
    expect(editeur).toMatch(/consigneCorrigee\(module\.consigne,/)
    expect(editeur).not.toMatch(/majConsigne\(/)
  })
})
