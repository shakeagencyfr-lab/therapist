import { describe, expect, it } from 'vitest'
import { initialState } from './state'
import {
  axisBand,
  etatDeReprise,
  moduleProgress,
  notifRows,
  nouvelleSeance,
  profilePrecision,
  riskColor,
  sidebarPatients,
  slippingPatients,
} from './selectors'

describe('nouvelleSeance', () => {
  it('remet toute la captation à zéro et fixe la fiche', () => {
    const patch = nouvelleSeance('nadia')
    expect(patch.sessionPatient).toBe('nadia')
    expect(patch.consent).toBe(false)
    expect(patch.transcript).toBe('')
    expect(patch.draft).toBeNull()
    expect(patch.draftMaquette).toBe(false)
    expect(patch.sent).toBe(false)
  })
  it('sans argument, aucune fiche', () => {
    expect(nouvelleSeance().sessionPatient).toBe('')
  })
})

describe('etatDeReprise — un brouillon repris là où il s’était arrêté', () => {
  const o = {
    id: 's1',
    ouverteLe: '2026-09-29T10:00:00Z',
    sansEnregistrement: true,
    transcript: '',
    notes: 'Notes',
    dureeSecondes: 0,
    draft: { synthese: 'S' } as never,
    choix: { proposalOff: { 0: true }, sugOff: {}, syntheseOk: true },
  }
  it('rouvre la séance, ses notes, son brouillon et ses choix', () => {
    const e = etatDeReprise(o, 'nadia')
    expect(e).toMatchObject({
      sessionPatient: 'nadia',
      sessionId: 's1',
      consent: true,
      sent: false,
      sessionNotes: 'Notes',
      proposalOff: { 0: true },
      syntheseOk: true,
    })
    expect(e.draft).toEqual({ synthese: 'S' })
  })
  it('une séance sans enregistrement le reste : notes seules', () => {
    expect(etatDeReprise(o, 'nadia')).toMatchObject({ sansEnregistrement: true, capture: 'notes' })
    expect(etatDeReprise({ ...o, sansEnregistrement: false }, 'nadia').capture).toBeUndefined()
  })
})

describe('profilePrecision — la règle du prototype', () => {
  it('marge = max(3, round(26 − séances × 3))', () => {
    const p = profilePrecision(initialState, 'camille')
    const sessions = initialState.patients['camille']!.sessions
    expect(p.margin).toBe(Math.max(3, Math.round(26 - sessions * 3)))
  })
  it('une actualisation compte une séance de plus', () => {
    const avant = profilePrecision(initialState, 'camille')
    const apres = profilePrecision(
      { ...initialState, profNew: { camille: initialState.patients['camille']!.profile } },
      'camille',
    )
    expect(apres.sessions).toBe(avant.sessions + 1)
    expect(apres.fresh).toBe(true)
  })
  it('tient sur une fiche absente', () => {
    expect(profilePrecision(initialState, 'personne').maturity).toBe('Ébauche')
  })
})

describe('axisBand borne 0–100', () => {
  it('ne déborde ni en bas ni en haut', () => {
    expect(axisBand(2, 10)).toEqual({ lo: 0, hi: 12 })
    expect(axisBand(97, 10)).toEqual({ lo: 87, hi: 100 })
  })
})

describe('riskColor', () => {
  it('trois paliers', () => {
    expect(riskColor(20)).toContain('high')
    expect(riskColor(60)).toContain('mid')
    expect(riskColor(90)).toContain('low')
  })
})

describe('barre latérale', () => {
  it('sans recherche, toutes les fiches, dans l’ordre', () => {
    expect(sidebarPatients(initialState).map((r) => r.id)).toEqual(initialState.patientOrder)
  })
  it('la recherche porte aussi sur le sous-titre', () => {
    const sub = initialState.patients[initialState.patientOrder[0]!]!.subtitle.split(' ')[0]!
    const rows = sidebarPatients({ ...initialState, q: sub.toLowerCase() })
    expect(rows.length).toBeGreaterThan(0)
  })
  it('une fiche décroche sous 50 % d’assiduité', () => {
    const slipping = slippingPatients(initialState)
    expect(slipping.length).toBeGreaterThan(0)
    for (const id of slipping) expect(initialState.patients[id]!.adherence).toBeLessThan(50)
  })
})

