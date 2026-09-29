import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEBUT_DU_RAPPEL,
  HEURE_DU_RAPPEL,
  SANS_SEANCE,
  TITRE_DU_RAPPEL,
  capitale,
  etatRappelVeille,
  instantDeParis,
  jourEtHeure,
  jourValide,
  libelleProchaineSeance,
  libelleSeance,
  libelleSeanceProche,
  momentDuRappel,
  parProchaineSeance,
  phraseRappelVeille,
  refusSeance,
  sansProchaineSeance,
  seanceAVenir,
  seancePourLePatient,
  seancesDuJour,
  texteDuRappel,
} from './agenda'

/** Mardi 29 septembre 2026, 10 h à Paris (heure d'été, UTC+2). */
const MARDI_10H = new Date('2026-09-29T08:00:00Z')
const iso = (jour: string, heure: string) => (instantDeParis(jour, heure) as Date).toISOString()

describe("l'heure de Paris", () => {
  it("rend l'instant d'un jour et d'une heure, été comme hiver", () => {
    expect(iso('2026-09-30', '14:30')).toBe('2026-09-30T12:30:00.000Z')
    expect(iso('2026-11-03', '14:30')).toBe('2026-11-03T13:30:00.000Z')
  })

  it('tient les deux jours de changement d’heure', () => {
    // 25 octobre 2026 : on recule à 3 h ; le soir est déjà à UTC+1.
    expect(iso('2026-10-25', '18:00')).toBe('2026-10-25T17:00:00.000Z')
    expect(iso('2026-10-25', '01:30')).toBe('2026-10-24T23:30:00.000Z')
    // 29 mars 2026 : on avance à 2 h ; le soir est à UTC+2.
    expect(iso('2026-03-29', '18:00')).toBe('2026-03-29T16:00:00.000Z')
  })

  it('refuse une saisie incomplète ou impossible', () => {
    expect(instantDeParis('', '14:00')).toBeNull()
    expect(instantDeParis('2026-09-31', '14:00')).toBeNull()
    expect(instantDeParis('2026-09-30', '')).toBeNull()
    expect(instantDeParis('2026-09-30', '24:00')).toBeNull()
    expect(jourValide('2026-02-29')).toBe(false)
    expect(jourValide('2028-02-29')).toBe(true)
  })

  it('accepte les secondes que rend un champ d’heure de téléphone', () => {
    expect(iso('2026-09-30', '14:30:00')).toBe('2026-09-30T12:30:00.000Z')
  })

  it('relit le jour et l’heure d’un instant enregistré', () => {
    expect(jourEtHeure('2026-11-03T13:30:00Z')).toEqual({ jour: '2026-11-03', heure: '14:30' })
    // 23 h 30 UTC le 30, c'est déjà le 1er octobre à Paris.
    expect(jourEtHeure('2026-09-30T23:30:00Z')).toEqual({ jour: '2026-10-01', heure: '01:30' })
    expect(jourEtHeure(null)).toEqual({ jour: '', heure: '' })
    expect(jourEtHeure('pas une date')).toEqual({ jour: '', heure: '' })
  })
})

describe('les libellés', () => {
  it('dit la séance en absolu, avec l’année seulement si elle change', () => {
    expect(libelleSeance(iso('2026-10-06', '14:30'), MARDI_10H)).toBe('mardi 6 octobre, 14 h 30')
    expect(libelleSeance(iso('2026-10-06', '09:00'), MARDI_10H)).toBe('mardi 6 octobre, 9 h')
    expect(libelleSeance(iso('2027-01-05', '14:00'), MARDI_10H)).toBe('mardi 5 janvier 2027, 14 h')
  })

  it("dit « aujourd'hui » et « demain » au patient", () => {
    expect(libelleSeanceProche(iso('2026-09-29', '17:15'), MARDI_10H)).toBe("aujourd'hui, 17 h 15")
    expect(libelleSeanceProche(iso('2026-09-30', '09:00'), MARDI_10H)).toBe('demain, 9 h')
    expect(libelleSeanceProche(iso('2026-10-02', '09:00'), MARDI_10H)).toBe('vendredi 2 octobre, 9 h')
    expect(capitale("aujourd'hui, 9 h")).toBe("Aujourd'hui, 9 h")
  })

  it('la fiche montre la séance datée, le texte d’avant, ou rien', () => {
    expect(libelleProchaineSeance(iso('2026-10-06', '14:30'), 'Jeudi 14 h', MARDI_10H)).toBe(
      'Mardi 6 octobre, 14 h 30',
    )
    // Du matin même : on la cherche encore ce jour-là.
    expect(libelleProchaineSeance(iso('2026-09-29', '08:00'), null, MARDI_10H)).toBe('Mardi 29 septembre, 8 h')
    // Passée la veille : plus rien de planifié — le vieux texte ne reprend pas la main.
    expect(libelleProchaineSeance(iso('2026-09-28', '14:00'), 'Jeudi 14 h', MARDI_10H)).toBe(SANS_SEANCE)
    expect(libelleProchaineSeance(null, '  Jeudi 14 h ', MARDI_10H)).toBe('Jeudi 14 h')
    expect(libelleProchaineSeance(null, '', MARDI_10H)).toBe(SANS_SEANCE)
  })

  it('« Ma journée » montre la séance datée à venir, sinon le texte d’avant', () => {
    expect(seancePourLePatient(iso('2026-09-30', '09:00'), 'vieux texte', MARDI_10H)).toBe('Demain, 9 h')
    expect(seancePourLePatient(iso('2026-09-20', '09:00'), 'vieux texte', MARDI_10H)).toBeNull()
    expect(seancePourLePatient(null, 'Jeudi, 14 h', MARDI_10H)).toBe('Jeudi, 14 h')
    expect(seancePourLePatient(null, '   ', MARDI_10H)).toBeNull()
  })
})

