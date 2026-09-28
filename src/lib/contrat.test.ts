import { describe, expect, it } from 'vitest'
import {
  auteurDit,
  dateDuContrat,
  depuisChampDate,
  essaiBientotFini,
  essaisQuiFinissent,
  finEssaiProposee,
  joursRestants,
  libelleContrat,
  motifATraiter,
  noteDuContrat,
  phraseDuJournal,
  phraseEssaiRestant,
  refusDeReouverture,
  tonContrat,
  versChampDate,
  type ContratDit,
  type EntreeJournal,
} from './contrat'

const MAINTENANT = Date.parse('2026-09-28T10:00:00Z')
const JOUR = 86_400_000

function contrat(partiel: Partial<ContratDit>): ContratDit {
  return { plan: 'cabinet', status: 'actif', enRegle: true, trialEndsAt: null, periodEndAt: null, ...partiel }
}

describe('les jours qui restent', () => {
  it('compte au-dessus : il reste un jour jusqu’à la dernière minute', () => {
    expect(joursRestants(new Date(MAINTENANT + 3 * JOUR).toISOString(), MAINTENANT)).toBe(3)
    expect(joursRestants(new Date(MAINTENANT + 2.2 * JOUR).toISOString(), MAINTENANT)).toBe(3)
    expect(joursRestants(new Date(MAINTENANT + 60_000).toISOString(), MAINTENANT)).toBe(1)
  })

  it('ne compte rien pour une date passée, absente ou illisible', () => {
    expect(joursRestants(new Date(MAINTENANT - 1).toISOString(), MAINTENANT)).toBeNull()
    expect(joursRestants(null, MAINTENANT)).toBeNull()
    expect(joursRestants('pas une date', MAINTENANT)).toBeNull()
  })
})

describe('le bandeau de fin d’essai', () => {
  const dans = (j: number) => new Date(MAINTENANT + j * JOUR).toISOString()

  /* Un contrat actif garde souvent son ancienne date d'essai : il ne doit pas
     annoncer « il vous reste trois jours ». */
  it('ne parle que d’un essai qui court et finit dans la semaine', () => {
    expect(essaiBientotFini({ statut: 'essai', enRegle: true, finEssai: dans(3) }, MAINTENANT)).toBe(3)
    expect(essaiBientotFini({ statut: 'essai', enRegle: true, finEssai: dans(7) }, MAINTENANT)).toBe(7)
    expect(essaiBientotFini({ statut: 'essai', enRegle: true, finEssai: dans(8) }, MAINTENANT)).toBeNull()
    expect(essaiBientotFini({ statut: 'actif', enRegle: true, finEssai: dans(3) }, MAINTENANT)).toBeNull()
    expect(essaiBientotFini({ statut: 'essai', enRegle: false, finEssai: dans(-1) }, MAINTENANT)).toBeNull()
  })

  it('accorde le nombre de jours, et dit le dernier', () => {
    expect(phraseEssaiRestant(3, null)).toBe("Il vous reste 3 jours d'essai.")
    expect(phraseEssaiRestant(1, null)).toBe("C'est le dernier jour de votre période d'essai.")
    expect(phraseEssaiRestant(2, '2026-09-30T12:00:00Z')).toBe("Il vous reste 2 jours d'essai : il prend fin le 30 septembre 2026.")
  })
})

describe('la pastille du contrat', () => {
  /* La même pastille grise disait « Essai » pour un essai qui court et pour
     un essai fini : le revendeur ne distinguait pas les deux dans sa liste. */
  it('distingue l’essai expiré de l’essai qui court', () => {
    expect(libelleContrat(contrat({ status: 'essai', enRegle: true }))).toBe('Essai')
    expect(libelleContrat(contrat({ status: 'essai', enRegle: false }))).toBe('Essai expiré')
    expect(tonContrat({ status: 'essai', enRegle: true })).toBe('neutral')
    expect(tonContrat({ status: 'essai', enRegle: false })).toBe('warn')
  })

  it('met en alerte tout ce qui est hors contrat, résilié compris', () => {
    expect(tonContrat({ status: 'resilie', enRegle: false })).toBe('warn')
    expect(tonContrat({ status: 'impaye', enRegle: false })).toBe('warn')
    expect(tonContrat({ status: 'actif', enRegle: true })).toBe('ok')
  })

  it('ne donne pas de statut à un cabinet sans contrat', () => {
    expect(libelleContrat(contrat({ plan: '', status: 'essai', enRegle: false }))).toBe('Sans contrat')
  })
})

