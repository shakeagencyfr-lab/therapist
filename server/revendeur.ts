/**
 * L'espace du revendeur, côté serveur : ses jetons.
 *
 * Le revendeur y branche la clé Anthropic qui paiera l'analyse de TOUS ses
 * cabinets, le compte Stripe qui encaissera leurs recharges, fixe ce que
 * coûte chaque action (le barème), l'essai, l'option Hypnose et ses
 * recharges — et peut offrir des jetons à l'un de ses cabinets.
 *
 * Trois règles, les mêmes que pour les intégrations d'un cabinet
 * (server/integrations.ts) :
 *
 *   1. Une clé est ÉPROUVÉE avant d'être enregistrée, par un vrai appel.
 *   2. Une clé ne revient JAMAIS au navigateur : l'écran reçoit « posée le
 *      … », pas un caractère. Elle dort chiffrée dans `reseller_secrets`,
 *      qu'aucun rôle authentifié ne lit (0016).
 *   3. Lire est à toute l'équipe ; RÉGLER est au propriétaire seul, en
 *      « aal2 » pour un compte protégé — c'est l'argent de l'enseigne.
 *
 * Chaque geste est inscrit au journal (`audit_log`), sans jamais la clé.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActionJetons,
  CabinetJetons,
  CoutReel,
  EtatRevendeurJetons,
  RechargeRevendeur,
} from '../src/types/jetons.js'
import { TAUX_EURO } from '../src/lib/coutIA.js'
import {
  clientAdmin,
  exigerMembreDuRevendeur,
  exigerProprietaireDuRevendeur,
  exigerRevendeur,
  identifier,
  identifierPourGesteSensible,
  type Appelant,
} from './auth.js'
import { HttpError } from './errors.js'
import { eprouverAnthropic, eprouverStripe } from './integrations.js'
import { ACTIONS_JETONS, baremeDe, uuidDe, type ReglagesJetons } from './jetons.js'
import { chiffrementConfigure, chiffrer, dechiffrer } from './secrets.js'

function admin(): SupabaseClient {
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(
      503,
      "Le serveur n'a pas sa clé de service (SUPABASE_SERVICE_ROLE_KEY) : il ne peut ni lire ni enregistrer ces réglages.",
    )
  }
  return db
}

function panne(cause: string): HttpError {
  // Journal technique seulement : jamais une clé.
  console.error(`[revendeur] ${cause}`)
  return new HttpError(502, "Vos réglages de jetons n'ont pas pu être lus ou enregistrés. Réessayez dans un instant.")
}

/* ------------------------------------------------------------------ *
 * Ce que coûte vraiment une action
 * ------------------------------------------------------------------ */

/** Le genre d'appel de `ai_usage` (server/ai.ts, GENRES), et l'action du barème qu'il paie. */
const ACTION_DU_GENRE: Record<string, ActionJetons> = {
  brouillon_seance: 'seance',
  module: 'module',
  profil: 'profil',
  affirmations: 'affirmations',
  hypnose: 'hypnose',
  /* Une retouche (0066). `ai_usage` ne dit pas ce qu'elle retouchait — il ne
     garde ni patient ni contenu — : sa moyenne mêle les mouvements d'hypnose
     aux autres textes, et se lit comme le coût d'une retouche ordinaire. */
  revision: 'retouche',
}

/** Une hypnose, ce sont quatre mouvements : quatre appels pour une action. */
const APPELS_PAR_ACTION: Partial<Record<ActionJetons, number>> = { hypnose: 4 }

const arrondi = (n: number) => Math.round(n * 100) / 100

/**
 * Le coût réel de chaque action, à partir des moyennes par genre d'appel —
 * pure. En centimes de dollar par appel (le tarif d'Anthropic), et en
 * centimes d'euro par action entière, au taux fixe de l'application
 * (src/lib/coutIA.ts) : c'est ce qui permet au revendeur de fixer un barème
 * qui couvre sa facture.
 */
