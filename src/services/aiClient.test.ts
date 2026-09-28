import { describe, expect, it } from 'vitest'
import { initialState } from '@/state/state'
import type { AppState } from '@/state/state'
import { AiError, buildPatientContext, messageDEchec, messageDeLHebergeur } from './aiClient'

/** Une fiche réelle : des notes datées, un parcours qui mêle tâches, audio et échelle. */
function etatAvecFiche(): AppState {
  const camille = initialState.patients['camille']!
  return {
    ...initialState,
    extra: {},
    done: {},
    noteLog: {},
    patients: {
      ...initialState.patients,
      camille: {
        ...camille,
        scaleDelta: '8 → 4 en 3 semaines',
        mesures: Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, valeur: i % 11 })),
        modules: [
          { title: 'Trois respirations', meta: '', kind: 'Exercice', done: true },
          { title: 'Retour au calme', meta: '', kind: 'Audio', done: false },
          { title: 'Note du soir', meta: '', kind: 'Échelle', done: false },
          { title: 'Trois lignes', meta: '', kind: 'Écriture', done: false },
        ],
      },
    },
  }
}

describe('buildPatientContext — le dossier que l’IA relit', () => {
  it('ne cite que les tâches : un audio « non fait » n’est pas une leçon à tirer', () => {
    const c = buildPatientContext(etatAvecFiche(), 'camille')
    expect(c.modules).toEqual([
      { title: 'Trois respirations', done: true },
      { title: 'Trois lignes', done: false },
    ])
  })

  it('porte l’écart, la question du soir et les dernières notes datées', () => {
    const c = buildPatientContext(etatAvecFiche(), 'camille')
    expect(c.scaleDelta).toBe('8 → 4 en 3 semaines')
    expect(c.scaleQuestion).toBe(initialState.patients['camille']!.scaleQuestion)
    // Deux semaines de soirées, les plus récentes.
    expect(c.echelle).toHaveLength(14)
    expect(c.echelle.at(-1)).toEqual({ date: '2026-09-20', valeur: 19 % 11 })
  })

  it('en démonstration, la série sans dates suffit', () => {
    const c = buildPatientContext(initialState, 'camille')
    expect(c.echelle.length).toBeGreaterThan(0)
    expect(c.echelle.every((m) => m.date === '')).toBe(true)
  })

  it('les mots posés pendant la session passent devant le journal : du plus récent au plus ancien', () => {
    const etat = etatAvecFiche()
    etat.noteLog = { camille: [{ date: "Aujourd'hui", trigger: '', text: 'écrit à l’instant' }] }
    expect(buildPatientContext(etat, 'camille').journal[0]?.text).toBe('écrit à l’instant')
  })
})

/**
 * Ce que l'écran dit quand une analyse échoue.
 *
 * Le message du serveur est une phrase complète qui dit la cause et le
 * remède ; l'enrober dans « La génération a échoué : …. Réessayez. » lui
 * ajoutait un double point et envoyait réessayer une praticienne dont la
 * clé manque.
 */
describe('messageDEchec', () => {
  it('rend le message du serveur tel quel', () => {
    const serveur = "Ce cabinet n'a pas encore sa clé Anthropic : posez-la dans l'onglet Intégrations."
    expect(messageDEchec(new AiError(serveur), 'Repli.')).toBe(serveur)
  })

  it('le repli ne sert qu’à ce qui ne vient pas du serveur', () => {
    expect(messageDEchec(new TypeError('x is undefined'), 'Le module n’a pas pu être écrit.')).toBe(
      'Le module n’a pas pu être écrit.',
    )
    expect(messageDEchec(new AiError('   '), 'Repli.')).toBe('Repli.')
  })
})

describe('messageDeLHebergeur — quand l’hébergeur répond à la place du serveur', () => {
  it('un corps trop lourd dit quoi raccourcir', () => {
    expect(messageDeLHebergeur(413)).toMatch(/raccourcissez/)
  })

  it('une analyse coupée par le temps dit de relancer', () => {
    expect(messageDeLHebergeur(504)).toMatch(/relancez/)
  })

  it('le reste laisse la parole au repli de l’écran', () => {
    expect(messageDeLHebergeur(500)).toBeNull()
  })
})