describe('la note et la date du contrat', () => {
  /* « Le contrat court : l'offre s'applique. Essai jusqu'au 15 septembre » :
     une date d'essai passée, lue sur un contrat actif. */
  it('ne montre pas la date d’essai d’un contrat actif', () => {
    const note = noteDuContrat(contrat({ status: 'actif', trialEndsAt: '2026-09-15T08:00:00Z' }))
    expect(note).toBe("Le contrat court : l'offre s'applique.")
    expect(note).not.toMatch(/essai/i)
  })

  it('dit quand un essai a pris fin', () => {
    const note = noteDuContrat(contrat({ status: 'essai', enRegle: false, trialEndsAt: '2026-09-15T12:00:00Z' }))
    expect(note).toMatch(/^Essai expiré le 15 septembre 2026\. Hors contrat/)
  })

  it('dit jusqu’à quand court un essai', () => {
    expect(noteDuContrat(contrat({ status: 'essai', trialEndsAt: '2026-10-12T12:00:00Z' }))).toBe(
      "Essai en cours jusqu'au 12 octobre 2026 : l'offre s'applique.",
    )
  })

  /* « Essai · échéance — » : la ligne lisait la fin de période d'un essai. */
  it('prend la fin d’essai comme date d’un essai', () => {
    expect(dateDuContrat({ status: 'essai', trialEndsAt: '2026-10-12T12:00:00Z', periodEndAt: null })).toBe(
      "Fin d'essai le 12 octobre 2026",
    )
    expect(dateDuContrat({ status: 'actif', trialEndsAt: '2026-09-15T12:00:00Z', periodEndAt: null })).toBe('—')
    expect(motifATraiter(contrat({ status: 'essai', enRegle: false, trialEndsAt: '2026-09-15T12:00:00Z' }))).toBe(
      'Essai expiré le 15 septembre 2026',
    )
    expect(motifATraiter(contrat({ status: 'impaye', enRegle: false }))).toBe('Impayé')
    expect(motifATraiter(contrat({ status: 'impaye', enRegle: false, periodEndAt: '2026-10-01T12:00:00Z' }))).toBe(
      'Impayé · échéance 1 octobre 2026',
    )
  })
})

describe('les essais qui finissent cette semaine', () => {
  const ligne = (id: string, partiel: Partial<ContratDit>) => ({ id, subscription: contrat(partiel) })

  it('les range du plus proche au plus lointain, et laisse le reste', () => {
    const rows = [
      ligne('loin', { status: 'essai', trialEndsAt: new Date(MAINTENANT + 12 * JOUR).toISOString() }),
      ligne('cinq', { status: 'essai', trialEndsAt: new Date(MAINTENANT + 5 * JOUR).toISOString() }),
      ligne('deux', { status: 'essai', trialEndsAt: new Date(MAINTENANT + 2 * JOUR).toISOString() }),
      ligne('fini', { status: 'essai', enRegle: false, trialEndsAt: new Date(MAINTENANT - JOUR).toISOString() }),
      ligne('actif', { status: 'actif', trialEndsAt: new Date(MAINTENANT + 2 * JOUR).toISOString() }),
      ligne('sans', { plan: '', status: 'essai', trialEndsAt: new Date(MAINTENANT + 2 * JOUR).toISOString() }),
    ]
    expect(essaisQuiFinissent(rows, MAINTENANT).map((x) => [x.row.id, x.jours])).toEqual([
      ['deux', 2],
      ['cinq', 5],
    ])
  })
})

describe('les dates saisies', () => {
  it('fait l’aller-retour entre la base et le champ', () => {
    const iso = depuisChampDate('2026-10-12')
    expect(iso).not.toBeNull()
    expect(versChampDate(iso)).toBe('2026-10-12')
  })

  /* Posé à minuit, un essai « jusqu'au 12 octobre » se fermait le 12 au matin. */
  it('pose la fin du jour choisi', () => {
    const d = new Date(depuisChampDate('2026-10-12') as string)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })

  it('refuse une date impossible ou mal formée', () => {
    expect(depuisChampDate('2026-02-30')).toBeNull()
    expect(depuisChampDate('12/10/2026')).toBeNull()
    expect(depuisChampDate('')).toBeNull()
    expect(versChampDate(null)).toBe('')
  })

  it('propose la fin d’essai qui court, sinon quatorze jours', () => {
    const court = new Date(MAINTENANT + 3 * JOUR).toISOString()
    expect(finEssaiProposee(court, MAINTENANT)).toBe(versChampDate(court))
    expect(finEssaiProposee('2026-09-15T12:00:00Z', MAINTENANT)).toBe(
      versChampDate(new Date(MAINTENANT + 14 * JOUR).toISOString()),
    )
    expect(finEssaiProposee(null, MAINTENANT)).toBe(versChampDate(new Date(MAINTENANT + 14 * JOUR).toISOString()))
  })
})

