import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  APPELS_PAR_HYPNOSE,
  BAREME_PAR_DEFAUT,
  CONSIGNES_PAR_SEANCE,
  adresseDeRetourPraticienne,
  baremeDe,
  conclureAchat,
  coutDeLAppel,
  jetonsDits,
  lectureDeSession,
  lireRefusDeSolde,
  messageSoldeInsuffisant,
  reserver,
  SoldeInsuffisant,
  uuidDe,
  versEtatJetons,
  type CommandeJetons,
  type Facturation,
  type OperationsAchat,
  type Recherches,
  type SessionLue,
} from './jetons.js'
import { HttpError } from './errors.js'

const SEANCE = '11111111-1111-4111-8111-111111111111'
const AUTRE = '22222222-2222-4222-8222-222222222222'
const HYPNOSE = '33333333-3333-4333-8333-333333333333'

/** Une base imaginaire : ce que la séance et l'hypnose ont déjà consommé. */
function recherches(o: Partial<{
  seances: string[]
  payees: string[]
  modulesCompris: number
  profilsCompris: number
  hypnoses: string[]
  appelsHypnose: number
}> = {}): Recherches {
  return {
    seanceDuCabinet: async (id) => (o.seances ?? [SEANCE]).includes(id),
    seancePayee: async (id) => (o.payees ?? []).includes(id),
    comprisesDeLaSeance: async (action) => (action === 'module' ? (o.modulesCompris ?? 0) : (o.profilsCompris ?? 0)),
    hypnoseDuCabinet: async (id) => (o.hypnoses ?? [HYPNOSE]).includes(id),
    appelsDeLHypnose: async () => o.appelsHypnose ?? 0,
  }
}

const B = BAREME_PAR_DEFAUT

describe('le barème', () => {
  it('par défaut : 12 la séance, 5 le module et le profil, 1 les affirmations, 50 l’hypnose, 3 et 8 les retouches', () => {
    expect(B).toEqual({ seance: 12, module: 5, profil: 5, affirmations: 1, hypnose: 50, retouche: 3, retouche_hypnose: 8 })
  })

  it('se lit dans une ligne de réglages, et comble ce qui manque ou ne vaut rien', () => {
    expect(baremeDe({ bareme_seance: 20, bareme_hypnose: 0 })).toEqual({ ...B, seance: 20, hypnose: 0 })
    expect(baremeDe({ bareme_module: -3 as number })).toEqual(B)
    expect(baremeDe(null)).toEqual(B)
  })
})

