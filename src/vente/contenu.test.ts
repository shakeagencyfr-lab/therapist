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
  coutsIA,
  EDITEUR,
  ENSUITE,
  FONCTIONNALITES,
  MENTION_PRIX,
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

  it('ne tranchent pas entre hors taxes et toutes taxes comprises', () => {
    expect(MENTION_PRIX).toMatch(/indicatifs/)
    expect(MENTION_PRIX).toMatch(/à confirmer/)
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
    if (!EDITEUR.identite) expect(manque).toMatch(/EDITEUR.identite/)
  })

  it('nomme partout le même acteur commercial', () => {
    const textes = [...questions().map((q) => q.reponse), ...CONFIDENTIALITE.map((c) => c.texte), ...ENSUITE.map((e) => e.titre)]
    const tout = textes.join(' ')
    expect(tout).not.toMatch(/équipe commerciale|l’équipe qui (?:gère|a ouvert)/)
    expect(tout).toContain(EDITEUR.nom)
  })
})

describe('les pages légales', () => {
  it('sont celles que publie le chantier des pages légales', () => {
    expect(PAGES_LEGALES.map((p) => p.chemin).sort()).toEqual(['/cgu', '/confidentialite', '/mentions'])
  })
})

describe('ce que coûte l’IA', () => {
  it('se dit en euros, depuis le module qui l’estime à l’écran', () => {
    const c = coutsIA()
    for (const v of Object.values(c)) expect(v).toMatch(/^\d+,\d\d €$/)
    const faq = questions().find((q) => q.id === ANCRE_COUT_IA)
    expect(faq?.reponse).toContain(c.hypnose)
    expect(faq?.reponse).toContain('Anthropic')
  })

  /* L'estimation n'existe que dans RecordStep et HypnoseToggle : le profil,
     les consignes, les affirmations et la série du lundi n'en montrent
     aucune. La page ne promet donc pas « avant chaque analyse ». */
  it('ne promet l’estimation que là où l’écran la montre', () => {
    const faq = questions().find((q) => q.id === ANCRE_COUT_IA)?.reponse ?? ''
    expect(faq).not.toMatch(/avant chaque analyse/i)
    expect(faq).toMatch(/analyser une séance ou d’écrire une hypnose/)
    expect(faq).toMatch(/lundi/)
  })

  /* server/ai.ts n'a aucun repli : sans la clé du cabinet, rien ne se
     rédige. La page le dit là où l'on décide — l'essai, les offres, la note. */
  it('dit que la clé Anthropic du cabinet est nécessaire', () => {
    const essai = questions().find((q) => q.id === 'essai-deroulement')?.reponse ?? ''
    expect(essai).toMatch(/clé/)
    expect(essai).toMatch(/Réglages › Intégrations/)
    expect(essai).toMatch(/aucune note n’est rédigée/)
    expect(pointsDeLaNote().join(' ')).toMatch(/Sans clé Anthropic/)
    expect(ENSUITE.map((e) => e.texte).join(' ')).toMatch(/clé/)
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
