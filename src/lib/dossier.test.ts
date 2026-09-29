import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ANAMNESE_VIDE,
  COLONNES_SEANCE,
  anamneseDepuisLigne,
  anamneseModifiee,
  anamneseVersLigne,
  anamneseVide,
  dateDeNote,
  dateDeSeance,
  dureeDeSeance,
  etatDeSeance,
  libelleDeSeance,
  lireBrouillon,
  notesDepuisLignes,
  refusAnamnese,
  refusNoteDatee,
  seanceARelire,
  seancesDuDossier,
  type LigneSeance,
} from './dossier'

const ici = dirname(fileURLToPath(import.meta.url))
const lire = (chemin: string) => readFileSync(join(ici, chemin), 'utf8')
/** Le code, sans ses commentaires : ceux-ci nomment la transcription pour dire pourquoi on ne la lit pas. */
const code = (chemin: string) =>
  lire(chemin)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const ligne = (p: Partial<LigneSeance> = {}): LigneSeance => ({
  id: 's1',
  status: 'envoye',
  occurred_at: '2026-09-20T09:00:00+00:00',
  consent_revoked_at: null,
  duration_seconds: 3120,
  notes: null,
  draft: { synthese: 'Une séance sur la porte.', mots: ['la porte'], questions: ['Le sommeil ?'] },
  sent_at: '2026-09-20T10:00:00+00:00',
  ...p,
})

describe('la transcription ne se lit jamais', () => {
  it('ne figure pas parmi les colonnes lues', () => {
    expect(COLONNES_SEANCE).not.toMatch(/transcript/)
    expect(COLONNES_SEANCE).not.toMatch(/\*/)
  })

  /* Un écran qui la demanderait l'afficherait tôt ou tard. On lit le code
     de tout ce que le dossier touche, commentaires retirés. */
  it('n’est demandée par aucun des fichiers du dossier', () => {
    for (const f of [
      'dossier.ts',
      'dossierPdf.ts',
      '../cabinet/dossier.ts',
      '../cabinet/useDossierFiche.ts',
      '../views/therapist/SeancesFiche.tsx',
      '../views/therapist/NotesCliniques.tsx',
      '../views/therapist/ExportDossier.tsx',
    ]) {
      // La colonne (`transcript`, `transcript_deleted_at`), pas le mot français.
      expect(code(f), f).not.toMatch(/transcript(?!ion)/)
    }
  })

  it('les séances se lisent par COLONNES_SEANCE, pas par « * »', () => {
    const acces = code('../cabinet/dossier.ts')
    expect(acces).toMatch(/from\('therapy_sessions'\)\s*\.select\(COLONNES_SEANCE\)/)
  })
})

describe('l’export du dossier', () => {
  /* Un export sans trace est justement celui qu'on ne saura pas expliquer ;
     un dossier lu à moitié se lirait comme complet. */
  it('se trace avant de se fabriquer, et refuse un dossier lu à moitié', () => {
    const e = code('../views/therapist/ExportDossier.tsx')
    const trace = e.indexOf('tracerExport(')
    expect(trace).toBeGreaterThan(-1)
    expect(trace).toBeLessThan(e.indexOf('telechargerDossier({'))
    expect(e).toMatch(/lu\.seances === null \|\| lu\.anamnese === null \|\| lu\.notes === null/)
  })

  it('ne prend le journal que de la fiche, que la base ne remplit que de pages partagées', () => {
    const e = code('../views/therapist/ExportDossier.tsx')
    expect(e).not.toMatch(/journal_pages/)
    expect(code('../cabinet/dossier.ts')).not.toMatch(/journal_pages/)
  })
})

describe('lireBrouillon', () => {
  it('garde ce qui a la bonne forme', () => {
    const b = lireBrouillon({
      synthese: '  Synthèse.  ',
      mots: ['la porte', 3, ''],
      themes: ['seuil'],
      questions: ['Le sommeil ?'],
      vigilance: [{ point: 'Fatigue', conduite: 'En reparler' }, { conduite: 'sans point' }, null],
      induction: 'ancien champ',
    })
    expect(b).toEqual({
      synthese: 'Synthèse.',
      mots: ['la porte'],
      themes: ['seuil'],
      questions: ['Le sommeil ?'],
      vigilance: [{ point: 'Fatigue', conduite: 'En reparler' }],
    })
  })

  it('ne plante sur rien et rend null quand il n’y a rien à relire', () => {
    expect(lireBrouillon(null)).toBeNull()
    expect(lireBrouillon('texte')).toBeNull()
    expect(lireBrouillon([])).toBeNull()
    expect(lireBrouillon({ synthese: '   ', mots: 'pas une liste' })).toBeNull()
  })
})

