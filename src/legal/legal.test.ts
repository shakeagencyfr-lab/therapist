import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DELAI_PURGE_JOURS } from '@/lib/seance'
import { CHEMINS_RESERVES, slugDuChemin } from '@/lib/vitrine'
import { problemeIdentifiant } from '@/lib/identifiant'
import { PAGES_LEGALES as LIENS_DE_LA_VENTE } from '@/vente/contenu'
import { LIENS_LEGAUX, cheminLegal, pageLegaleDuChemin, type CleLegale } from './chemins'
import {
  LIBELLES_CITES,
  PAGES_LEGALES,
  VALIDE_JURIDIQUEMENT,
  champsACompleter,
  morceaux,
  revendicationsInterdites,
  textesDe,
} from './contenu'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8')
const texte = (cle: CleLegale) => textesDe(PAGES_LEGALES[cle]).join('\n')

/* ------------------------------------------------------------------ *
 * Les adresses
 * ------------------------------------------------------------------ */

describe('les adresses des pages légales', () => {
  it('se reconnaissent, avec ou sans barre finale, et rien d’autre', () => {
    expect(pageLegaleDuChemin('/confidentialite')).toBe('confidentialite')
    expect(pageLegaleDuChemin('/confidentialite/')).toBe('confidentialite')
    expect(pageLegaleDuChemin('/CGU')).toBe('conditions')
    expect(pageLegaleDuChemin('/mentions')).toBe('mentions')
    for (const autre of ['/', '', '/mon', '/connexion', '/cabinet-fontaine', '/e/cgu', '/cgu/mon', '/mentions-legales']) {
      expect(pageLegaleDuChemin(autre), autre).toBeNull()
    }
  })

  it('désignent chacune une page, et une seule', () => {
    const cles = LIENS_LEGAUX.map((l) => l.cle)
    expect(new Set(cles).size).toBe(cles.length)
    for (const l of LIENS_LEGAUX) {
      expect(cheminLegal(l.cle)).toBe(l.chemin)
      expect(PAGES_LEGALES[l.cle].chemin).toBe(l.chemin)
    }
  })

  /* La racine appartient aux cabinets : un mot qu'un cabinet pourrait
     prendre ferait de sa page une page légale, ou l'inverse. */
  it('sont des mots refusés aux cabinets, à l’écran et en base', () => {
    const contrainte =
      /add constraint cabinets_slug_forme check \(([\s\S]*?)\);/.exec(
        lire('supabase/migrations/0037_un_seul_identifiant.sql'),
      )?.[1] ?? ''
    for (const { chemin } of LIENS_LEGAUX) {
      const mot = chemin.slice(1)
      expect(CHEMINS_RESERVES.has(mot), mot).toBe(true)
      expect(problemeIdentifiant(mot), mot).toBeTruthy()
      expect(slugDuChemin(chemin), mot).toBeNull()
      expect(contrainte, mot).toContain(`'${mot}'`)
    }
  })

  /* Une page d'un seul segment est déjà servie par index.html, sous le refus
     d'encadrement : c'est ce qui dispense d'une réécriture à part. Si la
     règle change, ces pages tombent en 404 — ou deviennent encadrables. */
  it('sont servies par index.html, et refusent l’encadrement', () => {
    const config = JSON.parse(lire('vercel.json')) as {
      rewrites: Array<{ source: string; destination: string }>
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    }
    const motif = (source: string) => {
      const m = /^\/:\w+\((.+)\)$/.exec(source)
      return m ? new RegExp(`^/${m[1]}$`) : null
    }
    for (const { chemin } of LIENS_LEGAUX) {
      const reecrite = config.rewrites.some((r) => r.destination === '/index.html' && motif(r.source)?.test(chemin))
      expect(reecrite, `${chemin} n'est réécrite vers index.html`).toBe(true)
      const protegee = config.headers.some(
        (h) =>
          motif(h.source)?.test(chemin) &&
          h.headers.some((e) => e.key === 'Content-Security-Policy' && e.value.includes("frame-ancestors 'self'")) &&
          h.headers.some((e) => e.key === 'X-Frame-Options' && e.value === 'SAMEORIGIN'),
      )
      expect(protegee, `${chemin} peut être encadrée`).toBe(true)
    }
  })

  it('sont celles que la page de vente annonce', () => {
    expect(LIENS_DE_LA_VENTE.map((p) => p.chemin).sort()).toEqual(LIENS_LEGAUX.map((l) => l.chemin).sort())
  })

  /* Les pages s'ouvrent sans l'application : main.tsx les reconnaît AVANT
     de décider entre page de vente et application. */
  it('passent avant la page de vente et l’application', () => {
    const main = lire('src/main.tsx')
    const legal = main.indexOf("import('./legal/monter')")
    expect(legal).toBeGreaterThan(-1)
    expect(legal).toBeLessThan(main.indexOf("import('./vente/monter')"))
    expect(legal).toBeLessThan(main.indexOf("import('./application')"))
  })
})