export function coutsReels(lignes: Array<{ kind?: string; appels?: number; moyen_cents?: number | string }>): CoutReel[] {
  const couts: CoutReel[] = []
  for (const l of lignes) {
    const action = ACTION_DU_GENRE[String(l.kind ?? '')]
    if (!action) continue
    const parAppel = Number(l.moyen_cents ?? 0) || 0
    couts.push({
      action,
      appels: Number(l.appels ?? 0) || 0,
      parAppelCentimesUsd: arrondi(parAppel),
      parActionCentimesEur: arrondi(parAppel * (APPELS_PAR_ACTION[action] ?? 1) * TAUX_EURO),
    })
  }
  return couts.sort((a, b) => ACTIONS_JETONS.indexOf(a.action) - ACTIONS_JETONS.indexOf(b.action))
}

/* ------------------------------------------------------------------ *
 * Lire
 * ------------------------------------------------------------------ */

interface RechargeRow {
  id: string
  libelle: string
  jetons: number
  prix_cents: number
  actif: boolean
  position: number
  archivee_le: string | null
}

async function reglagesDe(resellerId: string, db: SupabaseClient): Promise<ReglagesJetons> {
  // La fonction crée la ligne au besoin : un revendeur n'a jamais « pas de réglages ».
  const { data, error } = await db.rpc('jetons_reglages', { p_reseller: resellerId })
  if (error || !data) throw panne(`réglages ${resellerId} — ${error?.message ?? 'absents'}`)
  return data as ReglagesJetons
}

async function etatPour(appelant: Appelant, resellerId: string): Promise<EtatRevendeurJetons> {
  const db = admin()
  const [reglages, secrets, recharges, apercu, proprietaire] = await Promise.all([
    reglagesDe(resellerId, db),
    db
      .from('reseller_secrets')
      .select('anthropic_key_enc, stripe_secret_enc')
      .eq('reseller_id', resellerId)
      .maybeSingle<{ anthropic_key_enc: string | null; stripe_secret_enc: string | null }>(),
    db
      .from('jetons_recharges')
      .select('id, libelle, jetons, prix_cents, actif, position, archivee_le')
      .eq('reseller_id', resellerId)
      .is('archivee_le', null)
      .order('position')
      .order('prix_cents'),
    db.rpc('revendeur_jetons_apercu', { p_reseller: resellerId }),
    appelant.client.rpc('is_reseller_owner', { p_reseller: resellerId }),
  ])
  if (secrets.error) throw panne(`secrets ${resellerId} — ${secrets.error.message}`)
  if (recharges.error) throw panne(`recharges ${resellerId} — ${recharges.error.message}`)
  if (apercu.error) throw panne(`aperçu ${resellerId} — ${apercu.error.message}`)

  /* On ne rend que des BOOLÉENS et des dates : de la clé elle-même, rien ne
     quitte cette fonction — pas même sa longueur. */
  const clePosee = Boolean(secrets.data?.anthropic_key_enc)
  const stripePose = Boolean(secrets.data?.stripe_secret_enc)
  const vue = (apercu.data ?? {}) as {
    couts?: Array<{ kind?: string; appels?: number; moyen_cents?: number | string }>
    cabinets?: Array<{ cabinet_id?: string; nom?: string; consommes_mois?: number; solde?: number }>
  }
  return {
    actif: reglages.actif === true,
    mode: reglages.actif === true && clePosee ? 'jetons' : 'cle_cabinet',
    cle: { posee: clePosee, poseeLe: clePosee ? (reglages.cle_posee_le ?? null) : null },
    stripe: {
      pose: stripePose,
      poseLe: stripePose ? (reglages.stripe_pose_le ?? null) : null,
      compte: stripePose ? (reglages.stripe_compte ?? null) : null,
    },
    bareme: baremeDe(reglages),
    essaiJetons: reglages.essai_jetons,
    optionHypnose: {
      prixCents: reglages.option_hypnose_prix_cents,
      jours: reglages.option_hypnose_jours,
      jetons: reglages.option_hypnose_jetons,
    },
    recharges: ((recharges.data ?? []) as RechargeRow[]).map(
      (r): RechargeRevendeur => ({
        id: r.id,
        libelle: r.libelle,
        jetons: r.jetons,
        prixCents: r.prix_cents,
        actif: r.actif,
        position: r.position,
        archiveeLe: r.archivee_le,
      }),
    ),
    coutsReels: coutsReels(vue.couts ?? []),
    cabinets: (vue.cabinets ?? []).map(
      (c): CabinetJetons => ({
        cabinetId: String(c.cabinet_id ?? ''),
        nom: String(c.nom ?? ''),
        consommesMois: Number(c.consommes_mois ?? 0) || 0,
        solde: Number(c.solde ?? 0) || 0,
      }),
    ),
    chiffrement: chiffrementConfigure(),
    proprietaire: proprietaire.data === true,
  }
}

