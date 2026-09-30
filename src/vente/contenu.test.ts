import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLANS } from '@/data/reseller'
import {
  aFournirAvantLaMiseEnLigne,
  ANCRE_COUT_IA,
  AUTRES_PRESTATAIRES,
  CONFIDENTIALITE,
  EDITEUR,
  encartJetons,
  ENSUITE,
  FONCTIONNALITES,
  JETONS_PAR_MOIS,
  MENTION_PRIX,
  MODALITES,
  offres,
  PAGES_LEGALES,
  PARCOURS,
  pointsDeLaNote,
  questions,
  SANS_LABEL,
} from './contenu'
import { MOTS_INTERDITS } from './garde'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('ce que la page promet', () => {
  /* Une fonctionnalité citée sans le fichier qui la porte est une promesse
     en l'air. Le jour où l'on retire un écran, cette épreuve le dit. */
  it('existe dans le code, fonctionnalité par fonctionnalité', () => {
    const manquantes = [
      ...FONCTIONNALITES.flatMap((g) => [...g.fonctions, ...g.aussi.map((a) => ({ titre: a.texte, preuve: a.preuve }))]),
      ...CONFIDENTIALITE,
    ]
      .filter((f) => !existsSync(join(racine, f.preuve)))
      .map((f) => `${f.titre} → ${f.preuve}`)
    expect(manquantes).toEqual([])
  })

  /* Trois par groupe : le parcours a déjà dit le reste, et dix-huit cartes
     redisaient le parcours. */
  it('tient chaque groupe de fonctionnalités en trois, et le reste en une ligne', () => {
    for (const g of FONCTIONNALITES) {
      expect(g.fonctions, g.titre).toHaveLength(3)
      expect(g.aussi.length, g.titre).toBeGreaterThan(0)
    }
  })

  /* server/droits.ts : un abonnement décide quatre choses — fiches,
     boutique, marque blanche, site. L'équipe n'en fait pas partie, et
     l'écran Équipe n'a aucune garde d'offre. */
  it('ne vend pas l’équipe comme propre à une offre', () => {
    const reseau = offres().find((o) => o.code === 'reseau')
    expect(reseau?.lignes.join(' ')).not.toMatch(/praticienne|thérapeutes|équipe/i)
    const equipe = FONCTIONNALITES.flatMap((g) => g.fonctions).find((f) => /Équipe/.test(f.titre))
    expect(equipe?.titre).toMatch(/toutes les offres/)
  })

  it('marque Cabinet d’un fait, jamais d’une préférence inventée', () => {
    const reperes = offres().map((o) => o.repere).filter(Boolean)
    expect(reperes).toEqual(['Votre domaine et votre site inclus'])
    expect(reperes.join(' ')).not.toMatch(/plus choisi|populaire|préféré|recommandé/i)
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

  it('se disent hors taxes, sans hésitation', () => {
    expect(MENTION_PRIX).toMatch(/hors taxes/)
    expect(MENTION_PRIX).not.toMatch(/à confirmer|indicatifs/)
  })

  /* L'éditrice est une micro-entreprise en franchise en base : ses
     factures portent la mention de l'article 293 B — et la page le dit
     comme les conditions de vente le disent, sans conditionnel. */
  it('disent la franchise de TVA', () => {
    expect(MENTION_PRIX).toMatch(/TVA non applicable, art\. 293 B du CGI/)
    expect(MENTION_PRIX).toMatch(/bénéficie de la franchise en base/)
    expect(MENTION_PRIX).not.toMatch(/Tant que/)
  })

  it('disent l’engagement et l’essai', () => {
    expect(MODALITES).toMatch(/sans engagement/)
    expect(MODALITES).toMatch(/fin du mois en cours/)
    expect(MODALITES).toMatch(/14 jours, sans carte bancaire/)
  })

  it('portent une apostrophe typographique', () => {
    expect(offres().flatMap((o) => o.lignes).join(' ')).not.toContain("'")
  })
})

describe('ce qui manque avant la mise en ligne', () => {
  /* Ce que le code ne sait pas ne s'invente pas : tant que ce n'est pas
     fourni, la liste le rappelle. */
  it('se dit, champ par champ', () => {
    const manque = aFournirAvantLaMiseEnLigne().join(' ; ')
    if (/à confirmer/.test(MENTION_PRIX)) expect(manque).toMatch(/MENTION_PRIX/)
    if (!EDITEUR.contact) expect(manque).toMatch(/EDITEUR.contact/)
  })

  /* Depuis le 30 septembre 2026, tout est fourni : l'adresse de contact est
     celle des pages légales, et il n'en existe pas d'autre. */
  it('ne manque plus de rien, et l’adresse est celle des pages légales', () => {
    expect(aFournirAvantLaMiseEnLigne()).toEqual([])
    expect(EDITEUR.contact).toBe('contact@klaroweb.site')
  })

  it('nomme partout le même acteur commercial', () => {
    const textes = [...questions().map((q) => q.reponse), ...CONFIDENTIALITE.map((c) => c.texte), ...ENSUITE.map((e) => e.titre)]
    const tout = textes.join(' ')
    expect(tout).not.toMatch(/équipe commerciale|l’équipe qui (?:gère|a ouvert)/)
    expect(tout).toContain(EDITEUR.nom)
  })

  /* Demande du 29 septembre : la page ne nomme que le logiciel, jamais la
     société qui l'exploite. */
  it('ne nomme que Klaro', () => {
    expect(EDITEUR.nom).toBe('Klaro')
    const tout = [
      ...questions().flatMap((q) => [q.question, q.reponse]),
      ...CONFIDENTIALITE.flatMap((c) => [c.titre, c.texte]),
      ...ENSUITE.flatMap((e) => [e.titre, e.texte]),
    ].join(' ')
    expect(tout).not.toMatch(/Shake/i)
  })
})

describe('les pages légales', () => {
  it('sont celles que publie le chantier des pages légales', () => {
    expect(PAGES_LEGALES.map((p) => p.chemin).sort()).toEqual(['/cgu', '/cgv', '/confidentialite', '/mentions'])
  })
})

describe('ce que coûte l’IA', () => {
  /* Une seule table pour les jetons du mois : chaque offre du catalogue y a
     sa ligne, et la page dit ce qu'elle dit. */
  it('dit les jetons inclus de chaque offre, et ce qu’ils représentent', () => {
    expect(Object.keys(JETONS_PAR_MOIS).sort()).toEqual(PLANS.map((p) => p.code).sort())
    expect(JETONS_PAR_MOIS).toEqual({ essentiel: 300, cabinet: 800, reseau: 2000 })
    const [essentiel, cabinet, reseau] = offres()
    expect(essentiel?.lignes.join(' ')).toMatch(/^300 jetons d’IA par mois, soit environ 25 séances/)
    expect(cabinet?.lignes.join(' ')).toContain('800 jetons d’IA par mois')
    expect(reseau?.lignes.join(' ')).toContain('2 000 jetons d’IA par mois')
    expect(reseau?.lignes.join(' ')).toMatch(/Option Hypnose incluse/)
    expect(essentiel?.lignes.join(' ')).not.toMatch(/Hypnose/)
  })

  it('se dit en jetons, avec le barème, les recharges et l’option Hypnose', () => {
    const faq = questions().find((q) => q.id === ANCRE_COUT_IA)?.reponse ?? ''
    expect(faq).toContain('Anthropic')
    for (const attendu of [
      /300 pour Essentiel, 800 pour Cabinet et 2 000 pour Réseau/,
      /séance complète en consomme environ 12/,
      /un module 5/,
      /hypnose de 30 minutes 50/,
      /100 jetons 12 €, 300 jetons 30 € et 1 000 jetons 85 € HT/,
      /valables douze mois/,
      /19 € HT pour 30 jours, avec 200 jetons/,
      /rien n’est débité si la rédaction échoue/,
      /ne se reportent pas/,
    ]) {
      expect(faq).toMatch(attendu)
    }
    const encart = encartJetons().texte
    expect(encart).toMatch(/affichés avant de lancer/)
    expect(encart).toMatch(/1 000 jetons 85 €/)
  })

  /* Le modèle a changé : plus de clé à ouvrir chez Anthropic ni à coller.
     La page ne doit plus l'exiger — ni promettre que Klaro ne prend rien. */
  it('ne demande plus de clé Anthropic au cabinet', () => {
    const essai = questions().find((q) => q.id === 'essai-deroulement')?.reponse ?? ''
    expect(essai).toMatch(/jetons/)
    expect(essai).not.toMatch(/Réglages › Intégrations/)
    const tout = [...questions().map((q) => q.reponse), ...pointsDeLaNote(), ...ENSUITE.map((e) => e.texte)].join(' ')
    expect(tout).not.toMatch(/ne prend rien dessus|colle sa clé|collez sa clé|avec la clé de votre cabinet/)
    expect(pointsDeLaNote().join(' ')).toMatch(/Sans jetons disponibles, l’espace patient et le suivi fonctionnent/)
    expect(ENSUITE.map((e) => e.texte).join(' ')).toMatch(/jetons/)
  })
})

describe('les mots de la page', () => {
  const textes = [
    ...PARCOURS.flatMap((e) => [e.titre, e.texte, e.detail]),
    ...FONCTIONNALITES.flatMap((g) => [
      g.titre,
      g.intro,
      ...g.fonctions.flatMap((f) => [f.titre, f.texte]),
      ...g.aussi.map((a) => a.texte),
    ]),
    ...CONFIDENTIALITE.flatMap((e) => [e.titre, e.texte]),
    ...questions().flatMap((q) => [q.question, q.reponse]),
    ...offres().flatMap((o) => [o.nom, o.patients, o.repere, ...o.lignes]),
    ...pointsDeLaNote(),
    ...ENSUITE.flatMap((e) => [e.titre, e.texte]),
    AUTRES_PRESTATAIRES,
    SANS_LABEL,
    MENTION_PRIX,
    MODALITES,
    encartJetons().titre,
    encartJetons().texte,
  ].join('\n')

  it('ne revendiquent ni label, ni témoignage, ni note', () => {
    for (const motif of MOTS_INTERDITS) expect(textes, String(motif)).not.toMatch(motif)
  })

  it('ne nomment aucun modèle d’IA', () => {
    expect(textes).not.toMatch(/\b(claude|opus|sonnet|haiku|gpt)\b/i)
  })

  /* La question se pose ; la réponse est non, et elle se dit. */
  it('répondent à la question HDS sans rien revendiquer', () => {
    const hds = questions().find((q) => q.id === 'hds')
    expect(hds?.reponse).toMatch(/^Non\./)
  })

  it('nomment les autres prestataires', () => {
    for (const nom of ['Stripe', 'Apple', 'Google', 'messagerie', 'hCaptcha']) expect(AUTRES_PRESTATAIRES).toContain(nom)
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