describe('etatDeSeance', () => {
  it('le retrait du consentement l’emporte sur tout', () => {
    expect(etatDeSeance({ status: 'archive', sent_at: '2026-09-01', consent_revoked_at: '2026-09-02' })).toBe('retiree')
  })
  it('envoyée, brouillon, rangée, ouverte', () => {
    expect(etatDeSeance({ status: 'envoye', sent_at: 'x', consent_revoked_at: null })).toBe('envoyee')
    expect(etatDeSeance({ status: 'brouillon', sent_at: null, consent_revoked_at: null })).toBe('brouillon')
    expect(etatDeSeance({ status: 'archive', sent_at: null, consent_revoked_at: null })).toBe('rangee')
    expect(etatDeSeance({ status: 'captation', sent_at: null, consent_revoked_at: null })).toBe('ouverte')
  })
})

describe('seancesDuDossier', () => {
  /* Ouverte sans enregistrement : pas de date de consentement. Effacée, elle
     a été abandonnée — il n'y avait pas de consentement à retirer. */
  it('reconnaît une séance sans enregistrement, et la dit abandonnée si elle est effacée', () => {
    const { seances } = seancesDuDossier([
      ligne({ id: 'notes', consent_given_at: null, notes: 'Notes seules' }),
      ligne({ id: 'abandon', consent_given_at: null, consent_revoked_at: '2026-09-21T08:00:00+00:00' }),
      ligne({ id: 'micro', consent_given_at: '2026-09-20T08:00:00+00:00', notes: 'Avec micro' }),
    ])
    const par = Object.fromEntries(seances.map((x) => [x.id, x]))
    expect(par.notes?.sansEnregistrement).toBe(true)
    expect(par.micro?.sansEnregistrement).toBe(false)
    expect(libelleDeSeance(par.abandon!)).toBe('Abandonnée')
    expect(libelleDeSeance({ etat: 'retiree', sansEnregistrement: false })).toBe('Consentement retiré')
  })

  it('de la plus récente à la plus ancienne', () => {
    const { seances } = seancesDuDossier([
      ligne({ id: 'ancienne', occurred_at: '2026-08-01T09:00:00+00:00' }),
      ligne({ id: 'recente', occurred_at: '2026-09-25T09:00:00+00:00' }),
      ligne({ id: 'milieu', occurred_at: '2026-09-01T09:00:00+00:00' }),
    ])
    expect(seances.map((s) => s.id)).toEqual(['recente', 'milieu', 'ancienne'])
  })

  it('une séance au consentement retiré paraît, sans aucun contenu', () => {
    const { seances } = seancesDuDossier([
      ligne({
        id: 'retiree',
        consent_revoked_at: '2026-09-21T08:00:00+00:00',
        // Même si une ligne d'avant 0043 portait encore quelque chose.
        notes: 'ne doit pas paraître',
        draft: { synthese: 'ne doit pas paraître' },
      }),
    ])
    expect(seances).toHaveLength(1)
    expect(seances[0]).toMatchObject({ etat: 'retiree', notes: '', brouillon: null })
  })

  it('une séance ouverte sur laquelle rien n’a été pris est comptée, pas listée', () => {
    const r = seancesDuDossier([
      ligne({ id: 'vide', status: 'captation', sent_at: null, draft: null, notes: null }),
      ligne({ id: 'notes', status: 'captation', sent_at: null, draft: null, notes: 'Une note.' }),
    ])
    expect(r.sansRien).toBe(1)
    expect(r.seances.map((s) => s.id)).toEqual(['notes'])
  })

  it('une séance envoyée sans brouillon reste listée', () => {
    const r = seancesDuDossier([ligne({ draft: null })])
    expect(r.seances).toHaveLength(1)
    expect(r.sansRien).toBe(0)
  })
})

describe('seanceARelire', () => {
  it('ouvre la dernière séance qui porte quelque chose, jamais une séance retirée', () => {
    const { seances } = seancesDuDossier([
      ligne({ id: 'retiree', occurred_at: '2026-09-26T09:00:00+00:00', consent_revoked_at: '2026-09-26T10:00:00+00:00' }),
      ligne({ id: 'precedente', occurred_at: '2026-09-19T09:00:00+00:00' }),
    ])
    expect(seanceARelire(seances)).toBe('precedente')
    expect(seanceARelire([])).toBeNull()
  })
})