/**
 * L'état des jetons du revendeur de l'appelant — à toute son équipe.
 *
 * L'appartenance est revérifiée par la base, second facteur compris : ce qui
 * suit se lit avec la clé de service, qui ne vérifie rien d'elle-même.
 */
export async function etatRevendeur(token: string | null): Promise<EtatRevendeurJetons> {
  const appelant = await identifier(token)
  const resellerId = exigerRevendeur(appelant)
  await exigerMembreDuRevendeur(appelant, resellerId)
  return etatPour(appelant, resellerId)
}

/* ------------------------------------------------------------------ *
 * Régler
 * ------------------------------------------------------------------ */

/** Un entier dans ses bornes, ou un refus qui dit lesquelles. */
export function entierBorne(valeur: unknown, min: number, max: number, quoi: string): number {
  const n = typeof valeur === 'number' ? valeur : typeof valeur === 'string' && valeur.trim() ? Number(valeur) : Number.NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(
      400,
      `${quoi} doit être un nombre entier entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')}.`,
    )
  }
  return n
}

/** Les colonnes du barème, action par action. */
const COLONNE_DU_BAREME: Record<ActionJetons, keyof ReglagesJetons> = {
  seance: 'bareme_seance',
  module: 'bareme_module',
  profil: 'bareme_profil',
  affirmations: 'bareme_affirmations',
  hypnose: 'bareme_hypnose',
  retouche: 'bareme_retouche',
  retouche_hypnose: 'bareme_retouche_hypnose',
}

const NOM_DE_L_ACTION: Record<ActionJetons, string> = {
  seance: "Le prix d'une séance",
  module: "Le prix d'un module",
  profil: "Le prix d'une actualisation du profil",
  affirmations: 'Le prix des affirmations',
  hypnose: "Le prix d'une hypnose",
  retouche: "Le prix d'une retouche",
  retouche_hypnose: "Le prix d'une retouche d'hypnose",
}

export interface ReglagesBody {
  actif?: unknown
  bareme?: Partial<Record<ActionJetons, unknown>>
  essaiJetons?: unknown
  optionHypnose?: { prixCents?: unknown; jours?: unknown; jetons?: unknown }
}

/**
 * Les réglages demandés, lus et bornés — pure. Rend les colonnes à écrire ;
 * ce qui n'est pas demandé n'y figure pas.
 */
export function reglagesDemandes(body: ReglagesBody): Partial<ReglagesJetons> {
  const ligne: Partial<ReglagesJetons> = {}
  if (body.actif !== undefined) {
    if (typeof body.actif !== 'boolean') throw new HttpError(400, 'Le mode jetons est activé, ou non.')
    ligne.actif = body.actif
  }
  if (body.bareme !== undefined) {
    if (!body.bareme || typeof body.bareme !== 'object') throw new HttpError(400, 'Le barème est illisible.')
    for (const [action, valeur] of Object.entries(body.bareme)) {
      if (!(ACTIONS_JETONS as readonly string[]).includes(action)) {
        throw new HttpError(400, `Le barème ne connaît pas l'action « ${action} ».`)
      }
      const a = action as ActionJetons
      ;(ligne as Record<string, unknown>)[COLONNE_DU_BAREME[a]] = entierBorne(valeur, 0, 10_000, NOM_DE_L_ACTION[a])
    }
  }
  if (body.essaiJetons !== undefined) {
    ligne.essai_jetons = entierBorne(body.essaiJetons, 0, 1_000_000, "Les jetons de l'essai")
  }
  if (body.optionHypnose !== undefined) {
    const o = body.optionHypnose ?? {}
    if (o.prixCents !== undefined) {
      ligne.option_hypnose_prix_cents = entierBorne(o.prixCents, 100, 10_000_000, "Le prix de l'option Hypnose (en centimes)")
    }
    if (o.jours !== undefined) ligne.option_hypnose_jours = entierBorne(o.jours, 1, 366, "La durée de l'option Hypnose (en jours)")
    if (o.jetons !== undefined) ligne.option_hypnose_jetons = entierBorne(o.jetons, 0, 1_000_000, "Les jetons offerts avec l'option")
  }
  return ligne
}

