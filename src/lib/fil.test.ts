import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  filDesReponses,
  libelleNonLus,
  marquerLue,
  messageRefusReponse,
  momentDit,
  nonLusParFiche,
  pageDuMot,
  phraseLu,
  refusReponse,
  REPONSE_MAX,
  reponsesParPage,
  retourReponse,
  totalNonLus,
} from './fil'
import type { Patient } from '@/types/domain'

/**
 * Le fil entre un patient et son cabinet (0054) : le mot lu, le mot répondu.
 *
 * La base tient qui écrit quoi (supabase/tests/mot_lu_et_repondu.sql) ; ici,
 * ce que les écrans en disent et en font.
 */

/** Un instant local, pour que l'heure dite ne dépende pas du fuseau de la machine. */
const local = (j: number, h: number, m: number) => new Date(2026, 8, j, h, m).toISOString()

describe('momentDit et phraseLu', () => {
  it("disent l'heure comme le reste du produit : « 18 h 05 », « 9 h »", () => {
    expect(momentDit(local(3, 18, 5))).toBe('3 septembre à 18 h 05')
    expect(momentDit(local(3, 9, 0))).toBe('3 septembre à 9 h')
  })

  it('ne disent rien de ce qui n’a pas eu lieu', () => {
    expect(phraseLu(null)).toBe('')
    expect(phraseLu(undefined)).toBe('')
    expect(phraseLu('pas une date')).toBe('')
  })

  it('nomment la thérapeute sans genre ni prénom', () => {
    expect(phraseLu(local(12, 20, 30))).toBe('Lu par votre thérapeute le 12 septembre à 20 h 30')
  })
})

describe('le compteur', () => {
  it('se dit au pluriel juste, et se tait à zéro', () => {
    expect(libelleNonLus(0)).toBe('')
    expect(libelleNonLus(1)).toBe('1 mot non lu')
    expect(libelleNonLus(3)).toBe('3 mots non lus')
  })

  it('ne retient que les fiches qui attendent vraiment', () => {
    expect(
      nonLusParFiche([
        { patient_id: 'a', non_lues: 2 },
        { patient_id: 'b', non_lues: 0 },
      ]),
    ).toEqual({ a: 2 })
  })

  it('fait le total des seules fiches actives', () => {
    // Une fiche close garde ses pages ; elle n'est plus dans la liste.
    expect(totalNonLus({ a: 2, b: 1, close: 4 }, ['a', 'b'])).toBe(3)
    expect(totalNonLus({}, ['a'])).toBe(0)
  })
})

describe('la réponse, avant de partir', () => {
  it('refuse le vide et les seuls espaces', () => {
    expect(refusReponse('')).toMatch(/Écrivez votre réponse/)
    expect(refusReponse('   \n ')).toMatch(/Écrivez votre réponse/)
  })

  it('compte les signes comme la base, émojis et accents compris', () => {
    expect(refusReponse('é'.repeat(REPONSE_MAX))).toBe('')
    expect(refusReponse('🙂'.repeat(REPONSE_MAX))).toBe('')
    // L'espace des milliers est l'espace fine insécable du français.
    expect(refusReponse('a'.repeat(REPONSE_MAX + 3))).toMatch(/^Votre réponse dépasse 2\s000 signes : retirez-en 3\.$/)
  })

  it('ne compte pas les espaces que la base rogne', () => {
    expect(refusReponse(`  ${'a'.repeat(REPONSE_MAX)}  `)).toBe('')
  })
})