/* ------------------------------------------------------------------ *
 * Les liens, sur chaque porte
 * ------------------------------------------------------------------ */

describe('les liens vers les pages légales', () => {
  it('sont posés sur la porte, l’espace patient, le widget et la vitrine', () => {
    for (const fichier of [
      'src/auth/SignIn.tsx',
      'src/patient/PatientSpace.tsx',
      'src/embed/EmbedSignIn.tsx',
      'src/views/vitrine/VitrinePage.tsx',
    ]) {
      const source = lire(fichier)
      expect(source, fichier).toMatch(/import \{ LiensLegaux \} from '@\/legal\/LiensLegaux'/)
      expect(source, fichier).toMatch(/<LiensLegaux\b/)
    }
  })

  /* Le widget est encadré par le site d'un cabinet : ses liens s'ouvrent
     hors du cadre. Personne ne doit l'y remettre par mégarde. */
  it('s’ouvrent hors du cadre depuis le widget', () => {
    const widget = lire('src/embed/EmbedSignIn.tsx')
    expect(widget).not.toMatch(/<LiensLegaux[^>]*nouvelOnglet=\{false\}/)
    const composant = lire('src/legal/LiensLegaux.tsx')
    expect(composant).toMatch(/nouvelOnglet = true/)
    expect(composant).toMatch(/target: '_blank', rel: 'noopener noreferrer'/)
  })

  /* Ce que les trois surfaces téléchargent pour poser trois liens : les
     chemins, pas le texte des pages. */
  it('ne tirent pas le texte des pages', () => {
    const composant = lire('src/legal/LiensLegaux.tsx')
    expect(composant).not.toMatch(/from '\.\/contenu'/)
    expect(lire('src/legal/chemins.ts')).not.toMatch(/^import /m)
  })
})

/* ------------------------------------------------------------------ *
 * Le contenu
 * ------------------------------------------------------------------ */

const SECTIONS: Record<CleLegale, string[]> = {
  confidentialite: [
    'en-bref',
    'roles',
    'donnees',
    'finalites',
    'destinataires',
    'transferts',
    'conservation',
    'securite',
    'droits',
    'navigateur',
    'modifications',
  ],
  conditions: [
    'objet',
    'service',
    'acces',
    'cabinet',
    'personnes-suivies',
    'analyse',
    'donnees',
    'disponibilite',
    'responsabilite',
    'propriete',
    'fin',
    'modifications',
    'droit',
  ],
  mentions: ['editeur', 'publication', 'hebergement', 'donnees', 'cabinets', 'propriete'],
}

