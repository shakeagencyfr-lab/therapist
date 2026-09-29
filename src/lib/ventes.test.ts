import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { totalDesVentes } from './boutique'
import { composerRecu } from './recuPdf'
import {
  annonceDuRemboursement,
  bilanDuLivre,
  bornesDeLaPeriode,
  champCsv,
  contenuDuRecu,
  csvDuLivre,
  dateCsv,
  ecrituresDuLivre,
  initialesDe,
  lienStripe,
  minuitAParis,
  montantCsv,
  nomFichierRecu,
  nomFichierVentes,
  periodeDite,
  periodePredefinie,
  phraseDuBilan,
  referenceDeCommande,
  refusPeriode,
  type CommandeLue,
  type DonneesRecu,
  type IssueRemboursement,
} from './ventes'

const ici = dirname(fileURLToPath(import.meta.url))
const lire = (chemin: string) => readFileSync(join(ici, chemin), 'utf8')

describe('la référence d’une commande', () => {
  it('se lit en deux groupes de quatre, tirés de son identifiant', () => {
    expect(referenceDeCommande('3f2a9c1b-0d4e-4a1b-9c2d-123456789abc')).toBe('3F2A-9C1B')
  })
  it('ne porte aucune marque : en marque blanche, le reçu est celui du cabinet', () => {
    expect(referenceDeCommande('3f2a9c1b-0d4e-4a1b-9c2d-123456789abc')).not.toMatch(/KL|klaro/i)
  })
})

describe('les initiales — le livre ne nomme personne par défaut', () => {
  it('garde une lettre par mot, et par partie d’un nom composé', () => {
    expect(initialesDe('Camille Martin')).toBe('C. M.')
    expect(initialesDe('jean-pierre dupont')).toBe('J.-P. D.')
    expect(initialesDe('Élodie')).toBe('É.')
    expect(initialesDe('  Nadia   Belkacem ')).toBe('N. B.')
  })
  it('rend une chaîne vide plutôt qu’un nom inventé', () => {
    expect(initialesDe('')).toBe('')
    expect(initialesDe(null)).toBe('')
    expect(initialesDe('  ')).toBe('')
  })
})

describe('la période, au calendrier de Paris', () => {
  const MARDI = new Date('2026-09-29T08:00:00Z')

  it('propose le mois, le mois dernier, l’année et l’année dernière, entiers', () => {
    expect(periodePredefinie('mois', MARDI)).toEqual({ du: '2026-09-01', au: '2026-09-30' })
    expect(periodePredefinie('mois-precedent', MARDI)).toEqual({ du: '2026-08-01', au: '2026-08-31' })
    expect(periodePredefinie('annee', MARDI)).toEqual({ du: '2026-01-01', au: '2026-12-31' })
    expect(periodePredefinie('annee-precedente', MARDI)).toEqual({ du: '2025-01-01', au: '2025-12-31' })
  })

  it('passe l’année en janvier, et connaît février des années bissextiles', () => {
    expect(periodePredefinie('mois-precedent', new Date('2026-01-15T10:00:00Z'))).toEqual({
      du: '2025-12-01',
      au: '2025-12-31',
    })
    expect(periodePredefinie('mois-precedent', new Date('2028-03-10T10:00:00Z'))).toEqual({
      du: '2028-02-01',
      au: '2028-02-29',
    })
  })

  it('compte le jour de Paris, pas celui de Greenwich', () => {
    // 31 août, 22 h 30 à Londres : déjà le 1er septembre à Paris.
    expect(periodePredefinie('mois', new Date('2026-08-31T22:30:00Z')).du).toBe('2026-09-01')
  })

  it('fait commencer un jour à minuit de Paris, été comme hiver, et les jours de changement d’heure', () => {
    expect(minuitAParis('2026-09-01')).toBe('2026-08-31T22:00:00.000Z')
    expect(minuitAParis('2026-01-01')).toBe('2025-12-31T23:00:00.000Z')
    expect(minuitAParis('2026-03-29')).toBe('2026-03-28T23:00:00.000Z')
    expect(minuitAParis('2026-03-30')).toBe('2026-03-29T22:00:00.000Z')
    expect(minuitAParis('2026-10-25')).toBe('2026-10-24T22:00:00.000Z')
    expect(minuitAParis('2026-10-26')).toBe('2026-10-25T23:00:00.000Z')
  })

  it('borne la période du premier minuit au minuit qui suit le dernier jour', () => {
    expect(bornesDeLaPeriode('2026-09-01', '2026-09-30')).toEqual({
      debut: '2026-08-31T22:00:00.000Z',
      fin: '2026-09-30T22:00:00.000Z',
    })
    // Octobre change d'heure en route : la fin est à l'heure d'hiver.
    expect(bornesDeLaPeriode('2026-10-01', '2026-10-31').fin).toBe('2026-10-31T23:00:00.000Z')
  })

  it('refuse une date absente, impossible, ou une période à l’envers', () => {
    expect(refusPeriode('', '2026-09-30')).toMatch(/date de début/)
    expect(refusPeriode('2026-02-30', '2026-03-01')).toMatch(/date de début/)
    expect(refusPeriode('2026-10-01', '2026-09-01')).toBe('La date de début vient après la date de fin.')
    expect(refusPeriode('2026-09-01', '2026-09-01')).toBe('')
  })

  it('se dit comme on la dirait', () => {
    expect(periodeDite('2026-09-01', '2026-09-30')).toBe('du 1er au 30 septembre 2026')
    expect(periodeDite('2026-09-12', '2026-10-04')).toBe('du 12 septembre au 4 octobre 2026')
    expect(periodeDite('2025-12-15', '2026-01-15')).toBe('du 15 décembre 2025 au 15 janvier 2026')
    expect(periodeDite('2026-10-03', '2026-10-03')).toBe('le 3 octobre 2026')
  })
})