describe('la réponse, refusée ou partie', () => {
  it('garde la cause lisible et tait le jargon', () => {
    expect(messageRefusReponse('Ce suivi est clos : son espace est fermé.')).toMatch(/suivi est clos/)
    expect(messageRefusReponse("Cette page n'est pas partagée avec votre cabinet.")).toMatch(/plus partagée/)
    expect(messageRefusReponse('La réponse est vide.')).toBe('La réponse est vide.')
    expect(messageRefusReponse('new row violates row-level security policy')).toMatch(/n'a pas pu partir/)
    expect(messageRefusReponse('new row violates row-level security policy')).not.toMatch(/row-level/)
  })

  it('ne promet le téléphone que s’il est inscrit', () => {
    expect(retourReponse(1)).toMatch(/et sur son téléphone/)
    expect(retourReponse(0)).toMatch(/rappels ne sont pas activés/)
    expect(retourReponse(0)).not.toMatch(/et sur son téléphone/)
  })
})

describe('reponsesParPage', () => {
  const lignes = [
    { id: 'r2', body: 'Deuxième', created_at: '2026-09-04T10:00:00Z', en_reponse_a: 'p1' },
    { id: 'r1', body: 'Première', created_at: '2026-09-03T10:00:00Z', en_reponse_a: 'p1' },
    { id: 'r3', body: 'Ailleurs', created_at: '2026-09-05T10:00:00Z', en_reponse_a: 'p2' },
    // La page a été effacée : la réponse reste un mot du cabinet, sous aucune page.
    { id: 'r4', body: 'Orpheline', created_at: '2026-09-06T10:00:00Z', en_reponse_a: null },
  ]

  it('range chaque réponse sous sa page, dans le sens du temps', () => {
    const parPage = reponsesParPage(lignes)
    expect(Object.keys(parPage).sort()).toEqual(['p1', 'p2'])
    expect(parPage.p1.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(parPage.p1[0]).toEqual({ id: 'r1', texte: 'Première', le: '2026-09-03T10:00:00Z' })
  })

  it('garde la lecture du patient quand elle est lue, et seulement alors', () => {
    const parPage = reponsesParPage([
      { id: 'r1', body: 'x', created_at: '2026-09-03T10:00:00Z', en_reponse_a: 'p1', read_at: null },
      { id: 'r2', body: 'y', created_at: '2026-09-04T10:00:00Z', en_reponse_a: 'p1', read_at: '2026-09-04T11:00:00Z' },
    ])
    expect(parPage.p1.map((r) => r.lueLe)).toEqual([null, '2026-09-04T11:00:00Z'])
    // Côté cabinet, rien n'est lu : la clé n'existe pas.
    expect('lueLe' in reponsesParPage(lignes).p1[0]).toBe(false)
  })

  it('relie chaque mot à sa page, pour « Relire ce que vous aviez écrit »', () => {
    expect(pageDuMot(reponsesParPage(lignes))).toEqual({ r1: 'p1', r2: 'p1', r3: 'p2' })
  })

  it('résume ce qui attend sous une page repliée', () => {
    expect(filDesReponses([])).toBe('')
    expect(filDesReponses([{ id: 'a', texte: '', le: '', lueLe: '2026-09-04T11:00:00Z' }])).toBe('1 réponse')
    expect(
      filDesReponses([
        { id: 'a', texte: '', le: '', lueLe: '2026-09-04T11:00:00Z' },
        { id: 'b', texte: '', le: '', lueLe: null },
      ]),
    ).toBe('2 réponses · 1 nouvelle')
  })
})

describe('marquerLue', () => {
  const fiche = (luLe: string | null): Patient =>
    ({
      name: 'Camille',
      journal: [
        { date: 'lundi', trigger: 'Un mot', text: 'La nuit a été mauvaise.', id: 'p1', luLe },
        { date: 'dimanche', trigger: 'Séance', text: 'Note de séance.' },
      ],
    }) as unknown as Patient

  it("marque l'entrée et fait baisser le compteur de la fiche", () => {
    const suite = marquerLue({ patients: { a: fiche(null) }, nonLus: { a: 2 } }, 'a', 'p1', '2026-09-03T18:05:00Z')
    expect(suite.patients.a.journal[0].luLe).toBe('2026-09-03T18:05:00Z')
    expect(suite.nonLus.a).toBe(1)
  })

  it('ne compte pas deux fois une page déjà lue — la première lecture fait foi', () => {
    const prev = { patients: { a: fiche('2026-09-01T08:00:00Z') }, nonLus: { a: 1 } }
    const suite = marquerLue(prev, 'a', 'p1', '2026-09-03T18:05:00Z')
    expect(suite.patients.a.journal[0].luLe).toBe('2026-09-01T08:00:00Z')
    expect(suite.nonLus).toBe(prev.nonLus)
  })

  it('ne descend jamais sous zéro, et ne touche à rien sans la page', () => {
    expect(marquerLue({ patients: { a: fiche(null) }, nonLus: {} }, 'a', 'p1', 'x').nonLus.a).toBe(0)
    const prev = { patients: { a: fiche(null) }, nonLus: { a: 1 } }
    expect(marquerLue(prev, 'a', 'inconnue', 'x')).toEqual(prev)
    expect(marquerLue(prev, 'b', 'p1', 'x')).toEqual(prev)
  })
})

/* ------------------------------------------------------------------ *
 * Sur le texte du source : ce qui, cassé, ne se verrait qu'en production.
 * ------------------------------------------------------------------ */

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (chemin: string) => readFileSync(join(src, chemin), 'utf8')

describe('qui écrit la lecture', () => {
  /* `lu_le` se pose par la fonction du cabinet, jamais depuis l'espace : la
     base refuse de toute façon (droits par colonne), mais un écran qui
     l'essaierait échouerait en silence à chaque page écrite. */
  it("l'espace du patient ne l'écrit nulle part", () => {
    for (const fichier of ['patient/Journal.tsx', 'patient/MotAuTherapeute.tsx', 'patient/usePatientData.ts']) {
      expect(lire(fichier), fichier).not.toMatch(/\.(insert|update|upsert)\(\s*\{[^}]*lu_le/s)
    }
  })

  it('le cabinet passe par les deux fonctions de la base, pas par les tables', () => {
    const cabinet = lire('cabinet/useCabinet.ts')
    expect(cabinet).toMatch(/rpc\('cabinet_marquer_page_lue'/)
    expect(cabinet).toMatch(/rpc\('cabinet_repondre_a_la_page'/)
    expect(cabinet).not.toMatch(/from\('journal_pages'\)\s*\.update/)
    // Aucune réponse écrite à la main dans les destinataires : la fonction les pose.
    expect(cabinet).not.toMatch(/en_reponse_a:/)
  })

  it('ne journalise jamais le texte d’une page ni d’une réponse', () => {
    const cabinet = lire('cabinet/useCabinet.ts')
    const debut = cabinet.indexOf('const repondreAPage')
    const corps = cabinet.slice(debut, cabinet.indexOf('\n  )\n', debut))
    expect(corps).not.toMatch(/console\./)
  })
})