describe('coutDeLAppel — le prix d’un appel', () => {
  it('une séance se paie au barème, et retient sa séance si elle est du cabinet', async () => {
    expect(await coutDeLAppel('session-draft', { sessionId: SEANCE }, B, recherches())).toEqual({
      action: 'seance',
      jetons: 12,
      ref: SEANCE,
      compris: false,
    })
    // Une séance inconnue du cabinet ne s'inscrit pas : elle n'ouvrira aucun forfait.
    expect((await coutDeLAppel('session-draft', { sessionId: AUTRE }, B, recherches())).ref).toBeNull()
    expect((await coutDeLAppel('session-draft', {}, B, recherches())).ref).toBeNull()
  })

  it('les consignes d’une séance payée sont comprises, huit au plus', async () => {
    const payee = recherches({ payees: [SEANCE] })
    expect(await coutDeLAppel('module', { sessionId: SEANCE }, B, payee)).toEqual({
      action: 'module',
      jetons: 0,
      ref: SEANCE,
      compris: true,
    })
    const pleine = recherches({ payees: [SEANCE], modulesCompris: CONSIGNES_PAR_SEANCE })
    expect(await coutDeLAppel('module', { sessionId: SEANCE }, B, pleine)).toMatchObject({ jetons: 5, compris: false })
  })

  it('un module sans séance payée se paie : atelier, séance d’un autre cabinet, identifiant inventé', async () => {
    expect(await coutDeLAppel('module', {}, B, recherches())).toMatchObject({ jetons: 5, ref: null })
    expect(await coutDeLAppel('module', { sessionId: SEANCE }, B, recherches())).toMatchObject({ jetons: 5, ref: SEANCE })
    expect(await coutDeLAppel('module', { sessionId: AUTRE }, B, recherches({ payees: [AUTRE] }))).toMatchObject({
      jetons: 5,
      ref: null,
    })
    expect(await coutDeLAppel('module', { sessionId: 'pas-un-uuid' }, B, recherches())).toMatchObject({ jetons: 5 })
  })

  it('une actualisation du profil est comprise une fois par séance payée', async () => {
    expect(await coutDeLAppel('profile', { sessionId: SEANCE }, B, recherches({ payees: [SEANCE] }))).toMatchObject({
      action: 'profil',
      jetons: 0,
      compris: true,
    })
    expect(
      await coutDeLAppel('profile', { sessionId: SEANCE }, B, recherches({ payees: [SEANCE], profilsCompris: 1 })),
    ).toMatchObject({ action: 'profil', jetons: 5 })
    expect(await coutDeLAppel('profile', {}, B, recherches())).toMatchObject({ action: 'profil', jetons: 5 })
  })

  it('les affirmations se paient toujours au barème', async () => {
    expect(await coutDeLAppel('affirmations', { sessionId: SEANCE }, B, recherches({ payees: [SEANCE] }))).toEqual({
      action: 'affirmations',
      jetons: 1,
      ref: null,
      compris: false,
    })
  })

  it('une hypnose se paie une fois : le premier appel de chaque série de huit', async () => {
    expect(await coutDeLAppel('hypnose', { hypnoseId: HYPNOSE }, B, recherches({ appelsHypnose: 0 }))).toMatchObject({
      action: 'hypnose',
      jetons: 50,
      ref: HYPNOSE,
    })
    for (const deja of [1, 3, APPELS_PAR_HYPNOSE - 1]) {
      expect(await coutDeLAppel('hypnose', { hypnoseId: HYPNOSE }, B, recherches({ appelsHypnose: deja }))).toMatchObject({
        jetons: 0,
        compris: true,
      })
    }
    // Le neuvième appel : une nouvelle hypnose.
    expect(
      await coutDeLAppel('hypnose', { hypnoseId: HYPNOSE }, B, recherches({ appelsHypnose: APPELS_PAR_HYPNOSE })),
    ).toMatchObject({ jetons: 50, compris: false })
  })

  it('une hypnose qui n’est pas ouverte en base, ou pas au cabinet, est refusée avant toute dépense', async () => {
    await expect(coutDeLAppel('hypnose', {}, B, recherches())).rejects.toMatchObject({ status: 400 })
    await expect(coutDeLAppel('hypnose', { hypnoseId: AUTRE }, B, recherches())).rejects.toMatchObject({ status: 400 })
  })

  it('une retouche coûte plus sur une hypnose', async () => {
    expect(await coutDeLAppel('revision', { cible: 'hypnose' }, B, recherches())).toMatchObject({
      action: 'retouche_hypnose',
      jetons: 8,
    })
    expect(await coutDeLAppel('revision', { cible: 'module' }, B, recherches())).toMatchObject({ action: 'retouche', jetons: 3 })
  })

  it('une route inconnue n’a pas de prix', async () => {
    await expect(coutDeLAppel('rien', {}, B, recherches())).rejects.toMatchObject({ status: 404 })
  })

  it('ne croit un identifiant que s’il en a la forme', () => {
    expect(uuidDe(SEANCE.toUpperCase())).toBe(SEANCE)
    expect(uuidDe(' ' + SEANCE + ' ')).toBe(SEANCE)
    expect(uuidDe('1; drop table')).toBeNull()
    expect(uuidDe(42)).toBeNull()
  })
})