/* Le jeu de l'épreuve SQL (supabase/tests/ventes.sql), en commandes lues. */
const commande = (c: Partial<CommandeLue> & Pick<CommandeLue, 'id' | 'title' | 'amount_cents' | 'status'>): CommandeLue => ({
  currency: 'eur',
  paid_at: null,
  rembourse_at: null,
  stripe_session_id: `cs_test_${c.id}`,
  stripe_payment_intent: null,
  patient: { display_name: 'Camille Martin' },
  ...c,
})

const SEPTEMBRE = bornesDeLaPeriode('2026-09-01', '2026-09-30')
const CARNET: CommandeLue[] = [
  commande({
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'Ancrage du soir',
    amount_cents: 2990,
    status: 'remboursee',
    paid_at: '2026-09-12T08:00:00Z',
    rembourse_at: '2026-09-20T09:00:00Z',
    stripe_payment_intent: 'pi_0058Payee',
  }),
  commande({
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    title: 'Sommeil profond',
    amount_cents: 1500,
    status: 'remboursee',
    paid_at: '2026-08-20T16:00:00Z',
    rembourse_at: '2026-09-05T06:00:00Z',
    patient: { display_name: 'Dominique Roy' },
  }),
  commande({
    id: 'cccccccc-0000-4000-8000-000000000003',
    title: 'Programme',
    amount_cents: 9000,
    status: 'payee',
    paid_at: '2026-09-15T07:00:00Z',
    patient: { display_name: 'Dominique Roy' },
  }),
  commande({ id: 'dddddddd-0000-4000-8000-000000000004', title: 'Séance', amount_cents: 6000, status: 'en_attente' }),
  commande({
    id: 'eeeeeeee-0000-4000-8000-000000000005',
    title: 'Hors période',
    amount_cents: 4000,
    status: 'payee',
    paid_at: '2026-10-01T09:00:00Z',
  }),
]

