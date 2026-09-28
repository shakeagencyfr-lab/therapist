import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les échecs des analyses, tels que les écrans les disent.
 *
 * Un écran ne s'éprouve pas dans Vitest ; on vérifie donc sur le texte ce
 * qui, cassé, ne se voit qu'au premier échec réel — c'est-à-dire devant une
 * praticienne dont la clé manque.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), '..')

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return sources(chemin)
    return /\.tsx?$/.test(nom) && !/\.test\.ts$/.test(nom) ? [chemin] : []
  })
}

const lire = (chemin: string) => readFileSync(join(src, chemin), 'utf8')

describe('les messages d’échec des analyses', () => {
  /* « La génération a échoué : ${message}. Réessayez. » enrobait une phrase
     du serveur qui finit déjà par un point (« …produit.. Réessayez. ») et
     invitait à réessayer quand c'est la clé qui manque. */
  it('ne sont jamais enrobés dans un gabarit « a échoué : … »', () => {
    const fautifs = [...sources(join(src, 'views')), ...sources(join(src, 'cabinet'))]
      .filter((chemin) => /a échoué : \$\{/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(src, chemin))
    expect(fautifs).toEqual([])
  })

  /* Un `catch {}` sans variable ne peut que jeter la cause. */
  it('gardent la cause dans les écrans de la fiche et de l’atelier', () => {
    for (const ecran of ['views/therapist/PsychProfile.tsx', 'views/therapist/Affirmations.tsx', 'views/atelier/AtelierView.tsx']) {
      const texte = lire(ecran)
      expect(texte, ecran).not.toMatch(/catch\s*\{/)
      expect(texte, ecran).toMatch(/messageDEchec\(/)
    }
  })
})

describe('le bilan d’une hypnose', () => {
  /* La fiche annonçait « écrite et conservée » sans regarder si la base
     l'avait reçue : les deux écrans passent par le même bilan. */
  it('passe par bilanHypnose dans les deux écrans qui en écrivent', () => {
    for (const ecran of ['views/therapist/HypnosesFiche.tsx', 'views/session/HypnoseCard.tsx']) {
      const texte = lire(ecran)
      expect(texte, ecran).toMatch(/bilanHypnose\(/)
      expect(texte, ecran).not.toMatch(/Hypnose écrite et conservée/)
    }
  })
})
