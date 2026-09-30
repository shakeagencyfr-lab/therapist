import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DELAI_PURGE_JOURS } from '@/lib/seance'
import { MENTION_IA } from '@/lib/transparenceIA'
import { CHEMINS_RESERVES, slugDuChemin } from '@/lib/vitrine'
import { problemeIdentifiant } from '@/lib/identifiant'
import { PAGES_LEGALES as LIENS_DE_LA_VENTE } from '@/vente/contenu'
import { LIENS_LEGAUX, cheminLegal, liensLegauxPour, pageLegaleDuChemin, type CleLegale } from './chemins'
import {
  LIBELLES_CITES,
  MISE_A_JOUR,
  PAGES_LEGALES,
  VALIDE_JURIDIQUEMENT,
  champsACompleter,
  morceaux,
  revendicationsInterdites,
  textesDe,
} from './contenu'
import {
  ADRESSE,
  COURRIEL,
  EDITRICE,
  SIREN,
  SIRET,
  TELEPHONE,
  TVA_INTRACOMMUNAUTAIRE,
} from './identite'
import { FORME_DE_VERSION, MISE_A_JOUR as VERSION } from './version'

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
    expect(pageLegaleDuChemin('/cgv')).toBe('cgv')
    expect(pageLegaleDuChemin('/CGV/')).toBe('cgv')
    expect(pageLegaleDuChemin('/mentions')).toBe('mentions')
    for (const autre of ['/', '', '/mon', '/connexion', '/cabinet-fontaine', '/e/cgu', '/e/cgv', '/cgu/mon', '/mentions-legales']) {
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

  /* Les conditions de vente lient l'éditrice et les cabinets : sur une
     surface de patient, elles se liraient comme celles de la boutique. */
  it('gardent les conditions de vente pour les surfaces des professionnels', () => {
    expect(liensLegauxPour(true).map((l) => l.cle)).toContain('cgv')
    expect(liensLegauxPour(false).map((l) => l.cle)).toEqual(['confidentialite', 'conditions', 'mentions'])
  })

  /* La date affichée et la version acceptée sont une seule et même chose. */
  it('datent les quatre pages de la version que l’on accepte', () => {
    expect(MISE_A_JOUR).toBe(VERSION)
    expect(VERSION).toMatch(FORME_DE_VERSION)
  })

  /* La base refuse une version d'une autre forme (0067) : la date affichée
     et le motif de la base doivent rester les mêmes, sinon plus personne ne
     peut accepter. */
  it('ont une version que la base accepte', () => {
    const migration = lire('supabase/migrations/0067_les_conditions_acceptees.sql')
    const motif = FORME_DE_VERSION.source
    expect(migration.split(`'${motif}'`).length - 1).toBe(2)
    for (const forme of ['1er octobre 2026', '9 mars 2027']) expect(forme).toMatch(FORME_DE_VERSION)
    for (const forme of ['', 'v2', '32 mars 2026', '30 septembre 26', '30 Septembre 2026']) {
      expect(forme).not.toMatch(FORME_DE_VERSION)
    }
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
  cgv: [
    'parties',
    'objet',
    'acceptation',
    'souscription',
    'resiliation',
    'prix',
    'retard',
    'jetons',
    'option-hypnose',
    'revendeurs',
    'obligations-client',
    'ia',
    'disponibilite',
    'securite',
    'donnees',
    'propriete',
    'responsabilite',
    'force-majeure',
    'prescription',
    'confidentialite',
    'dispositions',
    'modifications',
    'signalement',
    'droit',
    'annexe-rgpd',
    'annexe-engagements',
    'annexe-sous-traitants',
    'annexe-violations',
    'annexe-fin',
    'annexe-audits',
    'annexe-hds',
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
  /* Ce que la loi exige de l'éditrice (LCEN, art. 1-1) : complété, il se
     lit en clair ; pas encore, il reste en évidence. Jamais entre les deux. */
  it('disent qui édite, sous quel numéro, où, qui dirige la publication et comment la joindre', () => {
    if (!VALIDE_JURIDIQUEMENT) {
      const champs = champsACompleter(PAGES_LEGALES.mentions).join('\n')
      for (const attendu of [/raison sociale/, /SIREN/, /siège/, /directeur ou de la directrice de la publication/, /contact/]) {
        expect(champs).toMatch(attendu)
      }
      return
    }
    const t = texte('mentions')
    expect(t).toContain(EDITRICE)
    expect(t).toContain(`SIREN ${SIREN}`)
    expect(t).toContain(SIRET)
    expect(t).toContain('Registre national des entreprises')
    expect(t).toContain(TVA_INTRACOMMUNAUTAIRE)
    expect(t).toContain(ADRESSE)
    expect(t).toContain(TELEPHONE)
    expect(t).toContain(COURRIEL)
    expect(t).toMatch(/Directrice de la publication[\s\S]*Laetitia OLLIVIER/)
  })

  it('nomment les hébergeurs, leur adresse, un moyen de les joindre et leur région', () => {
    const t = texte('mentions')
    expect(t).toMatch(/Vercel Inc\./)
    expect(t).toContain('+1 951 383 6898')
    expect(t).toMatch(/Supabase Pte\. Ltd\./)
    expect(t).toContain('65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513')
    /* Aucun numéro n'est inventé : l'hébergeur n'en publie pas, la page le
       dit, et donne les moyens de le joindre qu'il publie lui-même. */
    expect(t).toMatch(/ne publie aucun numéro de téléphone/)
    expect(t).toContain('https://supabase.com/support')
    expect(t).toContain('legal@supabase.io')
    expect(t).toContain('cdg1')
    expect(t).toContain('eu-west-3')
  })
})

/* ------------------------------------------------------------------ *
 * L'éditrice, partout la même
 * ------------------------------------------------------------------ */

describe('l’éditrice', () => {
  /* Une EI se désigne par le nom de la personne, suivi ou précédé de « EI »
     (C. com., R526-26) : « LO HYPNOSE » seul ne suffit pas. */
  it('porte le nom de l’exploitante et la mention EI', () => {
    expect(EDITRICE).toMatch(/Laetitia OLLIVIER, entrepreneur individuel \(EI\)/)
    expect(EDITRICE).toContain('LO HYPNOSE')
  })

  it('est nommée de la même façon sur les quatre pages', () => {
    for (const cle of ['confidentialite', 'conditions', 'cgv', 'mentions'] as const) {
      expect(texte(cle), cle).toContain(EDITRICE)
    }
  })

  /* Le modèle a changé : l'IA passe par la clé de la plateforme ou du
     revendeur, en jetons — ou par celle du cabinet, pour qui l'a encore.
     Aucune page ne doit promettre l'ancien modèle comme le seul. */
  it('ne promet plus que l’IA passe seulement par la clé du cabinet', () => {
    for (const cle of Object.keys(PAGES_LEGALES) as CleLegale[]) {
      expect(texte(cle), cle).not.toMatch(/ne prélève rien/)
      expect(texte(cle), cle).not.toMatch(/n’est possible qu’avec la clé/)
    }
    expect(texte('conditions')).toMatch(/jetons/)
    expect(texte('confidentialite')).toMatch(/compte de la plateforme ou du revendeur/)
  })

  it('n’écrit plus aucun champ à compléter', () => {
    for (const cle of Object.keys(PAGES_LEGALES) as CleLegale[]) {
      expect(texte(cle), cle).not.toContain('À COMPLÉTER')
    }
  })
})

/* ------------------------------------------------------------------ *
 * Les conditions générales de vente
 * ------------------------------------------------------------------ */

describe('les conditions générales de vente', () => {
  const t = texte('cgv')
  const page = PAGES_LEGALES.cgv

  it('désignent l’éditrice comme « le Prestataire », une fois', () => {
    expect(t.match(/ci-après « le Prestataire »/g)).toHaveLength(1)
  })

  /* Les renvois « l'article 7 » se calculent : chaque titre porte son rang. */
  it('numérotent leurs articles dans l’ordre, puis l’annexe', () => {
    const articles = page.sections.filter((s) => !s.id.startsWith('annexe-'))
    articles.forEach((s, i) => expect(s.titre, s.id).toMatch(new RegExp(`^${i + 1}\\. `)))
    const annexe = page.sections.filter((s) => s.id.startsWith('annexe-'))
    for (const s of annexe) expect(s.titre, s.id).toMatch(/^Annexe — /)
    expect(page.sections.at(-annexe.length - 1)?.id).toBe('droit')
  })

  it('disent la version acceptée, et comment on l’accepte', () => {
    expect(t).toContain(MISE_A_JOUR)
    expect(t).toContain('« J’ai lu et j’accepte les conditions générales de vente et d’utilisation »')
    expect(t).toMatch(/sans qu’elle soit cochée d’avance/)
  })

  it('disent la TVA telle qu’elle se facture', () => {
    expect(t).toMatch(/hors taxes/)
    expect(t).toContain('« TVA non applicable, art. 293 B du CGI »')
    expect(t).toMatch(/franchise en base/)
  })

  it('posent les pénalités de retard que le code de commerce impose', () => {
    expect(t).toMatch(/Banque centrale européenne[\s\S]*majoré de dix points/)
    expect(t).toMatch(/indemnité forfaitaire pour frais de recouvrement de 40 euros/)
    expect(t).toMatch(/L441-10 et D441-5/)
    expect(t).toMatch(/Aucun escompte/)
  })

  it('suspendent pour impayé sans rien effacer, et laissent lire et exporter', () => {
    const retard = page.sections.find((s) => s.id === 'retard')
    const r = retard ? textesDe({ ...page, sections: [retard] }).join('\n') : ''
    expect(r).toMatch(/huit jours/)
    expect(r).toMatch(/accès en lecture/)
    expect(r).toMatch(/rien n’est effacé/)
    expect(r).toMatch(/trente jours après la mise en demeure/)
  })

  it('disent les règles des jetons', () => {
    for (const regle of [
      /premier jour de chaque mois civil \(heure de Paris\)/,
      /ne se cumulent pas et ne se reportent pas/,
      /valables douze mois à compter de l’achat/,
      /d’abord dans les jetons inclus du mois, puis dans ceux qui accompagnent l’option Hypnose, puis dans ceux des recharges/,
      /en commençant par ceux dont l’échéance est la plus proche/,
      /affiché avant qu’on la lance/,
      /ne sont débités que si la rédaction aboutit/,
      /reviennent automatiquement dans les dix minutes/,
      /au moins trente jours à l’avance/,
      /effet rétroactif/,
      /aucune valeur monétaire/,
      /ni de la monnaie électronique/,
    ]) {
      expect(t).toMatch(regle)
    }
  })

  it('tiennent le changement de fournisseur du règlement européen sur les données', () => {
    expect(t).toMatch(/2023\/2854/)
    expect(t).toMatch(/format structuré, couramment utilisé et lisible par machine/)
    expect(t).toMatch(/période de transition de trente jours/)
    expect(t).toMatch(/n’excède jamais deux mois/)
  })

  it('limitent la responsabilité sans toucher aux dommages corporels ni aux personnes', () => {
    expect(t).toMatch(/faute prouvée/)
    expect(t).toMatch(/dommages directs et prévisibles/)
    expect(t).toMatch(/Sauf faute lourde ou dolosive/)
    expect(t).toMatch(/douze mois qui précèdent le fait générateur/)
    /* Un plafond qui tombe à zéro (l'essai, le premier mois) viderait
       l'obligation essentielle : il a un plancher (code civil, art. 1170). */
    expect(t).toMatch(/sans pouvoir être inférieur à 500 euros/)
    expect(t).toMatch(/ne s’appliquent pas aux dommages corporels/)
    expect(t).toMatch(/article 82/)
  })

  it('abrègent la prescription à un an, à partir de la connaissance des faits', () => {
    expect(t).toMatch(/se prescrit par un an à compter du jour où le Client a connu, ou aurait dû connaître/)
  })

  /* Entre non-commerçants, une clause attributive de juridiction est réputée
     non écrite (CPC, art. 48) : les CGV n'en écrivent pas. */
  it('ne désignent pas de tribunal, et passent d’abord par l’amiable', () => {
    expect(t).not.toMatch(/tribunal de commerce|seuls compétents|compétence exclusive/i)
    expect(t).toMatch(/trente jours à compter de sa réception/)
    expect(t).toMatch(/règles du droit commun/)
  })

  it('posent la destination non médicale du service', () => {
    expect(t).toMatch(/n’est pas un dispositif médical/)
    expect(t).toMatch(/finalité non médicale/)
    expect(t).toMatch(/article 50/)
  })

  it('annexent l’accord de sous-traitance, avec ses sous-traitants et ses délais', () => {
    for (const nom of ['Vercel Inc.', 'Supabase Pte. Ltd.', 'Anthropic, PBC', 'Resend, Inc.', 'Stripe', 'hCaptcha', 'SerpApi']) {
      expect(t).toContain(nom)
    }
    expect(t).toMatch(/quarante-huit heures après en avoir pris connaissance/)
    expect(t).toMatch(/au plus une fois par an/)
    expect(t).toMatch(/pendant trois mois/)
    expect(t).toMatch(/Aucune certification d’hébergeur de données de santé \(HDS\) n’est revendiquée/)
  })

  /* RGPD, art. 28, 3, h : des audits, « y compris des inspections ». */
  it('permettent les inspections, encadrées', () => {
    const audits = page.sections.find((s) => s.id === 'annexe-audits')
    const a = audits ? textesDe({ ...page, sections: [audits] }).join('\n') : ''
    expect(a).toMatch(/y compris à des inspections/)
    expect(a).toMatch(/sur place/)
    expect(a).toMatch(/à ses frais/)
    expect(a).toMatch(/au moins trente jours à l’avance/)
    expect(a).toMatch(/au plus une fois par an, sauf à la suite d’une violation de données ou à la demande d’une autorité de contrôle/)
    expect(a).toMatch(/auditeur indépendant tenu à la confidentialité/)
    expect(a).toMatch(/heures ouvrées/)
    expect(a).toMatch(/sans accès aux données d’autres clients/)
  })

  /* Celui qui administre la base y a accès : il est un sous-traitant
     ultérieur, et l'accord le dit — sans rien inventer de son identité. */
  it('désignent le prestataire technique comme sous-traitant ultérieur', () => {
    const sousTraitants = page.sections.find((s) => s.id === 'annexe-sous-traitants')
    const liste = sousTraitants?.blocs.find((b) => b.type === 'prestataires')
    const noms = liste?.type === 'prestataires' ? liste.prestataires.map((p) => `${p.nom} ${p.role}`) : []
    expect(noms.join('\n')).toMatch(
      /prestataire technique qui développe et administre la plateforme pour le compte de l’éditrice, lié par un engagement de confidentialité ; son identité et ses coordonnées sont communiquées à tout cabinet qui en fait la demande/,
    )
    expect(texte('confidentialite')).toMatch(/prestataire technique qui développe et administre la plateforme[\s\S]*sous-traitant ultérieur/)
  })

  /* La voix et les rappels passent par l'éditeur du navigateur ou du
     téléphone, sous ses propres conditions : l'éditrice n'a pas de contrat
     avec lui, et ne peut pas le présenter comme son sous-traitant. */
  it('ne comptent pas les services du navigateur parmi les sous-traitants ultérieurs', () => {
    const sousTraitants = page.sections.find((s) => s.id === 'annexe-sous-traitants')
    const liste = sousTraitants?.blocs.find((b) => b.type === 'prestataires')
    const entrees = liste?.type === 'prestataires' ? liste.prestataires.map((p) => Object.values(p).join(' ')).join('\n') : ''
    expect(entrees).not.toMatch(/Chrome|Safari|Edge|notification/)
    expect(t).toMatch(/Google pour Chrome, Microsoft pour Edge, Apple pour Safari/)
    expect(t).toMatch(/ne sont pas des sous-traitants ultérieurs du Prestataire/)
    expect(t).toMatch(/ne dicte aucune donnée de santé qui permette d’identifier une personne/)
  })

  /* Le Client qui résilie parce que le Prestataire a manqué ne perd pas ce
     qu'il a payé d'avance. */
  it('remboursent les recharges payées quand le Client résilie pour manquement du Prestataire', () => {
    expect(t).toMatch(
      /résiliation par le Client pour manquement grave du Prestataire, les recharges payées et non consommées sont remboursées au prorata/,
    )
  })

  it('ouvrent un point de contact et une procédure de signalement', () => {
    expect(t).toMatch(/2022\/2065/)
    expect(t).toContain(COURRIEL)
  })
})

/* ------------------------------------------------------------------ *
 * L'IA, dite à la personne suivie
 * ------------------------------------------------------------------ */

describe('la mention de l’IA', () => {
  /* Les affirmations renouvelées automatiquement arrivent sans relecture :
     aucune page ne peut dire que tout est « relu et validé ». */
  it('ne dit pas que tout est relu et validé', () => {
    expect(MENTION_IA).not.toMatch(/relus? et validés?/)
    for (const cle of Object.keys(PAGES_LEGALES) as CleLegale[]) {
      expect(texte(cle), cle).not.toMatch(/relus et validés/)
    }
  })

  it('est la même à l’écran, dans les conditions d’utilisation et dans les conditions de vente', () => {
    const suite = 'sous la responsabilité de votre praticien, qui les relit ou choisit d’en publier certains automatiquement'
    expect(MENTION_IA).toContain(suite)
    expect(texte('conditions')).toContain(suite)
    expect(texte('cgv')).toContain(suite.replace('votre praticien', 'leur praticien'))
  })

  it('ne nomme ni la plateforme ni un modèle', () => {
    expect(MENTION_IA).not.toMatch(/klaro/i)
    expect(revendicationsInterdites(MENTION_IA)).toEqual([])
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