describe('le refus faute de jetons', () => {
  const facturation = (paiement: boolean): Extract<Facturation, { mode: 'jetons' }> => ({
    mode: 'jetons',
    resellerId: 'r1',
    cle: 'sk-ant-essai',
    bareme: B,
    paiement,
  })
  const base = (erreur: { code: string; details?: string; message: string } | null, data: unknown = 'conso-1') =>
    ({ rpc: vi.fn(async () => ({ data: erreur ? null : data, error: erreur })) }) as unknown as SupabaseClient

  it('KL402 devient un 402 qui dit combien il reste, et où recharger', async () => {
    const db = base({ code: 'KL402', details: '{"solde": 3, "besoin": 12}', message: 'Solde de jetons insuffisant' })
    const cout = { action: 'seance' as const, jetons: 12, ref: null, compris: false }
    const refus = await reserver('c1', cout, facturation(true), db).catch((e: unknown) => e)
    expect(refus).toBeInstanceOf(SoldeInsuffisant)
    expect(refus).toBeInstanceOf(HttpError)
    expect((refus as SoldeInsuffisant).status).toBe(402)
    expect((refus as SoldeInsuffisant).message).toContain('Il vous reste 3 jetons')
    expect((refus as SoldeInsuffisant).message).toContain('12')
    expect((refus as SoldeInsuffisant).message).toContain('Intégrations › Jetons IA')
  })

  it('sans paiement en ligne, il renvoie vers le revendeur', () => {
    const texte = messageSoldeInsuffisant(0, 50, false)
    expect(texte).toContain('Il vous reste 0 jeton,')
    expect(texte).toContain('revendeur')
    expect(texte).not.toContain('Intégrations')
  })

  it('une autre panne n’est pas un solde insuffisant', async () => {
    const db = base({ code: 'XX000', message: 'boom' })
    const cout = { action: 'module' as const, jetons: 5, ref: null, compris: false }
    const refus = await reserver('c1', cout, facturation(true), db).catch((e: unknown) => e)
    expect(refus).not.toBeInstanceOf(SoldeInsuffisant)
    expect((refus as HttpError).status).toBe(503)
  })

  it('réserve, et rend la consommation', async () => {
    const db = base(null, 'conso-9')
    const cout = { action: 'hypnose' as const, jetons: 0, ref: 'h', compris: true }
    expect(await reserver('c1', cout, facturation(true), db)).toBe('conso-9')
    expect(db.rpc).toHaveBeenCalledWith('jetons_debiter', { p_cabinet: 'c1', p_action: 'hypnose', p_jetons: 0, p_ref: 'h' })
  })

  it('lit le détail de la base, ou retombe sur le besoin connu', () => {
    expect(lireRefusDeSolde('{"solde":7,"besoin":50}', 50)).toEqual({ solde: 7, besoin: 50 })
    expect(lireRefusDeSolde('illisible', 12)).toEqual({ solde: 0, besoin: 12 })
    expect(lireRefusDeSolde(null, 5)).toEqual({ solde: 0, besoin: 5 })
  })

  it('dit « jeton » au singulier jusqu’à un', () => {
    expect(jetonsDits(0)).toBe('0 jeton')
    expect(jetonsDits(1)).toBe('1 jeton')
    expect(jetonsDits(2)).toBe('2 jetons')
  })
})

describe('l’achat : ce que Stripe dit, et ce qu’on en fait', () => {
  const commande: CommandeJetons = {
    id: 'cmd-1',
    cabinet_id: 'cab-1',
    reseller_id: 'rev-1',
    objet: 'recharge',
    recharge_id: 'rech-1',
    libelle: '300 jetons',
    jetons: 300,
    jours: null,
    prix_cents: 3000,
    devise: 'eur',
    stripe_session_id: 'cs_test_1',
    statut: 'en_attente',
  }
  const payee: SessionLue = {
    payment_status: 'paid',
    status: 'complete',
    amount_total: 3000,
    currency: 'eur',
    metadata: { commande: 'cmd-1', cabinet: 'cab-1' },
  }
  function operations(deja = false, jusquAu: string | null = null) {
    return {
      encaisser: vi.fn(async () => ({ deja, jusquAu })),
      annuler: vi.fn(async () => undefined),
      solde: vi.fn(async () => 420),
    } satisfies OperationsAchat
  }

  it('une session payée, qui porte la commande, le cabinet, le montant et la devise, crédite', async () => {
    const ops = operations()
    const r = await conclureAchat(commande, payee, ops)
    expect(ops.encaisser).toHaveBeenCalledWith('cmd-1')
    expect(r).toMatchObject({ ok: true, solde: 420, objet: 'recharge', jetons: 300 })
    expect(r.message).toContain('300 jetons ajoutés')
  })

  it('un montant, une devise ou des métadonnées qui ne correspondent pas ne créditent rien', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    for (const session of [
      { ...payee, amount_total: 1200 },
      { ...payee, currency: 'usd' },
      { ...payee, metadata: { commande: 'cmd-2', cabinet: 'cab-1' } },
      { ...payee, metadata: { commande: 'cmd-1', cabinet: 'cab-2' } },
      { ...payee, metadata: null },
    ]) {
      const ops = operations()
      const r = await conclureAchat(commande, session, ops)
      expect(r.ok).toBe(false)
      expect(ops.encaisser).not.toHaveBeenCalled()
      expect(lectureDeSession(session, commande)).toBe('incoherente')
    }
    erreurs.mockRestore()
  })

  it('une seconde vérification dit « déjà crédité », et la base ne verse rien de plus', async () => {
    const ops = operations(true)
    const r = await conclureAchat(commande, payee, ops)
    expect(r).toMatchObject({ ok: true, message: 'Cet achat est déjà crédité.' })
    expect(ops.encaisser).toHaveBeenCalledTimes(1)
  })

  it('une page encore ouverte attend ; une page expirée annule la commande', async () => {
    const attente = operations()
    const r1 = await conclureAchat(commande, { ...payee, payment_status: 'unpaid', status: 'open' }, attente)
    expect(r1).toMatchObject({ ok: false, attente: true })
    expect(attente.encaisser).not.toHaveBeenCalled()

    const expiree = operations()
    const r2 = await conclureAchat(commande, { ...payee, payment_status: 'unpaid', status: 'expired' }, expiree)
    expect(r2.ok).toBe(false)
    expect(expiree.annuler).toHaveBeenCalledWith('cmd-1')
    expect(expiree.encaisser).not.toHaveBeenCalled()
  })

  it('le pass Hypnose dit jusqu’à quand, et les jetons qui l’accompagnent', async () => {
    const option: CommandeJetons = { ...commande, objet: 'option_hypnose', libelle: 'Option Hypnose — 30 jours', jetons: 200, jours: 30, prix_cents: 1900 }
    const r = await conclureAchat(option, { ...payee, amount_total: 1900 }, operations(false, '2026-10-30T10:00:00Z'))
    expect(r).toMatchObject({ ok: true, objet: 'option_hypnose', hypnoseJusquAu: '2026-10-30T10:00:00Z' })
    expect(r.message).toContain('Option Hypnose ouverte jusqu')
    expect(r.message).toContain('200 jetons')
  })
})