describe('le journal des offres et des contrats', () => {
  const nom = (code: string) => ({ essentiel: 'Essentiel', cabinet: 'Cabinet', reseau: 'Réseau' })[code] ?? code
  const entree = (action: string, meta: Record<string, unknown>): EntreeJournal => ({
    quand: '2026-09-28T10:00:00Z',
    action,
    cabinetId: 'k',
    cabinet: 'Cabinet Fontaine',
    meta,
    auteur: 'vous',
  })

  it('dit un changement d’offre avec les noms d’aujourd’hui', () => {
    expect(phraseDuJournal(entree('contrat.offre', { avant: 'essentiel', apres: 'reseau' }), nom)).toBe(
      'Cabinet Fontaine : offre Essentiel → Réseau.',
    )
  })

  it('dit un changement de statut en toutes lettres', () => {
    expect(phraseDuJournal(entree('contrat.statut', { avant: 'actif', apres: 'resilie' }), nom)).toBe(
      'Cabinet Fontaine : contrat actif → résilié.',
    )
  })

  it('dit une exception levier par levier, au bon genre', () => {
    const phrase = phraseDuJournal(
      entree('contrat.exception', {
        max_patients: { avant: null, apres: 30 },
        shop: { avant: null, apres: false },
        site: { avant: true, apres: null },
      }),
      nom,
    )
    expect(phrase).toBe(
      "Cabinet Fontaine : exception — plafond selon l'offre → 30 fiches ; boutique selon l'offre → fermée ; site vitrine ouvert → selon l'offre.",
    )
  })

  it('dit le réglage d’une offre, prix et leviers compris', () => {
    const phrase = phraseDuJournal(
      {
        ...entree('offre.reglee', {
          code: 'cabinet',
          champs: { price_cents: { avant: 7900, apres: 8900 }, max_patients: { avant: 80, apres: null }, site: { avant: true, apres: false } },
        }),
        cabinet: null,
        cabinetId: null,
      },
      nom,
    )
    expect(phrase).toBe('Offre Cabinet réglée — prix 79,00 € → 89,00 € ; plafond 80 fiches → sans limite ; site vitrine compris → non compris.')
  })

  it('dit une fin d’essai déplacée, et une échéance posée', () => {
    expect(
      phraseDuJournal(entree('contrat.fin_essai', { avant: '2026-10-01T12:00:00Z', apres: '2026-10-15T12:00:00Z' }), nom),
    ).toBe("Cabinet Fontaine : fin d'essai 1 octobre 2026 → 15 octobre 2026.")
    expect(phraseDuJournal(entree('contrat.echeance', { avant: null, apres: '2026-11-01T12:00:00Z' }), nom)).toBe(
      'Cabinet Fontaine : échéance aucune → 1 novembre 2026.',
    )
  })

  it('nomme l’auteur sans nommer personne', () => {
    expect(auteurDit('vous')).toBe('par vous')
    expect(auteurDit('equipe')).toBe('par votre équipe')
    expect(auteurDit('plateforme')).toBe('par la plateforme')
  })
})

describe('la réouverture d’un suivi clos', () => {
  /* Hors contrat, le plafond vaut le nombre de fiches actives : « Closez un
     autre suivi » faisait fermer un suivi pour une place qui ne vient pas. */
  it('dit le contrat avant le plafond, sans proposer de clore', () => {
    const refus = refusDeReouverture({ en_regle: false, max_patients: 3, patients_actives: 3 })
    expect(refus).toMatch(/abonnement n'est plus en cours/)
    expect(refus).not.toMatch(/Closez/)
  })

  it('dit le plafond quand le contrat court', () => {
    expect(refusDeReouverture({ en_regle: true, max_patients: 3, patients_actives: 3 })).toBe(
      'Votre offre permet 3 fiches actives, et elles le sont toutes. Closez un autre suivi, ou demandez à votre revendeur de relever le plafond.',
    )
    expect(refusDeReouverture({ en_regle: true, max_patients: 1, patients_actives: 1 })).toMatch(
      /^Votre offre permet 1 fiche active, et elle l’est\./,
    )
  })

  it('laisse passer sous le plafond, sans plafond, ou sans droits lisibles', () => {
    expect(refusDeReouverture({ en_regle: true, max_patients: 3, patients_actives: 2 })).toBeNull()
    expect(refusDeReouverture({ en_regle: true, max_patients: null, patients_actives: 200 })).toBeNull()
    expect(refusDeReouverture(null)).toBeNull()
  })
})
