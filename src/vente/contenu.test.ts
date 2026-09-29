import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLANS } from '@/data/reseller'
import {
  CONFIDENTIALITE,
  coutsIA,
  FONCTIONNALITES,
  MENTION_PRIX,
  offres,
  PARCOURS,
  questions,
  SANS_LABEL,
} from './contenu'
import { MOTS_INTERDITS } from './garde'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('ce que la page promet', () => {
  /* Une fonctionnalité citée sans le fichier qui la porte est une promesse
     en l'air. Le jour où l'on retire un écran, cette épreuve le dit. */
  it('existe dans le code, fonctionnalité par fonctionnalité', () => {
    const manquantes = [...FONCTIONNALITES.flatMap((g) => g.fonctions), ...CONFIDENTIALITE]
      .filter((f) => !existsSync(join(racine, f.preuve)))
      .map((f) => `${f.titre} → ${f.preuve}`)
    expect(manquantes).toEqual([])
  })

  it('tient le parcours en quatre temps', () => {
    expect(PARCOURS).toHaveLength(4)
  })
})

describe('les offres de la page', () => {
  it('sont celles du catalogue, au même prix', () => {
    const affichees = offres()
    expect(affichees.map((o) => o.code)).toEqual(PLANS.map((p) => p.code))
    for (const p of PLANS) {
      const o = affichees.find((x) => x.code === p.code)
      expect(o?.prix, p.code).toBe(`${p.priceCents / 100} €`)
    }
  })

  /* Les prix réels de la table `plans`, relevés en base le 29 septembre 2026. */
  it('affichent 39, 79 et 149 € par mois, et leurs plafonds', () => {
    const [essentiel, cabinet, reseau] = offres()
    expect(essentiel?.prix).toBe('39 €')
    expect(cabinet?.prix).toBe('79 €')
    expect(reseau?.prix).toBe('149 €')
    expect(essentiel?.patients).toContain('25')
    expect(cabinet?.patients).toContain('80')
    expect(reseau?.patients).toMatch(/sans limite/)
  })

  it('ne tranchent pas entre hors taxes et toutes taxes comprises', () => {
    expect(MENTION_PRIX).toMatch(/indicatifs/)
    expect(MENTION_PRIX).toMatch(/à confirmer/)
  })
})

describe('ce que coûte l’IA', () => {
  it('se dit en euros, depuis le module qui l’estime à l’écran', () => {
    const c = coutsIA()
    for (const v of Object.values(c)) expect(v).toMatch(/^\d+,\d\d €$/)
    const faq = questions().find((q) => q.question.includes('IA'))
    expect(faq?.reponse).toContain(c.hypnose)
    expect(faq?.reponse).toContain('Anthropic')
  })
})

describe('les mots de la page', () => {
  const textes = [
    ...PARCOURS.flatMap((e) => [e.titre, e.texte, e.detail]),
    ...FONCTIONNALITES.flatMap((g) => [g.titre, g.intro, ...g.fonctions.flatMap((f) => [f.titre, f.texte])]),
    ...CONFIDENTIALITE.flatMap((e) => [e.titre, e.texte]),
    ...questions().flatMap((q) => [q.question, q.reponse]),
    ...offres().flatMap((o) => [o.nom, o.patients, ...o.lignes]),
    SANS_LABEL,
    MENTION_PRIX,
  ].join('\n')

  it('ne revendiquent ni label, ni témoignage, ni note', () => {
    for (const motif of MOTS_INTERDITS) expect(textes, String(motif)).not.toMatch(motif)
  })

  it('ne nomment aucun modèle d’IA', () => {
    expect(textes).not.toMatch(/\b(claude|opus|sonnet|haiku|gpt)\b/i)
  })

  it('disent la confidentialité telle qu’elle est', () => {
    expect(textes).toMatch(/Paris/)
    expect(textes).toMatch(/Anthropic, aux États-Unis/)
    expect(textes).toMatch(/éditeur/)
    expect(textes).toMatch(/consentement/)
    expect(textes).toMatch(/7 jours/)
    expect(textes).toMatch(/cloisonné/)
  })
})