describe('le livre des recettes', () => {
  it('compte l’argent quand il bouge : encaissé à sa date, rendu à la sienne, en négatif', () => {
    const e = ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false })
    expect(e.map((x) => [x.produit, x.operation, x.montantCents])).toEqual([
      ['Sommeil profond', 'remboursement', -1500],
      ['Ancrage du soir', 'vente', 2990],
      ['Programme', 'vente', 9000],
      ['Ancrage du soir', 'remboursement', -2990],
    ])
    // Le même net que l'épreuve SQL : 75,00 €.
    expect(bilanDuLivre(e)).toEqual({
      ventes: 2,
      remboursements: 2,
      encaisseCents: 11990,
      rembourseCents: 4490,
      netCents: 7500,
    })
  })

  it('ne met au livre ni une commande en attente ni une vente hors période', () => {
    const produits = ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false }).map((x) => x.produit)
    expect(produits).not.toContain('Séance')
    expect(produits).not.toContain('Hors période')
  })

  it('écrit des initiales par défaut, le nom complet sur demande seulement', () => {
    const discret = ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false })
    expect(new Set(discret.map((x) => x.patient))).toEqual(new Set(['C. M.', 'D. R.']))
    expect(csvDuLivre(discret)).not.toMatch(/Camille|Martin|Dominique|Roy/)
    const nomme = ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: true })
    expect(nomme.map((x) => x.patient)).toContain('Camille Martin')
  })

  it('porte la référence du reçu et les identifiants Stripe', () => {
    const [, vente] = ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false })
    expect(vente.reference).toBe('AAAA-AAAA')
    expect(vente.commandeStripe).toBe('cs_test_aaaaaaaa-0000-4000-8000-000000000001')
    expect(vente.paiementStripe).toBe('pi_0058Payee')
    expect(vente.statut).toBe('Remboursée')
  })

  it('se résume en une phrase, pluriels compris', () => {
    const b = bilanDuLivre(ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false }))
    expect(phraseDuBilan(b)).toBe('2 ventes et 2 remboursements · 75,00 € encaissés au net')
    expect(phraseDuBilan({ ventes: 1, remboursements: 0, encaisseCents: 990, rembourseCents: 0, netCents: 990 })).toBe(
      '1 vente · 9,90 € encaissés au net',
    )
    expect(phraseDuBilan(bilanDuLivre([]))).toMatch(/^Aucune vente/)
  })
})