export interface RechargeBody {
  id?: unknown
  libelle?: unknown
  jetons?: unknown
  prixCents?: unknown
  actif?: unknown
  position?: unknown
  archiver?: unknown
}

/** Une recharge demandée, lue et bornée — pure. `creation` : tout est exigé. */
export function rechargeDemandee(body: RechargeBody, creation: boolean): Partial<RechargeRow> {
  const ligne: Partial<RechargeRow> = {}
  if (creation || body.libelle !== undefined) {
    const libelle = typeof body.libelle === 'string' ? body.libelle.trim() : ''
    if (!libelle || libelle.length > 80) throw new HttpError(400, 'Nommez la recharge en quelques mots (80 caractères au plus).')
    ligne.libelle = libelle
  }
  if (creation || body.jetons !== undefined) ligne.jetons = entierBorne(body.jetons, 1, 1_000_000, 'Le nombre de jetons')
  if (creation || body.prixCents !== undefined) {
    ligne.prix_cents = entierBorne(body.prixCents, 100, 10_000_000, 'Le prix (en centimes, 1 € au moins)')
  }
  if (body.actif !== undefined) {
    if (typeof body.actif !== 'boolean') throw new HttpError(400, 'Une recharge est proposée, ou non.')
    ligne.actif = body.actif
  }
  if (body.position !== undefined) ligne.position = entierBorne(body.position, 0, 1000, 'La position')
  return ligne
}

async function journaliser(
  db: SupabaseClient,
  appelant: Appelant,
  resellerId: string,
  action: string,
  meta: Record<string, unknown> = {},
  cabinetId: string | null = null,
): Promise<void> {
  // Le geste se voit dans le journal ; une clé, jamais.
  const { error } = await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: appelant.userId,
    action,
    target_table: cabinetId ? 'jetons_lots' : 'reseller_jetons',
    target_id: cabinetId ?? resellerId,
    meta: { reseller_id: resellerId, ...meta },
  })
  if (error) console.error(`[revendeur] journal ${action} — ${error.message}`)
}

