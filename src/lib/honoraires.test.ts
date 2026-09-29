import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MENTIONS_TVA,
  MENTION_PAR_DEFAUT,
  centimesDepuisSaisie,
  identiteProposee,
  jourLisible,
  manquesIdentite,
  noteDeLaSeance,
  noteDepuisLigne,
  nomFichierNote,
  numeroDeNote,
  refusEmission,
  refusMontant,
  type LigneNoteHonoraires,
  type NoteHonoraires,
} from './honoraires'
import { contenuDeLaNote } from './honorairesPdf'

const ici = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(ici, '../../supabase/migrations/0053_le_dossier_se_relit_et_se_facture.sql'),
  'utf8',
)

const LIGNE: LigneNoteHonoraires = {
  id: 'n1',
  numero: 7,
  patient_id: 'p1',
  session_id: 's1',
  date_prestation: '2026-09-25',
  prestation: 'Séance d’hypnose',
  montant_cents: 6000,
  mention_tva: 'art-261-4-1',
  praticien: 'Camille Praticienne',
  praticien_adresse: '3 rue des Lilas\n75011 Paris',
  praticien_numero: 'SIRET 123 456 789 00012',
  beneficiaire: 'Nadia Belkacem',
  emise_le: '2026-09-28T09:00:00Z',
  annulee_le: null,
}

describe('le numéro', () => {
  it('se lit sur quatre chiffres, pour rester dans l’ordre une fois classé', () => {
    expect(numeroDeNote(7)).toBe('0007')
    expect(numeroDeNote(1234)).toBe('1234')
    expect(numeroDeNote(12345)).toBe('12345')
  })
})

describe('centimesDepuisSaisie', () => {
  it('lit les façons courantes d’écrire un montant', () => {
    expect(centimesDepuisSaisie('60')).toBe(6000)
    expect(centimesDepuisSaisie('60,5')).toBe(6050)
    expect(centimesDepuisSaisie('60.50')).toBe(6050)
    expect(centimesDepuisSaisie(' 60 € ')).toBe(6000)
    expect(centimesDepuisSaisie('1 200,00')).toBe(120000)
    expect(centimesDepuisSaisie('1 200')).toBe(120000)
  })

  it('ne devine pas ce qu’on imprimera sur une pièce comptable', () => {
    expect(centimesDepuisSaisie('')).toBeNull()
    expect(centimesDepuisSaisie('60,555')).toBeNull()
    expect(centimesDepuisSaisie('6O')).toBeNull()
    expect(centimesDepuisSaisie('-60')).toBeNull()
    expect(centimesDepuisSaisie('60,5,0')).toBeNull()
  })

  it('les bornes sont celles de la base', () => {
    expect(refusMontant(null)).toMatch(/lisible/)
    expect(refusMontant(0)).toMatch(/supérieur à zéro/)
    expect(refusMontant(500_001)).toMatch(/5 000/)
    expect(refusMontant(500_000)).toBe('')
    expect(migration).toMatch(/montant_cents between 1 and 500000/)
  })
})

describe('l’identité', () => {
  const vitrine = { responsable: 'Camille P.', adresse: '3 rue des Lilas', numero_pro: 'SIRET 123' }

  it('enregistrée et complète : c’est elle, sans autre source', () => {
    const enregistree = { praticien: 'Camille', adresse: 'Paris', numeroPro: 'ADELI 1', mentionTva: null }
    expect(identiteProposee(enregistree, vitrine, 'Compte')).toEqual({ identite: enregistree, source: 'enregistree' })
  })

  it('reprise des mentions légales de la vitrine, à confirmer', () => {
    const r = identiteProposee(null, vitrine, 'Compte')
    expect(r.source).toBe('vitrine')
    expect(r.identite).toEqual({
      praticien: 'Camille P.',
      adresse: '3 rue des Lilas',
      numeroPro: 'SIRET 123',
      mentionTva: MENTION_PAR_DEFAUT,
    })
  })

  it('sans vitrine : le nom du compte, le reste à saisir', () => {
    const r = identiteProposee(null, null, 'Camille Praticienne')
    expect(r.source).toBe('a-saisir')
    expect(r.identite.praticien).toBe('Camille Praticienne')
    expect(manquesIdentite(r.identite)).toEqual([
      'l’adresse du cabinet',
      'votre numéro professionnel (SIRET, ADELI ou RPPS)',
    ])
  })

  it('une identité enregistrée mais incomplète garde ce qu’elle a, et complète depuis la vitrine', () => {
    const r = identiteProposee({ praticien: 'Camille', adresse: '', numeroPro: '', mentionTva: 'art-293-b' }, vitrine, 'x')
    expect(r.identite).toMatchObject({ praticien: 'Camille', adresse: '3 rue des Lilas', mentionTva: 'art-293-b' })
  })
})