describe('dureeDeSeance', () => {
  it('se dit comme on la dit', () => {
    expect(dureeDeSeance(0)).toBe('')
    expect(dureeDeSeance(40)).toBe("moins d'une minute")
    expect(dureeDeSeance(52 * 60)).toBe('52 min')
    expect(dureeDeSeance(65 * 60)).toBe('1 h 05')
    expect(dureeDeSeance(120 * 60)).toBe('2 h')
  })
})

describe('les dates', () => {
  it('une séance se date au jour de Paris', () => {
    // 23 h 30 à Paris le 3, déjà le 4 en UTC+0 ? Non : 21 h 30 UTC = 23 h 30 à Paris.
    expect(dateDeSeance('2026-09-03T21:30:00Z')).toMatch(/jeudi 3 septembre 2026/)
    expect(dateDeSeance('pas une date')).toBe('')
  })

  it('une note se date sans glisser d’un jour', () => {
    expect(dateDeNote('2026-09-28')).toBe('28 septembre 2026')
    expect(dateDeNote('n’importe quoi')).toBe('n’importe quoi')
  })
})

describe('l’anamnèse', () => {
  it('va et vient entre la base et l’écran', () => {
    const a = anamneseDepuisLigne({ motif: ' Tabac ', antecedents: null, contre_indications: 'Épilepsie', traitements: '' })
    expect(a).toEqual({ motif: ' Tabac ', antecedents: '', contreIndications: 'Épilepsie', traitements: '' })
    expect(anamneseVersLigne(a)).toEqual({ motif: 'Tabac', antecedents: '', contre_indications: 'Épilepsie', traitements: '' })
    expect(anamneseDepuisLigne(null)).toEqual(ANAMNESE_VIDE)
  })

  it('une modification qui ne change que des blancs de bord n’en est pas une', () => {
    const a = { ...ANAMNESE_VIDE, motif: 'Tabac' }
    expect(anamneseModifiee(a, { ...a, motif: 'Tabac  ' })).toBe(false)
    expect(anamneseModifiee(a, { ...a, traitements: 'Aucun' })).toBe(true)
    expect(anamneseVide({ ...ANAMNESE_VIDE, motif: '  ' })).toBe(true)
  })

  it('dit quel champ dépasse la limite de la base', () => {
    expect(refusAnamnese(ANAMNESE_VIDE)).toBe('')
    expect(refusAnamnese({ ...ANAMNESE_VIDE, antecedents: 'x'.repeat(8001) })).toMatch(/Antécédents/)
  })
})

describe('les notes datées', () => {
  const noms = new Map([['u2', 'Claire Fontaine']])
  const lignes = [
    { id: 'a', le: '2026-09-20', texte: 'A', auteur: 'u1', creee_le: '2026-09-20T08:00:00Z', modifiee_le: '2026-09-20T08:00:00Z' },
    { id: 'b', le: '2026-09-25', texte: 'B', auteur: 'u2', creee_le: '2026-09-25T08:00:00Z', modifiee_le: '2026-09-25T08:00:00Z' },
    { id: 'c', le: '2026-09-25', texte: 'C', auteur: 'u3', creee_le: '2026-09-25T09:00:00Z', modifiee_le: '2026-09-25T09:00:00Z' },
  ]

  it('de la plus récente à la plus ancienne, la dernière écrite d’abord à jour égal', () => {
    expect(notesDepuisLignes(lignes, 'u1', noms).map((n) => n.id)).toEqual(['c', 'b', 'a'])
  })

  it('ne nomme l’auteur que si ce n’est pas vous', () => {
    const [c, b, a] = notesDepuisLignes(lignes, 'u1', noms)
    expect(a?.auteur).toBe('')
    expect(b?.auteur).toBe('Claire Fontaine')
    expect(c?.auteur).toBe('un autre membre de l’équipe')
  })

  it('refuse une note vide, trop longue, mal datée ou datée du futur', () => {
    expect(refusNoteDatee('Appel.', '2026-09-28', '2026-09-28')).toBe('')
    expect(refusNoteDatee('  ', '2026-09-28', '2026-09-28')).toMatch(/vide/)
    expect(refusNoteDatee('x'.repeat(20001), '2026-09-28', '2026-09-28')).toMatch(/trop longue/)
    expect(refusNoteDatee('Appel.', '', '2026-09-28')).toMatch(/jour/)
    expect(refusNoteDatee('Appel.', '2026-09-29', '2026-09-28')).toMatch(/au plus tard/)
  })
})