describe('le fichier, pour Excel en français', () => {
  const csv = csvDuLivre(ecrituresDuLivre(CARNET, SEPTEMBRE, { nomsComplets: false }))

  it('s’annonce en UTF-8, sépare au point-virgule, finit ses lignes à la Windows', () => {
    expect(csv.startsWith('﻿Date;Opération;Produit;Patient;Montant;Devise;Statut;Référence;Commande Stripe;Paiement Stripe\r\n')).toBe(true)
    expect(csv.split('\r\n')).toHaveLength(6) // en-tête, quatre écritures, fin de fichier
    expect(csv).toContain('05/09/2026;Remboursement;Sommeil profond;D. R.;-15,00;EUR;Remboursée;BBBB-BBBB;')
    expect(csv).toContain('15/09/2026;Vente;Programme;D. R.;90,00;EUR;Payée;CCCC-CCCC;')
  })

  it('écrit les montants à la française, sans séparateur de milliers ni symbole', () => {
    expect(montantCsv(2990)).toBe('29,90')
    expect(montantCsv(5)).toBe('0,05')
    expect(montantCsv(-1500)).toBe('-15,00')
    expect(montantCsv(123456)).toBe('1234,56')
    expect(montantCsv(0)).toBe('0,00')
  })

  it('date au jour de Paris', () => {
    expect(dateCsv('2026-08-31T22:30:00Z')).toBe('01/09/2026')
  })

  it('neutralise ce qu’un tableur prendrait pour une formule', () => {
    expect(champCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(champCsv('+33 6')).toBe("'+33 6")
    expect(champCsv('@SOMME')).toBe("'@SOMME")
    expect(champCsv('-2')).toBe("'-2")
  })

  it('met entre guillemets ce qui couperait la ligne', () => {
    expect(champCsv('Séance ; suivi')).toBe('"Séance ; suivi"')
    expect(champCsv('Dit « bien »')).toBe('Dit « bien »')
    expect(champCsv('Deux\nlignes')).toBe('Deux lignes')
    expect(champCsv(null)).toBe('')
  })

  it('se nomme par sa période', () => {
    expect(nomFichierVentes('2026-09-01', '2026-09-30')).toBe('Ventes_2026-09-01_2026-09-30.csv')
  })
})

describe('le remboursement, dit à l’écran', () => {
  const vente = { title: 'Ancrage du soir', amount_cents: 2990 }
  const base: IssueRemboursement = {
    rembourse: false,
    enCours: false,
    deja: false,
    rembourseLe: null,
    raison: null,
    paiement: 'pi_3Nabc',
    livemode: true,
  }

  it('ouvre LE paiement dans Stripe, en mode réel ou en mode test', () => {
    expect(lienStripe({ paiement: 'pi_3Nabc', livemode: true })).toBe('https://dashboard.stripe.com/payments/pi_3Nabc')
    expect(lienStripe({ paiement: 'pi_3Nabc', livemode: false })).toBe(
      'https://dashboard.stripe.com/test/payments/pi_3Nabc',
    )
    expect(lienStripe({ paiement: null, livemode: null })).toBe('https://dashboard.stripe.com/payments')
  })

  it('n’écrit dans l’adresse qu’un identifiant de paiement bien formé', () => {
    expect(lienStripe({ paiement: 'pi_x/../../settings', livemode: true })).toBe('https://dashboard.stripe.com/payments')
    expect(lienStripe({ paiement: 'javascript:alert(1)', livemode: true })).toBe('https://dashboard.stripe.com/payments')
  })

  it('dit le délai de la banque quand c’est fait, et n’envoie nulle part', () => {
    const a = annonceDuRemboursement({ ...base, rembourse: true, rembourseLe: '2026-09-29T10:00:00Z' }, vente)
    expect(a.tone).toBe('ok')
    expect(a.text).toContain('La vente « Ancrage du soir » (29,90 €) est remboursée')
    expect(a.text).toContain('5 à 10 jours')
    expect(a.lien).toBeNull()
    const deja = annonceDuRemboursement({ ...base, rembourse: true, deja: true }, vente)
    expect(deja.text).toContain('déjà remboursée chez Stripe')
  })

  it('renvoie au tableau de bord Stripe quand la clé ne peut pas rembourser, et dit quoi régler', () => {
    const a = annonceDuRemboursement({ ...base, raison: 'droits' }, vente)
    expect(a.tone).toBe('warn')
    expect(a.lien).toBe('https://dashboard.stripe.com/payments/pi_3Nabc')
    expect(a.text).toContain('« Remboursements » en écriture')
    expect(a.text).toContain('sans second remboursement')
    for (const raison of ['cle', 'refus', 'action'] as const) {
      expect(annonceDuRemboursement({ ...base, raison }, vente).lien).toMatch(/^https:\/\/dashboard\.stripe\.com\//)
    }
  })

  it('ne compte plus une vente remboursée dans l’encaissé de la liste', () => {
    expect(
      totalDesVentes(
        [
          { amount_cents: 2990, status: 'remboursee' },
          { amount_cents: 9000, status: 'payee' },
        ],
        20,
      ),
    ).toEqual({ cents: 9000, complet: true })
  })
})

describe('le reçu', () => {
  const RECU: DonneesRecu = {
    commandeId: '3f2a9c1b-0d4e-4a1b-9c2d-123456789abc',
    cabinet: 'Cabinet Fontaine',
    praticien: 'Camille Fontaine',
    adresse: '3 rue des Lilas\n75011 Paris',
    numeroPro: 'SIRET 123 456 789 00012',
    payeur: 'Nadia Belkacem',
    produit: 'Ancrage du soir 😀',
    montantCents: 2990,
    devise: 'eur',
    payeLe: '2026-09-12T08:00:00Z',
    rembourseLe: null,
    paiementStripe: 'pi_3Nabc',
  }

  it('porte le cabinet, la date, le produit, le montant et la référence', () => {
    const c = contenuDuRecu(RECU)
    expect(c.titre).toBe('Reçu de paiement')
    expect(c.reference).toBe('Référence 3F2A-9C1B')
    expect(c.emetteur).toEqual(['Cabinet Fontaine', 'Camille Fontaine', '3 rue des Lilas', '75011 Paris', 'SIRET 123 456 789 00012'])
    expect(c.payeur).toBe('Nadia Belkacem')
    expect(c.ligne).toEqual({ date: '12 septembre 2026', designation: 'Ancrage du soir 😀', montant: '29,90 €' })
    expect(c.paiement).toBe('Référence du paiement : pi_3Nabc')
    expect(c.remboursement).toBeNull()
  })

  it('se contente du nom du cabinet quand l’identité de facturation n’est pas remplie', () => {
    const c = contenuDuRecu({ ...RECU, praticien: null, adresse: null, numeroPro: null, payeur: '  ' })
    expect(c.emetteur).toEqual(['Cabinet Fontaine'])
    expect(c.payeur).toBeNull()
  })

  it('dit le remboursement, une fois survenu', () => {
    expect(contenuDuRecu({ ...RECU, rembourseLe: '2026-09-20T09:00:00Z' }).remboursement).toBe(
      'Remboursé le 20 septembre 2026 : 29,90 € rendus sur le moyen de paiement utilisé.',
    )
  })

  it('ne porte jamais la marque de la plateforme', () => {
    expect(JSON.stringify(contenuDuRecu(RECU))).not.toMatch(/klaro/i)
  })

  it('se nomme par sa référence et son jour', () => {
    expect(nomFichierRecu(RECU)).toBe('Recu_3F2A-9C1B_2026-09-12.pdf')
  })

  it('sort en PDF lisible — émoji compris —, et « REMBOURSÉ » une fois remboursé', async () => {
    const illisible = /\(\x00[A-Za-z]\x00[A-Za-z]/
    const paye = (await composerRecu(RECU)).output()
    expect(paye).not.toMatch(illisible)
    expect(paye).toContain('Reçu de paiement')
    expect(paye).toContain('Référence 3F2A-9C1B')
    // « € » s'écrit 0x80 en WinAnsi : c'est l'octet qu'on retrouve dans le fichier.
    expect(paye).toContain('29,90 \x80')
    expect(paye).not.toContain('REMBOURSÉ')
    expect(paye).not.toMatch(/klaro/i)
    const rendu = (await composerRecu({ ...RECU, rembourseLe: '2026-09-20T09:00:00Z' })).output()
    expect(rendu).toContain('REMBOURSÉ')
  })

  it('ne pose aucun texte brut sur la page', () => {
    const source = lire('recuPdf.ts')
    const appels = source.match(/doc\.text\(([^,]+),/g) ?? []
    expect(appels.length).toBeGreaterThan(0)
    for (const a of appels) {
      expect(a).toMatch(/doc\.text\((t\(|morceau,|designation,|pied,|doc\.splitTextToSize\(t\()/)
    }
  })
})

describe('les écrans tiennent leurs promesses', () => {
  it('le livre nomme le cabinet et lit toute la période, page après page', () => {
    const service = lire('../services/ventes.ts')
    expect(service).toContain(".eq('cabinet_id', cabinetId)")
    expect(service).toMatch(/\.gt\('id', apres\)/)
    expect(service).not.toMatch(/limit\(20\)/)
  })

  it('l’export part en initiales tant qu’on ne demande pas les noms', () => {
    const vue = lire('../views/boutique/ExportVentes.tsx')
    expect(vue).toMatch(/const \[nomsComplets, setNomsComplets\] = useState\(false\)/)
  })

  it('l’export s’inscrit au journal AVANT que le fichier soit fabriqué', () => {
    const vue = lire('../views/boutique/ExportVentes.tsx')
    const trace = vue.indexOf('await tracerExportDuLivre(')
    const fichier = vue.indexOf('enregistrer(csvDuLivre(')
    expect(trace).toBeGreaterThan(0)
    expect(fichier).toBeGreaterThan(trace)
    expect(vue.slice(trace, fichier)).toContain('if (!trace.ok) return')
  })
})