describe('chaque page', () => {
  it('porte les sections attendues, dans l’ordre, avec un titre et du texte', () => {
    for (const cle of Object.keys(SECTIONS) as CleLegale[]) {
      const page = PAGES_LEGALES[cle]
      expect(page.sections.map((s) => s.id), cle).toEqual(SECTIONS[cle])
      for (const section of page.sections) {
        expect(section.titre.trim(), `${cle}#${section.id}`).not.toBe('')
        expect(section.blocs.length, `${cle}#${section.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('ne revendique aucune certification, et ne nomme aucun modèle d’analyse', () => {
    for (const cle of Object.keys(PAGES_LEGALES) as CleLegale[]) {
      expect(revendicationsInterdites(texte(cle)), cle).toEqual([])
      expect(texte(cle), cle).not.toMatch(/HDS\s+certifi/i)
    }
  })

  it('a un titre, une description et une ouverture', () => {
    for (const cle of Object.keys(PAGES_LEGALES) as CleLegale[]) {
      const page = PAGES_LEGALES[cle]
      expect(page.titre, cle).toBeTruthy()
      expect(page.description.length, cle).toBeGreaterThan(40)
      expect(page.chapo.length, cle).toBeGreaterThan(40)
    }
  })

  /* Tant que les documents ne sont pas validés, les crochets restent — et se
     voient. Validés, il n'en reste aucun : on ne déclare pas relu un document
     qui dit encore « à compléter ». */
  it('garde ses champs à compléter tant qu’elle n’est pas validée, et aucun après', () => {
    const champs = (Object.keys(PAGES_LEGALES) as CleLegale[]).flatMap((c) => champsACompleter(PAGES_LEGALES[c]))
    if (VALIDE_JURIDIQUEMENT) expect(champs).toEqual([])
    else expect(champs.length).toBeGreaterThan(0)
    for (const champ of champs) expect(champ).toMatch(/^\[À COMPLÉTER : \S[^\]]*\]$/)
  })
})

describe('la garde des revendications', () => {
  it('refuse une certification ou une conformité affirmée', () => {
    for (const phrase of [
      'Klaro est HDS certifié.',
      'Un hébergement certifié HDS.',
      'Hébergeur de données de santé agréé.',
      'Une solution conforme RGPD.',
      'Les brouillons sont rédigés par Claude.',
    ]) {
      expect(revendicationsInterdites(phrase), phrase).not.toEqual([])
    }
  })

  it('laisse dire qu’aucune certification n’est revendiquée', () => {
    expect(
      revendicationsInterdites('Aucune certification d’hébergeur de données de santé (HDS) n’est revendiquée.'),
    ).toEqual([])
  })
})

describe('la politique de confidentialité', () => {
  const t = texte('confidentialite')

  it('dit qui répond de quoi : le cabinet responsable, la plateforme sous-traitante', () => {
    expect(t).toMatch(/responsable du traitement/)
    expect(t).toMatch(/sous-traitant/)
    expect(t).toMatch(/article 28/)
  })

  it('dit où tournent la base et le serveur, et ce qui part aux États-Unis', () => {
    expect(t).toContain('eu-west-3')
    expect(t).toContain('cdg1')
    expect(t).toMatch(/Anthropic[\s\S]*États-Unis/)
    expect(t).toMatch(/Google pour Chrome, Microsoft pour Edge, Apple pour Safari/)
    expect(t).toMatch(/Stripe/)
    expect(t).toMatch(/serveur de messagerie du cabinet/)
    expect(t).toMatch(/notification/)
  })

  /* Les durées citées sont celles du code : si la purge change, le document
     doit changer avec elle. */
  it('cite la durée réelle de la purge des transcriptions', () => {
    expect(t).toContain(`${DELAI_PURGE_JOURS} jours`)
    expect(lire('supabase/migrations/0043_la_seance_se_referme.sql')).toContain(
      `interval '${DELAI_PURGE_JOURS} days'`,
    )
    expect(lire('server/push.ts')).toMatch(/TTL: 2 \* 3600/)
    expect(t).toMatch(/deux heures/)
  })

  /* « Masqué par défaut sur l'écran verrouillé » est une promesse du code
     (src/lib/discretion.ts, 0055) : si la règle s'inversait, la phrase
     deviendrait fausse. */
  it('ne promet la discrétion des rappels que parce que le code la tient', () => {
    expect(t).toMatch(/écran verrouillé, un rappel ne dit par défaut/)
    expect(lire('src/lib/discretion.ts')).toMatch(/tant qu'elle n'a rien choisi/)
  })

  it('dit comment exercer ses droits, avec les gestes qui existent', () => {
    expect(t).toMatch(/CNIL/)
    for (const libelle of Object.values(LIBELLES_CITES)) expect(t, libelle).toContain(libelle)
  })

  it('ne revendique aucune certification, et le dit', () => {
    expect(t).toMatch(/Aucune certification d’hébergeur de données de santé \(HDS\) n’est revendiquée/)
  })
})

/* Les libellés d'écran que les pages citent existent bel et bien : un bouton
   renommé laisserait la politique renvoyer à un geste introuvable. */
describe('les gestes cités', () => {
  it('existent à l’écran sous ces mots-là', () => {
    const ecrans = [
      'src/patient/MonCompte.tsx',
      'src/patient/PatientSpace.tsx',
      'src/views/therapist/ExportDossier.tsx',
    ]
      .map(lire)
      .join('\n')
    expect(ecrans).toContain(`label: '${LIBELLES_CITES.ongletPatient}'`)
    for (const cle of ['exportJournal', 'suppressionCompte', 'autresAppareils', 'exportDossier'] as const) {
      expect(ecrans, LIBELLES_CITES[cle]).toContain(LIBELLES_CITES[cle])
    }
  })
})

describe('les mentions légales', () => {
  it('laissent en évidence ce que le code ne peut pas savoir', () => {
    const champs = champsACompleter(PAGES_LEGALES.mentions).join('\n')
    if (VALIDE_JURIDIQUEMENT) return
    for (const attendu of [/raison sociale/, /SIREN/, /siège/, /directeur ou de la directrice de la publication/, /contact/]) {
      expect(champs).toMatch(attendu)
    }
  })

  it('nomment les hébergeurs et leur région', () => {
    const t = texte('mentions')
    expect(t).toMatch(/Vercel Inc\./)
    expect(t).toMatch(/Supabase, Inc\./)
    expect(t).toContain('cdg1')
    expect(t).toContain('eu-west-3')
  })
})

describe('morceaux', () => {
  it('isole les champs à compléter', () => {
    expect(morceaux('Éditeur : [À COMPLÉTER : raison sociale], à Paris.')).toEqual([
      { texte: 'Éditeur : ', aCompleter: false },
      { texte: '[À COMPLÉTER : raison sociale]', aCompleter: true },
      { texte: ', à Paris.', aCompleter: false },
    ])
  })

  it('rend un texte sans champ en un seul morceau, et un champ seul sans morceau vide', () => {
    expect(morceaux('Rien à compléter.')).toEqual([{ texte: 'Rien à compléter.', aCompleter: false }])
    expect(morceaux('[À COMPLÉTER : a][À COMPLÉTER : b]')).toEqual([
      { texte: '[À COMPLÉTER : a]', aCompleter: true },
      { texte: '[À COMPLÉTER : b]', aCompleter: true },
    ])
    expect(morceaux('')).toEqual([])
  })
})
