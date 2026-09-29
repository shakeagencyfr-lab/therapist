import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PATIENTS } from '@/data/patients'
import { ANAMNESE_VIDE, type SeanceDuDossier } from './dossier'
import {
  AVERTISSEMENT_EXPORT,
  MENTION_JOURNAL_PRIVE,
  SECTIONS_DU_DOSSIER,
  blocsDuDossier,
  composerDossier,
  nomFichierDossier,
  type Bloc,
  type EntreeExport,
} from './dossierPdf'
import { composerNote } from './honorairesPdf'

const ici = dirname(fileURLToPath(import.meta.url))
const fiche = Object.values(PATIENTS)[0]!

const SEANCES: SeanceDuDossier[] = [
  {
    id: 'recente',
    le: '2026-09-25T09:00:00Z',
    dureeSecondes: 3000,
    etat: 'envoyee',
    retireeLe: null,
    envoyeeLe: '2026-09-25T10:00:00Z',
    notes: 'Notes privées de séance',
    brouillon: { synthese: 'Synthèse de la plus récente.', mots: ['la porte'], themes: [], questions: [], vigilance: [] },
  },
  {
    id: 'retiree',
    le: '2026-09-18T09:00:00Z',
    dureeSecondes: 1200,
    etat: 'retiree',
    retireeLe: '2026-09-18T11:00:00Z',
    envoyeeLe: null,
    notes: '',
    brouillon: null,
  },
  {
    id: 'ancienne',
    le: '2026-09-04T09:00:00Z',
    dureeSecondes: 3300,
    etat: 'envoyee',
    retireeLe: null,
    envoyeeLe: '2026-09-04T10:00:00Z',
    notes: '',
    brouillon: { synthese: 'Synthèse de la première.', mots: [], themes: [], questions: [], vigilance: [] },
  },
]

const entree = (p: Partial<EntreeExport> = {}): EntreeExport => ({
  cabinet: 'Cabinet Lumière',
  exporteLe: new Date('2026-09-28T10:00:00Z'),
  fiche,
  seances: SEANCES,
  anamnese: { ...ANAMNESE_VIDE, motif: 'Arrêt du tabac', contreIndications: 'Aucune connue.' },
  notes: [
    { id: 'n', le: '2026-09-20', texte: 'Appel : séance déplacée.', auteur: '', creeeLe: '', modifieeLe: '' },
  ],
  ...p,
})

const textes = (blocs: Bloc[]) =>
  blocs.map((b) => ('texte' in b ? b.texte : `${b.libelle} : ${b.valeur}`)).join('\n')

describe('blocsDuDossier', () => {
  it('pose toutes les sections, dans l’ordre annoncé', () => {
    const sections = blocsDuDossier(entree())
      .filter((b) => b.t === 'section')
      .map((b) => ('texte' in b ? b.texte : ''))
    expect(sections).toEqual([...SECTIONS_DU_DOSSIER])
  })

  it('ouvre sur le nom, le cabinet et l’avertissement', () => {
    const b = blocsDuDossier(entree())
    expect(b[0]).toEqual({ t: 'titre', texte: `Dossier de ${fiche.name}` })
    expect(textes(b)).toContain('Cabinet Lumière · exporté le 28 septembre 2026')
    expect(textes(b)).toContain(AVERTISSEMENT_EXPORT)
  })

  it('les séances se lisent dans le sens du temps, par leur synthèse seulement', () => {
    const t = textes(blocsDuDossier(entree()))
    expect(t.indexOf('Synthèse de la première.')).toBeLessThan(t.indexOf('Synthèse de la plus récente.'))
    // « Séances (synthèses) » : ni les notes prises pendant la séance, ni les mots.
    expect(t).not.toContain('Notes privées de séance')
  })

  it('une séance au consentement retiré paraît à sa date, avec la mention de l’effacement et rien d’autre', () => {
    const t = textes(blocsDuDossier(entree()))
    expect(t).toMatch(/Consentement retiré le 18 septembre 2026 : tout ce qui avait été pris pendant cette séance a été effacé/)
  })

  it('le journal : les pages partagées, et la mention du journal privé qui n’y est pas', () => {
    const t = textes(blocsDuDossier(entree()))
    expect(t).toContain(MENTION_JOURNAL_PRIVE)
    for (const page of fiche.journal) expect(t).toContain(page.text)
  })

  it('l’anamnèse ne montre que les champs remplis ; les notes suivent', () => {
    const t = textes(blocsDuDossier(entree()))
    expect(t).toContain('Motif de consultation\nArrêt du tabac')
    expect(t).not.toContain('Traitements en cours')
    expect(t).toContain('Appel : séance déplacée.')
  })

  it('une section vide le dit au lieu de disparaître', () => {
    const t = textes(
      blocsDuDossier(
        entree({
          seances: [],
          anamnese: ANAMNESE_VIDE,
          notes: [],
          fiche: { ...fiche, journal: [], modules: [], modulesRetires: [], scale: [], mesures: [] },
        }),
      ),
    )
    for (const phrase of [
      'Aucune séance au dossier.',
      'Aucune anamnèse consignée.',
      'Aucune note de suivi.',
      'Aucune page partagée.',
      'Aucun exercice confié.',
      'Aucune note du soir.',
    ]) {
      expect(t).toContain(phrase)
    }
  })
})

