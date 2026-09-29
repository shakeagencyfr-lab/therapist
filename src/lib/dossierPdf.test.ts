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
import { crc32, deflateSync } from 'node:zlib'
import { composerNote, preparerNotePdf } from './honorairesPdf'

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

  /* Le logo du cabinet en tête, quand il en a un : une image dans la page,
     le texte de la note inchangé. */
  it('pose le logo du cabinet en tête, sans rien changer à ce que la note dit', async () => {
    // Un carré PNG de 1 pixel : de quoi vérifier que l'image entre dans le fichier.
    const pixel =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const note = {
      id: 'n1', numero: 7, patientId: 'p1', sessionId: 's1', datePrestation: '2026-09-25',
      prestation: 'Séance d’hypnose', montantCents: 6000, mentionTva: 'art-293-b' as const,
      praticien: 'Camille Praticienne', praticienAdresse: '3 rue des Lilas', praticienNumero: 'SIRET 123',
      beneficiaire: 'Nadia Belkacem', emiseLe: '2026-09-28T09:00:00Z', annuleeLe: null,
    }
    const sans = (await composerNote(note)).output()
    const avec = (await composerNote(note, { dataUrl: pixel, largeur: 1, hauteur: 1 })).output()
    expect(sans).not.toMatch(/\/Subtype \/Image/)
    expect(avec).toMatch(/\/Subtype \/Image/)
    for (const texte of ['N° 0007', 'Nadia Belkacem', 'Camille Praticienne']) expect(avec).toContain(texte)
  })

  /* La note part en pièce jointe (0064) : le serveur refuse au-delà d'un
     mégaoctet. Le pire des logos — 400 × 400 pixels de bruit, rien que la
     compression ne rattrape — doit tenir dessous. */
  it('tient sous le plafond de l’envoi, même avec le pire des logos', async () => {
    const note = {
      id: 'n1', numero: 7, patientId: 'p1', sessionId: 's1', datePrestation: '2026-09-25',
      prestation: 'Séance d’hypnose', montantCents: 6000, mentionTva: 'art-293-b' as const,
      praticien: 'Camille Praticienne', praticienAdresse: '3 rue des Lilas', praticienNumero: 'SIRET 123',
      beneficiaire: 'Nadia Belkacem', emiseLe: '2026-09-28T09:00:00Z', annuleeLe: null,
    }
    const pdf = await preparerNotePdf(note, { dataUrl: pngDeBruit(400), largeur: 400, hauteur: 400 })
    const octets = Buffer.from(pdf.base64(), 'base64')
    expect(octets.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(octets.length).toBeLessThan(1_000_000)
    expect(pdf.noteId).toBe('n1')
  })
})

/** Un PNG carré de bruit, en RGBA : ce qui se compresse le moins bien. */
function pngDeBruit(cote: number): string {
  let graine = 42
  const hasard = () => ((graine = (graine * 1103515245 + 12345) >>> 0) >>> 16) & 0xff
  const lignes = Buffer.alloc(cote * (1 + cote * 4))
  for (let y = 0; y < cote; y++) {
    const debut = y * (1 + cote * 4)
    for (let i = 1; i <= cote * 4; i++) lignes[debut + i] = hasard()
  }
  const morceau = (type: string, donnees: Buffer) => {
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(donnees.length)
    const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees])
    const somme = Buffer.alloc(4)
    somme.writeUInt32BE(crc32(corps))
    return Buffer.concat([longueur, corps, somme])
  }
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(cote, 0)
  entete.writeUInt32BE(cote, 4)
  entete.set([8, 6, 0, 0, 0], 8)
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(lignes)),
    morceau('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

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