async function ecrireReglages(db: SupabaseClient, resellerId: string, ligne: Partial<ReglagesJetons>): Promise<void> {
  const { error } = await db
    .from('reseller_jetons')
    .upsert({ reseller_id: resellerId, ...ligne, updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
  if (error) throw panne(`réglages ${resellerId} — ${error.message}`)
}

async function ecrireSecrets(
  db: SupabaseClient,
  resellerId: string,
  secrets: { anthropic_key_enc?: string | null; stripe_secret_enc?: string | null },
): Promise<void> {
  const { error } = await db
    .from('reseller_secrets')
    .upsert({ reseller_id: resellerId, ...secrets, updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
  if (error) throw panne(`secrets ${resellerId} — ${error.message}`)
}

/** Les gestes que la route connaît. */
const GESTES = ['cle', 'stripe', 'reglages', 'recharge', 'offrir']

export interface CleBody {
  cle?: unknown
  retirer?: unknown
}

export interface OffrirBody {
  cabinetId?: unknown
  jetons?: unknown
  note?: unknown
}

/**
 * Un geste du propriétaire, puis l'état à jour.
 *
 *   cle       { cle } pose la clé Anthropic, éprouvée ; { retirer: true } la
 *             retire — et désactive les jetons, qui n'auraient plus rien
 *             pour payer : chaque cabinet retrouve sa clé.
 *   stripe    { cle } ou { retirer: true } : le compte qui encaisse.
 *   reglages  { actif?, bareme?, essaiJetons?, optionHypnose? }. Activer
 *             sans clé posée est refusé.
 *   recharge  { libelle, jetons, prixCents } crée ; { id, … } règle ;
 *             { id, archiver: true } retire de la vente (les commandes
 *             passées gardent leur trace).
 *   offrir    { cabinetId, jetons, note? } : un lot de douze mois à l'un de
 *             SES cabinets.
 */
export async function agirRevendeur(token: string | null, raw: unknown): Promise<EtatRevendeurJetons> {
  const appelant = await identifierPourGesteSensible(token)
  const resellerId = exigerRevendeur(appelant)
  await exigerProprietaireDuRevendeur(appelant, resellerId, 'Ce réglage')
  const body = (raw && typeof raw === 'object' ? raw : {}) as { action?: unknown } & CleBody &
    ReglagesBody &
    RechargeBody &
    OffrirBody
  const action = String(body.action ?? '')
  if (!GESTES.includes(action)) throw new HttpError(400, 'Action inconnue.')
  const db = admin()
  const maintenant = new Date().toISOString()

  switch (action) {
    case 'cle': {
      if (body.retirer === true) {
        await ecrireSecrets(db, resellerId, { anthropic_key_enc: null })
        await ecrireReglages(db, resellerId, { cle_posee_le: null, actif: false })
        await journaliser(db, appelant, resellerId, 'jetons.cle_retiree')
        break
      }
      const cle = typeof body.cle === 'string' ? body.cle.trim() : ''
      if (!/^sk-ant-/.test(cle)) throw new HttpError(400, 'Une clé Anthropic commence par « sk-ant- ».')
      if (!chiffrementConfigure()) chiffrer('') // lève le 503 explicite
      await eprouverAnthropic(cle)
      await ecrireSecrets(db, resellerId, { anthropic_key_enc: chiffrer(cle) })
      await ecrireReglages(db, resellerId, { cle_posee_le: maintenant })
      await journaliser(db, appelant, resellerId, 'jetons.cle_posee')
      break
    }

    case 'stripe': {
      if (body.retirer === true) {
        await ecrireSecrets(db, resellerId, { stripe_secret_enc: null })
        await ecrireReglages(db, resellerId, { stripe_pose_le: null, stripe_compte: null })
        await journaliser(db, appelant, resellerId, 'jetons.stripe_retire')
        break
      }
      const cle = typeof body.cle === 'string' ? body.cle.trim() : ''
      if (!/^(sk|rk)_(live|test)_/.test(cle)) {
        throw new HttpError(400, 'Une clé secrète Stripe commence par « sk_live_ », « sk_test_ » ou « rk_ ».')
      }
      if (!chiffrementConfigure()) chiffrer('')
      const compte = await eprouverStripe(cle)
      await ecrireSecrets(db, resellerId, { stripe_secret_enc: chiffrer(cle) })
      await ecrireReglages(db, resellerId, { stripe_pose_le: maintenant, stripe_compte: compte.slice(0, 200) })
      await journaliser(db, appelant, resellerId, 'jetons.stripe_pose')
      break
    }

    case 'reglages': {
      const ligne = reglagesDemandes(body)
      if (!Object.keys(ligne).length) break
      /* ACTIVER SANS CLÉ NE FERAIT RIEN — et le dirait mal : l'écran
         afficherait « jetons activés » pendant que chaque cabinet continue
         de payer avec sa clé. On refuse, en disant quoi faire d'abord.
         Et la clé posée est RÉÉPROUVÉE : activer, c'est lui confier
         l'analyse de tous les cabinets d'un coup. Une clé posée il y a des
         mois (0016), illisible ou révoquée depuis, les mettrait tous en panne
         au même instant. */
      if (ligne.actif === true) {
        const { data: secrets, error } = await db
          .from('reseller_secrets')
          .select('anthropic_key_enc')
          .eq('reseller_id', resellerId)
          .maybeSingle<{ anthropic_key_enc: string | null }>()
        if (error) throw panne(`secrets ${resellerId} — ${error.message}`)
        if (!secrets?.anthropic_key_enc) {
          throw new HttpError(409, "Posez d'abord votre clé Anthropic : sans elle, les jetons n'auraient rien pour payer l'analyse.")
        }
        let cle: string
        try {
          cle = dechiffrer(secrets.anthropic_key_enc)
        } catch {
          throw new HttpError(409, "Votre clé Anthropic enregistrée n'est plus lisible sur ce serveur : posez-la de nouveau, puis activez les jetons.")
        }
        await eprouverAnthropic(cle)
      }
      await ecrireReglages(db, resellerId, ligne)
      await journaliser(db, appelant, resellerId, 'jetons.reglages', { champs: ligne })
      break
    }

    case 'recharge': {
      const id = body.id === undefined ? null : uuidDe(body.id)
      if (body.id !== undefined && !id) throw new HttpError(400, 'Recharge inconnue.')
      if (id && body.archiver === true) {
        const { data, error } = await db
          .from('jetons_recharges')
          .update({ archivee_le: maintenant, actif: false })
          .eq('id', id)
          .eq('reseller_id', resellerId)
          .is('archivee_le', null)
          .select('id')
        if (error) throw panne(`recharge ${id} — ${error.message}`)
        if (!data?.length) throw new HttpError(404, "Cette recharge n'existe pas, ou n'est déjà plus en vente.")
        await journaliser(db, appelant, resellerId, 'jetons.recharge_archivee', { recharge_id: id })
        break
      }
      if (id) {
        const ligne = rechargeDemandee(body, false)
        if (!Object.keys(ligne).length) break
        const { data, error } = await db
          .from('jetons_recharges')
          .update(ligne)
          .eq('id', id)
          .eq('reseller_id', resellerId)
          .is('archivee_le', null)
          .select('id')
        if (error) throw panne(`recharge ${id} — ${error.message}`)
        if (!data?.length) throw new HttpError(404, "Cette recharge n'existe pas, ou n'est plus en vente.")
        await journaliser(db, appelant, resellerId, 'jetons.recharge_reglee', { recharge_id: id, champs: ligne })
        break
      }
      const ligne = rechargeDemandee(body, true)
      if (ligne.position === undefined) {
        const { data: derniere } = await db
          .from('jetons_recharges')
          .select('position')
          .eq('reseller_id', resellerId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle<{ position: number }>()
        ligne.position = (derniere?.position ?? 0) + 1
      }
      const { data, error } = await db
        .from('jetons_recharges')
        .insert({ reseller_id: resellerId, ...ligne })
        .select('id')
        .single<{ id: string }>()
      if (error || !data) throw panne(`recharge nouvelle — ${error?.message ?? 'sans identifiant'}`)
      await journaliser(db, appelant, resellerId, 'jetons.recharge_creee', { recharge_id: data.id, champs: ligne })
      break
    }

    case 'offrir': {
      const cabinetId = uuidDe(body.cabinetId)
      if (!cabinetId) throw new HttpError(400, 'Choisissez le cabinet à qui offrir des jetons.')
      const jetons = entierBorne(body.jetons, 1, 100_000, 'Le nombre de jetons offerts')
      const note = typeof body.note === 'string' ? body.note.trim() : ''
      if (note.length > 200) throw new HttpError(400, 'La note tient en 200 caractères au plus.')
      /* SES cabinets seulement : la clé de service passe au-dessus des
         politiques, la frontière se relit donc ici. */
      const { data: cabinet, error: eCab } = await db
        .from('cabinets')
        .select('id, reseller_id')
        .eq('id', cabinetId)
        .maybeSingle<{ id: string; reseller_id: string }>()
      if (eCab) throw panne(`cabinet ${cabinetId} — ${eCab.message}`)
      if (!cabinet || cabinet.reseller_id !== resellerId) throw new HttpError(404, "Ce cabinet n'est pas le vôtre.")
      const expire = new Date()
      expire.setUTCFullYear(expire.getUTCFullYear() + 1)
      const { error } = await db.rpc('jetons_crediter', {
        p_cabinet: cabinetId,
        p_origine: 'geste',
        p_jetons: jetons,
        p_expire: expire.toISOString(),
        p_commande: null,
      })
      if (error) throw panne(`geste ${cabinetId} — ${error.message}`)
      await journaliser(db, appelant, resellerId, 'jetons.offerts', { jetons, note: note || null }, cabinetId)
      break
    }

    default:
      throw new HttpError(400, 'Action inconnue.')
  }

  return etatPour(appelant, resellerId)
}