describe('nomFichierDossier', () => {
  it('au jour de Paris', () => {
    expect(nomFichierDossier('Camille Martin', new Date('2026-09-28T22:30:00Z'))).toBe('Dossier_Camille-Martin_2026-09-29.pdf')
  })
})

describe('le PDF composé', () => {
  /* Une chaîne passée en seize bits — le signe qu'un caractère a échappé à
     pourPdf — se reconnaît à ses octets nuls entre les lettres. */
  const illisible = /\(\x00[A-Za-z]\x00[A-Za-z]/

  it('tourne ses pages et reste lisible, même avec des émojis dans le journal', async () => {
    const journal = Array.from({ length: 30 }, (_, i) => ({
      date: `jour ${i + 1}`,
      trigger: 'Envie du soir',
      text: 'Une page longue, écrite d’une traite 😀 → et qui continue. '.repeat(8),
    }))
    const doc = await composerDossier(entree({ fiche: { ...fiche, journal } }))
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    const brut = doc.output()
    expect(brut).not.toMatch(illisible)
    expect(brut).toContain(`Dossier de ${fiche.name}`)
    expect(brut).toContain(`1 / ${doc.getNumberOfPages()}`)
  })

  it('la note d’honoraires porte son numéro, et « ANNULÉE » une fois annulée', async () => {
    const note = {
      id: 'n1',
      numero: 7,
      patientId: 'p1',
      sessionId: 's1',
      datePrestation: '2026-09-25',
      prestation: 'Séance d’hypnose 😀',
      montantCents: 6000,
      mentionTva: 'art-261-4-1' as const,
      praticien: 'Camille Praticienne',
      praticienAdresse: '3 rue des Lilas\n75011 Paris',
      praticienNumero: 'SIRET 123 456 789 00012',
      beneficiaire: 'Nadia Belkacem',
      emiseLe: '2026-09-28T09:00:00Z',
      annuleeLe: null,
    }
    const emise = (await composerNote(note)).output()
    expect(emise).not.toMatch(illisible)
    expect(emise).toContain('N° 0007')
    // « € » s'écrit 0x80 en WinAnsi : c'est l'octet qu'on retrouve dans le fichier.
    expect(emise).toContain('60,00 \x80')
    expect(emise).toContain('TVA non applicable, art. 261-4-1° du CGI')
    expect(emise).not.toContain('ANNULÉE')
    const annulee = (await composerNote({ ...note, annuleeLe: '2026-09-29T09:00:00Z' })).output()
    expect(annulee).toContain('ANNULÉE')
  })
})

describe('la mise en page ne laisse passer aucun texte brut', () => {
  /* Un seul caractère hors WinAnsi ruine la ligne entière (src/lib/pdfTexte.ts) :
     chaque texte posé sur la page passe par pourPdf. */
  it('dans le dossier comme dans la note d’honoraires', () => {
    for (const f of ['dossierPdf.ts', 'honorairesPdf.ts']) {
      const source = readFileSync(join(ici, f), 'utf8')
      const appels = source.match(/doc\.text\(([^,]+),/g) ?? []
      expect(appels.length, f).toBeGreaterThan(0)
      for (const a of appels) {
        // Ce qui n'est pas nettoyé sur place l'a été juste avant : les lignes
        // et morceaux sortent de splitTextToSize(pourPdf(…)) ou de t(…).
        expect(a, `${f} : ${a}`).toMatch(
          /doc\.text\((t\(|pourPdf\(|ligne,|morceau,|designation,|pied,|'•',|`\$\{n\} \/ \$\{pages\}`,|doc\.splitTextToSize\(t\()/,
        )
      }
    }
  })
})