/**
 * Chaque jour se coche (0051) : la case d'un module dit « fait aujourd'hui ».
 * Le décrochage et les retards se lisent sur la semaine, sans quoi toute la
 * patientèle décrochait chaque matin avant d'avoir rien pu faire.
 */
describe('la semaine, pas la case du matin', () => {
  const camille = initialState.patients['camille']!
  const fiche = (adherence: number, septJours: { faits: number; possibles: number }) => ({
    ...initialState,
    extra: {},
    done: {},
    patients: {
      ...initialState.patients,
      camille: {
        ...camille,
        adherence,
        modules: [
          { title: 'Trois respirations', meta: '', kind: 'Exercice' as const, done: false, id: 'm1', septJours },
          { title: 'Retour au calme', meta: '', kind: 'Audio' as const, done: false, id: 'm2' },
        ],
      },
    },
  })

  it('rien de coché ce matin, six jours faits sur sept : ni décrochage ni retard', () => {
    const etat = fiche(86, { faits: 6, possibles: 7 })
    expect(slippingPatients(etat)).not.toContain('camille')
    expect(notifRows(etat).find((r) => r.key === 'camille')?.reason).not.toContain('en retard')
  })

  it('pas un jour fait de la semaine : décrochage, et un module en retard', () => {
    const etat = fiche(0, { faits: 0, possibles: 7 })
    expect(slippingPatients(etat)).toContain('camille')
    expect(notifRows(etat).find((r) => r.key === 'camille')?.reason).toContain('1 module en retard')
  })

  it('tout vient d’être confié : rien à juger encore', () => {
    expect(slippingPatients(fiche(0, { faits: 0, possibles: 0 }))).not.toContain('camille')
  })
})

describe('profilePrecision — le compteur de séances', () => {
  const fiche = (sessions: number, totalSessions: number) => ({
    ...initialState,
    patients: {
      ...initialState.patients,
      camille: { ...initialState.patients['camille']!, sessions, totalSessions },
    },
  })

  it('sans actualisation, compte les séances de la fiche et rien de plus', () => {
    expect(profilePrecision(fiche(1, 6), 'camille').sessions).toBe(1)
    expect(profilePrecision(fiche(1, 6), 'camille').label).toBe('Ébauche · 1 séance')
  })

  it('une actualisation compte la séance en cours, que la fiche ignore encore', () => {
    const etat = { ...fiche(1, 6), profNew: { camille: initialState.patients['camille']!.profile } }
    expect(profilePrecision(etat, 'camille').sessions).toBe(2)
  })

  it('ne dit jamais « stabilisé » sans nombre de séances prévu', () => {
    // C'était le cas d'une fiche neuve : 1 / 0 à l'écran, et un profil déclaré
    // stabilisé dès la quatrième séance parce que 4 dépasse 0.
    expect(profilePrecision(fiche(8, 0), 'camille').maturity).toBe('Consolidé')
    expect(profilePrecision(fiche(8, 8), 'camille').maturity).toBe('Stabilisé')
    expect(profilePrecision(fiche(5, 8), 'camille').maturity).toBe('Consolidé')
  })
})

/**
 * L'assiduité ne compte que ce que le patient peut faire.
 *
 * Constaté en production : deux modules « Audio » et deux « Échelle », issus
 * de séances, jamais cochés — l'espace du patient ne les montre pas comme des
 * tâches. Comptés, ils faisaient baisser l'assiduité et déclenchaient
 * l'alerte de décrochage.
 */