describe('la liste des patients', () => {
  it('« sans prochaine séance » se lit sur la vraie date', () => {
    expect(sansProchaineSeance({ prochaineSeanceLe: null, nextSession: 'Jeudi 14 h' }, MARDI_10H)).toBe(true)
    expect(sansProchaineSeance({ prochaineSeanceLe: iso('2026-10-01', '09:00'), nextSession: '' }, MARDI_10H)).toBe(false)
    // La séance du matin est faite : la suivante reste à fixer.
    expect(sansProchaineSeance({ prochaineSeanceLe: iso('2026-09-29', '08:00'), nextSession: '' }, MARDI_10H)).toBe(true)
    // La démonstration n'a que du texte.
    expect(sansProchaineSeance({ nextSession: 'Aucune séance planifiée' }, MARDI_10H)).toBe(true)
    expect(sansProchaineSeance({ nextSession: 'Prochaine séance jeudi 14 h' }, MARDI_10H)).toBe(false)
    expect(seanceAVenir('n’importe quoi', MARDI_10H)).toBe(false)
  })

  it('se range par prochaine séance, les fiches sans séance ensuite, dans leur ordre', () => {
    const fiches = [
      { id: 'a', prochaineSeanceLe: null },
      { id: 'b', prochaineSeanceLe: iso('2026-10-05', '09:00') },
      { id: 'c', prochaineSeanceLe: iso('2026-09-20', '09:00') },
      { id: 'd', prochaineSeanceLe: iso('2026-09-30', '18:00') },
      { id: 'e' },
    ]
    expect(parProchaineSeance(fiches, MARDI_10H).map((f) => f.id)).toEqual(['d', 'b', 'a', 'c', 'e'])
    // L'original n'est pas touché.
    expect(fiches.map((f) => f.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it("« Aujourd'hui » : les séances du jour de Paris, dans l'ordre de l'horloge", () => {
    const jour = seancesDuJour(
      [
        { id: 'a', nom: 'Anna', prochaineSeanceLe: iso('2026-09-29', '16:30') },
        { id: 'b', nom: 'Bea', prochaineSeanceLe: iso('2026-09-29', '09:00') },
        { id: 'c', nom: 'Cleo', prochaineSeanceLe: iso('2026-09-30', '09:00') },
        { id: 'd', nom: 'Dan', prochaineSeanceLe: null },
        // 23 h 30 à Paris : encore aujourd'hui, même si UTC dit autre chose.
        { id: 'e', nom: 'Eve', prochaineSeanceLe: '2026-09-29T21:30:00Z' },
      ],
      MARDI_10H,
    )
    expect(jour).toEqual([
      { id: 'b', nom: 'Bea', heure: '9 h', passee: true },
      { id: 'a', nom: 'Anna', heure: '16 h 30', passee: false },
      { id: 'e', nom: 'Eve', heure: '23 h 30', passee: false },
    ])
    expect(seancesDuJour([], MARDI_10H)).toEqual([])
  })
})

describe('le rappel de la veille', () => {
  it('dit l’heure comme la base l’écrit', () => {
    expect(texteDuRappel(iso('2026-10-06', '14:30'))).toBe('Votre séance est demain à 14 h 30.')
    expect(texteDuRappel(iso('2026-10-06', '09:00'))).toBe('Votre séance est demain à 9 h.')
    expect(texteDuRappel(iso('2026-10-06', '09:05'))).toBe('Votre séance est demain à 9 h 05.')
  })

  it('part la veille à 18 h, heure de Paris, même au changement d’heure', () => {
    expect(momentDuRappel(iso('2026-10-06', '14:30'))?.toISOString()).toBe('2026-10-05T16:00:00.000Z')
    expect(momentDuRappel(iso('2026-10-26', '09:00'))?.toISOString()).toBe('2026-10-25T17:00:00.000Z')
    expect(momentDuRappel(iso('2026-03-30', '09:00'))?.toISOString()).toBe('2026-03-29T16:00:00.000Z')
    expect(momentDuRappel('')).toBeNull()
  })

  it('annonce ce que la base fera', () => {
    expect(etatRappelVeille(null, false, MARDI_10H)).toBe('sans-seance')
    expect(etatRappelVeille(iso('2026-10-06', '14:30'), true, MARDI_10H)).toBe('clos')
    expect(etatRappelVeille(iso('2026-09-28', '14:30'), false, MARDI_10H)).toBe('passee')
    expect(etatRappelVeille(iso('2026-10-06', '14:30'), false, MARDI_10H)).toBe('prevu')
    // Demain matin, et il est 10 h : le rappel part ce soir.
    expect(etatRappelVeille(iso('2026-09-30', '09:00'), false, MARDI_10H)).toBe('prevu')
    // Cet après-midi : la veille à 18 h est derrière nous.
    expect(etatRappelVeille(iso('2026-09-29', '16:00'), false, MARDI_10H)).toBe('trop-tard')

    expect(phraseRappelVeille(iso('2026-09-30', '09:00'), false, MARDI_10H)).toBe(
      "Rappel aujourd'hui à 18 h : « Votre séance est demain à 9 h. »",
    )
    expect(phraseRappelVeille(iso('2026-10-06', '14:30'), false, MARDI_10H)).toBe(
      'Rappel lundi 5 octobre à 18 h : « Votre séance est demain à 14 h 30. »',
    )
    expect(phraseRappelVeille(iso('2026-09-29', '16:00'), false, MARDI_10H)).toMatch(/pas de rappel automatique/)
    expect(phraseRappelVeille(null, false, MARDI_10H)).toMatch(/^Datez la séance/)
    expect(phraseRappelVeille(iso('2026-10-06', '14:30'), true, MARDI_10H)).toBe('Suivi clos : aucun rappel ne part.')
  })
})

describe('la saisie de la date', () => {
  const enregistree = iso('2026-09-20', '14:00')

  it('laisse passer une date à venir, ou rien', () => {
    expect(refusSeance('2026-10-06', '14:30', null, MARDI_10H)).toBeNull()
    expect(refusSeance('', '', null, MARDI_10H)).toBeNull()
  })

  it('demande le jour et l’heure ensemble', () => {
    expect(refusSeance('2026-10-06', '', null, MARDI_10H)).toBe("Choisissez aussi l'heure de la séance.")
    expect(refusSeance('', '14:30', null, MARDI_10H)).toBe('Choisissez aussi le jour de la séance.')
  })

  it('refuse une date passée qu’on vient de choisir — pas celle qu’on ne touche pas', () => {
    expect(refusSeance('2026-09-28', '14:00', null, MARDI_10H)).toMatch(/déjà passée/)
    expect(refusSeance('2026-09-20', '14:00', enregistree, MARDI_10H)).toBeNull()
  })

  it("refuse une année de trop", () => {
    expect(refusSeance('2028-10-06', '14:00', null, MARDI_10H)).toMatch(/plus d'un an/)
  })
})

describe('la base dit la même chose que l’écran', () => {
  const ici = dirname(fileURLToPath(import.meta.url))
  const migration = readFileSync(join(ici, '../../supabase/migrations/0059_la_seance_a_une_date.sql'), 'utf8')

  it('le même mot, le même titre, la même heure', () => {
    expect(migration).toContain(`'${DEBUT_DU_RAPPEL}' || public.heure_de_la_seance(new.next_session_at) || '.'`)
    expect(migration).toContain(`'${TITRE_DU_RAPPEL}'`)
    expect(migration).toContain(`time '${HEURE_DU_RAPPEL}'`)
    expect(migration).toContain("at time zone 'Europe/Paris'")
  })

  it('le rappel ne se lit ni ne s’écrit depuis le navigateur', () => {
    expect(migration).toContain('revoke all on table public.rappels_de_seance from anon, authenticated;')
    expect(migration).not.toMatch(/create policy[^;]*on public\.rappels_de_seance/)
  })

  it('un mot déjà dû ne s’annule jamais', () => {
    const annulations = migration.match(/delete from public\.push_notifications[^;]*;/g) ?? []
    expect(annulations.length).toBeGreaterThan(0)
    for (const a of annulations) expect(a).toContain('n.scheduled_at > now()')
  })
})
