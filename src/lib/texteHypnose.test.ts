import { describe, expect, it } from 'vitest'
import { AiError, messageDEchec, pointDeReprise, type MouvementEcrit } from '@/services/aiClient'
import { bilanHypnose, corrigerTexte, libelleReprise, rangDuMouvement } from './texteHypnose'

const ecrit = (mouvement: MouvementEcrit['mouvement'], texte = 'Un texte.'): MouvementEcrit => ({
  mouvement,
  titre: `Titre ${mouvement}`,
  texte,
})

/**
 * Une hypnose s'écrit en quatre appels. Un échec au troisième laisse les
 * deux premiers en base : la reprise doit repartir du bon endroit, sans
 * repayer ce qui est acquis ni coudre la suite sur un trou.
 */
describe('pointDeReprise', () => {
  it('repart du début quand rien n’est écrit', () => {
    const { acquis, restants } = pointDeReprise([])
    expect(acquis).toEqual([])
    expect(restants).toEqual(['induction', 'approfondissement', 'travail', 'retour'])
  })

  it('garde les acquis et reprend au premier manquant', () => {
    const { acquis, restants } = pointDeReprise([ecrit('induction'), ecrit('approfondissement')])
    expect(acquis.map((e) => e.mouvement)).toEqual(['induction', 'approfondissement'])
    expect(restants).toEqual(['travail', 'retour'])
  })

  /* Les lignes de la base arrivent triées par rang, mais rien ne l'impose à
     l'appelant : l'ordre de la séance fait foi, pas celui de la liste. */
  it("suit l'ordre de la séance, pas celui de la liste", () => {
    const { acquis, restants } = pointDeReprise([ecrit('approfondissement'), ecrit('induction')])
    expect(acquis.map((e) => e.mouvement)).toEqual(['induction', 'approfondissement'])
    expect(restants).toEqual(['travail', 'retour'])
  })

  /* Un travail écrit sans son approfondissement reprendrait des images que
     la séance n'a pas posées : il se réécrit, à la suite. */
  it('ne coud pas la suite sur un trou', () => {
    const { acquis, restants } = pointDeReprise([ecrit('induction'), ecrit('travail')])
    expect(acquis.map((e) => e.mouvement)).toEqual(['induction'])
    expect(restants).toEqual(['approfondissement', 'travail', 'retour'])
  })

  it('tient un mouvement vide pour manquant', () => {
    const { restants } = pointDeReprise([ecrit('induction'), ecrit('approfondissement', '   ')])
    expect(restants[0]).toBe('approfondissement')
  })

  it('ne laisse rien à écrire quand les quatre sont là', () => {
    const tous = [ecrit('induction'), ecrit('approfondissement'), ecrit('travail'), ecrit('retour')]
    expect(pointDeReprise(tous).restants).toEqual([])
  })
})

describe('messageDEchec', () => {
  /* La phrase du serveur dit la cause et le remède ; la remplacer par
     « Réessayez » renvoyait en boucle une praticienne dont la clé manque. */
  it('rend le message du serveur tel quel', () => {
    const cle = "Ce cabinet n'a pas encore sa clé Anthropic : posez-la dans l'onglet Intégrations."
    expect(messageDEchec(new AiError(cle), 'Repli.')).toBe(cle)
  })

  it('se replie sur une phrase complète pour tout le reste', () => {
    expect(messageDEchec(new TypeError('x is undefined'), "L'hypnose n'a pas pu être écrite.")).toBe(
      "L'hypnose n'a pas pu être écrite.",
    )
    expect(messageDEchec(new AiError('   '), 'Repli.')).toBe('Repli.')
  })
})

describe('rangDuMouvement et libelleReprise', () => {
  it('numérote les mouvements de 1 à 4, comme la base', () => {
    expect(rangDuMouvement('induction')).toBe(1)
    expect(rangDuMouvement('retour')).toBe(4)
  })

  /* Rien d'écrit : ce n'est pas une reprise, c'est une relance. */
  it('dit « relancer » quand rien n’est acquis, « reprendre au mouvement N » sinon', () => {
    expect(libelleReprise('induction')).toBe("Relancer l'écriture")
    expect(libelleReprise('travail')).toBe('Reprendre au mouvement 3')
  })
})

describe('corrigerTexte', () => {
  it('garde le texte et ses paragraphes, sans les blancs invisibles', () => {
    expect(corrigerTexte('  Première ligne.  \r\nSeconde ligne.\t\r\n')).toEqual({
      ok: true,
      texte: 'Première ligne.\nSeconde ligne.',
    })
  })

  /* On ne lit pas un blanc à voix haute pendant sept minutes. */
  it('refuse un mouvement vide', () => {
    const r = corrigerTexte(' \n \n ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/ne peut pas rester vide/)
  })
})

describe('bilanHypnose', () => {
  const base = { fini: false, conservee: true, ecrits: 0, interrompue: false, reel: true }

  it('ne dit rien pendant l’écriture', () => {
    expect(bilanHypnose({ ...base, ecrits: 2 }, 'Marc')).toBeNull()
  })

  it('ne dit « conservée » que si la base l’a reçue', () => {
    expect(bilanHypnose({ ...base, fini: true, ecrits: 4 }, 'Marc')).toEqual({
      ton: 'ok',
      texte: 'Hypnose écrite et conservée dans le dossier de Marc.',
    })
    const perdue = bilanHypnose({ ...base, fini: true, ecrits: 4, conservee: false }, 'Marc')
    expect(perdue?.ton).toBe('warn')
    expect(perdue?.texte).toMatch(/pas conservée/)
    expect(perdue?.texte).toMatch(/Réessayez de l'enregistrer/)
  })

  it('ne promet aucun dossier en démonstration', () => {
    const demo = bilanHypnose({ ...base, fini: true, ecrits: 4, conservee: false, reel: false }, 'Marc')
    expect(demo?.ton).toBe('warn')
    expect(demo?.texte).toMatch(/démonstration/)
    expect(demo?.texte).not.toMatch(/dossier de Marc/)
  })

  /* L'écran restait figé sur deux coches : il dit maintenant ce qui est
     gardé, et d'où repartir. */
  it('après un échec, dit ce qui est gardé et d’où repartir', () => {
    const b = bilanHypnose({ ...base, interrompue: true, ecrits: 2 }, 'Marc')
    expect(b?.ton).toBe('neutre')
    expect(b?.texte).toMatch(/^2 mouvements écrits et conservés sur 4\./)
    expect(b?.texte).toMatch(/fiche de Marc/)
  })

  it('accorde au singulier', () => {
    const b = bilanHypnose({ ...base, interrompue: true, ecrits: 1 }, 'Marc')
    expect(b?.texte).toMatch(/^1 mouvement écrit et conservé sur 4\./)
  })

  it('alerte quand un mouvement écrit manque au dossier', () => {
    const b = bilanHypnose({ ...base, interrompue: true, ecrits: 3, conservee: false }, 'Marc')
    expect(b?.ton).toBe('warn')
    expect(b?.texte).toMatch(/pas tous conservés/)
  })

  it('propose de relancer quand rien n’a été écrit', () => {
    const b = bilanHypnose({ ...base, interrompue: true, ecrits: 0 }, 'Marc')
    expect(b?.texte).toMatch(/Aucun mouvement/)
  })
})