describe('moduleProgress — des tâches seulement', () => {
  const camille = initialState.patients['camille']!
  const etat = {
    ...initialState,
    extra: {},
    done: {},
    patients: {
      ...initialState.patients,
      camille: {
        ...camille,
        modules: [
          { title: 'Trois respirations', meta: '', kind: 'Exercice' as const, done: true },
          { title: 'Retour au calme', meta: '', kind: 'Audio' as const, done: false },
          { title: 'Note du soir', meta: '', kind: 'Échelle' as const, done: false },
          { title: 'Trois lignes', meta: '', kind: 'Écriture' as const, done: false },
        ],
      },
    },
  }

  it('ni l’audio ni l’échelle ne comptent, faits ou non', () => {
    expect(moduleProgress(etat, 'camille')).toEqual({ done: 1, total: 2 })
  })

  it('une fiche n’est pas « en décrochage » pour ce qu’elle ne pouvait pas faire', () => {
    // 1 sur 4 si l'on comptait tout : décrochage. 1 sur 2 : pas encore.
    expect(slippingPatients(etat)).not.toContain('camille')
  })

  it('une case cochée localement garde son rang dans la liste entière', () => {
    // Le rang 3 est « Trois lignes » : le filtre ne décale pas les clés.
    expect(moduleProgress({ ...etat, done: { 'camille:3': true } }, 'camille')).toEqual({ done: 2, total: 2 })
  })

  it('les modules en retard des notifications ne comptent que les tâches', () => {
    const ligne = notifRows(etat).find((r) => r.key === 'camille')
    expect(ligne?.reason).toContain('1 module en retard')
  })
})

/* LA LISTE DES PATIENTS SUR LA VRAIE DATE (0059). Trois fiches réelles :
   une séance demain, une ce matin (faite), une sans date mais avec le texte
   d'avant. Le filtre et le tri se lisent sur l'instant, pas sur le texte. */
describe('la liste des patients, datée', () => {
  const MARDI_10H = new Date('2026-09-29T08:00:00Z')
  const base = initialState.patients[initialState.patientOrder[0]!]!
  const fiche = (name: string, prochaineSeanceLe: string | null, nextSession = '') => ({
    ...base,
    name,
    subtitle: '',
    nextSession,
    prochaineSeanceLe,
    prochaineSeanceTexte: prochaineSeanceLe ? null : nextSession,
  })
  const etat = {
    ...initialState,
    patients: {
      texte: fiche('Anna', null, 'Jeudi 14 h'),
      demain: fiche('Bea', '2026-09-30T07:00:00Z'),
      matin: fiche('Cleo', '2026-09-29T06:00:00Z'),
    },
    patientOrder: ['texte', 'demain', 'matin'],
  }

  it('« sans prochaine séance » garde le texte d’avant et la séance déjà faite', () => {
    const ids = sidebarPatients({ ...etat, pSansSeance: true }, MARDI_10H).map((r) => r.id)
    expect(ids).toEqual(['texte', 'matin'])
  })

  it('rangée par prochaine séance, la plus proche d’abord', () => {
    const ids = sidebarPatients({ ...etat, pParSeance: true }, MARDI_10H).map((r) => r.id)
    expect(ids).toEqual(['demain', 'texte', 'matin'])
  })

  it('sans réglage, l’ordre d’arrivée', () => {
    expect(sidebarPatients(etat, MARDI_10H).map((r) => r.id)).toEqual(['texte', 'demain', 'matin'])
  })

  it('la recherche se combine au filtre', () => {
    const ids = sidebarPatients({ ...etat, pSansSeance: true, q: 'cleo' }, MARDI_10H).map((r) => r.id)
    expect(ids).toEqual(['matin'])
  })

  it('les notifications disent « sans rendez-vous » sur la vraie date', () => {
    const sans = notifRows(etat, MARDI_10H).filter((r) => r.reason.includes('sans rendez-vous')).map((r) => r.key)
    expect(sans).toContain('texte')
    expect(sans).not.toContain('demain')
  })
})