describe('la mention de TVA', () => {
  it('293 B (franchise en base) est proposée d’office, 261-4-1° au choix, et la base connaît les deux mêmes', () => {
    expect(MENTION_PAR_DEFAUT).toBe('art-293-b')
    expect(MENTIONS_TVA['art-261-4-1']).toBe('TVA non applicable, art. 261-4-1° du CGI')
    expect(MENTIONS_TVA['art-293-b']).toBe('TVA non applicable, art. 293 B du CGI')
    expect(migration).toMatch(/mention_tva in \('art-261-4-1', 'art-293-b'\)/)
  })
})

describe('refusEmission', () => {
  it('rend telle quelle la phrase de la base pour un refus attendu', () => {
    expect(refusEmission({ code: '55000', message: 'Seule une séance envoyée…' })).toBe('Seule une séance envoyée…')
    expect(refusEmission({ code: '23505', message: 'Cette séance a déjà sa note…' })).toBe('Cette séance a déjà sa note…')
  })
  it('dit qu’aucun numéro n’a été pris pour une panne', () => {
    expect(refusEmission({ code: '08006', message: 'connexion' })).toMatch(/Aucun numéro n’a été pris/)
    expect(refusEmission({})).toMatch(/Aucun numéro/)
  })
})

describe('la note émise', () => {
  const note = noteDepuisLigne(LIGNE)

  it('se relit depuis la ligne figée, mention comprise', () => {
    expect(note).toMatchObject({ numero: 7, montantCents: 6000, mentionTva: 'art-261-4-1', annuleeLe: null })
    expect(noteDepuisLigne({ ...LIGNE, mention_tva: 'autre' }).mentionTva).toBeNull()
  })

  it('imprime ce qu’elle a figé, et rien d’autre', () => {
    const c = contenuDeLaNote(note)
    expect(c.numero).toBe('N° 0007')
    expect(c.praticien).toEqual(['Camille Praticienne', '3 rue des Lilas', '75011 Paris', 'SIRET 123 456 789 00012'])
    expect(c.beneficiaire).toBe('Nadia Belkacem')
    expect(c.ligne).toEqual({ date: '25 septembre 2026', designation: 'Séance d’hypnose', montant: '60,00 €' })
    expect(c.mention).toBe('TVA non applicable, art. 261-4-1° du CGI')
    expect(c.annulation).toBeNull()
  })

  it('annulée, elle le dit et garde son numéro', () => {
    const c = contenuDeLaNote({ ...note, annuleeLe: '2026-09-29T10:00:00Z' })
    expect(c.numero).toBe('N° 0007')
    expect(c.annulation).toMatch(/annulée le 29 septembre 2026.*numéro reste attribué/)
  })

  it('sans mention, n’en imprime pas', () => {
    expect(contenuDeLaNote({ ...note, mentionTva: null }).mention).toBeNull()
  })

  it('se nomme pour se retrouver dans un dossier', () => {
    expect(nomFichierNote(note)).toBe('Note-honoraires-0007_Nadia-Belkacem_2026-09-25.pdf')
  })

  it('une séance n’a qu’une note en cours : l’annulée ne compte plus', () => {
    const annulee: NoteHonoraires = { ...note, id: 'n0', numero: 6, annuleeLe: '2026-09-27T10:00:00Z' }
    expect(noteDeLaSeance([annulee, note], 's1')?.id).toBe('n1')
    expect(noteDeLaSeance([annulee], 's1')).toBeNull()
  })
})

describe('jourLisible', () => {
  it('lit un jour ou un instant, au jour de Paris', () => {
    expect(jourLisible('2026-09-25')).toBe('25 septembre 2026')
    // 23 h 30 à Paris le 25 : c'est encore le 25.
    expect(jourLisible('2026-09-25T21:30:00Z')).toBe('25 septembre 2026')
    expect(jourLisible('illisible')).toBe('illisible')
  })
})

/* La base est la seule à écrire une note : ce que la migration accorde au
   navigateur se relit ici, pour qu'une migration future qui l'élargirait se
   voie avant d'être jouée. */
describe('ce que la migration 0053 accorde', () => {
  it('le navigateur ne fait que lire les notes d’honoraires', () => {
    expect(migration).toMatch(/revoke all on public\.notes_honoraires from anon, authenticated;/)
    expect(migration).toMatch(/grant select on public\.notes_honoraires to authenticated;/)
    expect(migration).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on public\.notes_honoraires/i)
  })

  it('aucune politique des tables du dossier ne passe par le revendeur ni par le patient', () => {
    const politiques = migration.match(/create policy[\s\S]*?;/g) ?? []
    expect(politiques.length).toBe(4)
    for (const p of politiques) {
      expect(p).toMatch(/is_cabinet_member\(cabinet_id\)/)
      expect(p).not.toMatch(/reseller|is_patient_record|auth\.uid/)
    }
  })

  it('le journal d’accès ne reçoit que des faits : un numéro, jamais un montant ni un nom', () => {
    const traces = migration.match(/insert into public\.audit_log[\s\S]*?;/g) ?? []
    expect(traces.length).toBe(3)
    for (const t of traces) {
      expect(t).not.toMatch(/montant|beneficiaire|display_name|prestation|texte|motif/)
    }
  })
})