describe('le retour après paiement', () => {
  const site = 'https://klaroweb.site'
  it('revient sur le domaine du cabinet quand on en est parti', () => {
    expect(adresseDeRetourPraticienne({ site, domaine: 'espace.cabinet.fr', hote: 'Espace.Cabinet.fr:443' })).toBe(
      'https://espace.cabinet.fr/',
    )
  })
  it('revient chez nous sinon — jamais sur un hôte que le serveur ne connaît pas', () => {
    expect(adresseDeRetourPraticienne({ site, domaine: 'espace.cabinet.fr', hote: 'klaroweb.site' })).toBe(`${site}/`)
    expect(adresseDeRetourPraticienne({ site, domaine: null, hote: 'pirate.example' })).toBe(`${site}/`)
  })
})

describe('l’état des jetons, à la forme de l’écran', () => {
  it('traduit ce que rend cabinet_jetons()', () => {
    const etat = versEtatJetons({
      mode: 'jetons',
      en_regle: true,
      solde: 450,
      mensuel: { total: 300, restant: 300, renouvellement: '2026-11-01' },
      essai: null,
      achete_restant: 150,
      lots: [{ origine: 'mensuel', jetons_initiaux: 300, restants: 300, expire_le: '2026-10-31T23:00:00Z' }],
      hypnose: { droit: false, incluse: false, jusqu_au: null },
      bareme: { seance: 12, module: 5, profil: 5, affirmations: 1, hypnose: 50, retouche: 3, retouche_hypnose: 8 },
      recharges: [{ id: 'r', libelle: '100 jetons', jetons: 100, prix_cents: 1200 }],
      option_hypnose: { prix_cents: 1900, jours: 30, jetons: 200 },
      paiement_possible: true,
      historique: [{ le: '2026-10-01T09:00:00Z', action: 'seance', jetons: 12, statut: 'confirme' }],
    })
    expect(etat).toMatchObject({
      mode: 'jetons',
      solde: 450,
      acheteRestant: 150,
      mensuel: { total: 300, renouvellement: '2026-11-01' },
      recharges: [{ id: 'r', prixCents: 1200 }],
      optionHypnose: { prixCents: 1900, jours: 30, jetons: 200 },
      paiementPossible: true,
      historique: [{ action: 'seance', jetons: 12, statut: 'confirme' }],
    })
    expect(etat.lots[0]).toEqual({ origine: 'mensuel', jetonsInitiaux: 300, restants: 300, expireLe: '2026-10-31T23:00:00Z' })
  })

  it('rien de lisible : le mode du cabinet, et des zéros', () => {
    const etat = versEtatJetons(null)
    expect(etat.mode).toBe('cle_cabinet')
    expect(etat.solde).toBe(0)
    expect(etat.bareme).toEqual(B)
  })
})
