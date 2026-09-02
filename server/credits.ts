/**
 * Les crédits IA : ce que le revendeur avance, et ce que la thérapeute lui
 * rachète.
 *
 * Quand un cabinet est en mode « crédits », ce n'est plus sa clé qui paie
 * l'appel mais celle de son revendeur. Un crédit vaut UNE action — un
 * brouillon de séance, un module, un jeu d'affirmations, un profil — quelle
 * que soit la longueur de la séance. C'est le choix de simplicité assumé :
 * une thérapeute comprend « il me reste douze analyses », pas « il me reste
 * 340 000 jetons ».
 *
 * Deux règles gouvernent tout ce fichier.
 *
 *   LE SOLDE NE S'ÉCRIT PAS. Il se somme, depuis un grand livre en ajout
 *   seul auquel seul le serveur écrit. Une thérapeute ne peut donc pas se
 *   créditer, et chaque mouvement garde sa raison et sa date.
 *
 *   ON NE DÉBITE QU'APRÈS COUP. Le solde est éprouvé avant l'appel, mais la
 *   ligne n'est écrite qu'une fois la note produite : une analyse qui échoue
 *   ne se facture pas. Le revendeur perd l'appel raté, jamais la thérapeute.
 */
import { clientAdmin } from './auth.js'
import { HttpError } from './errors.js'
import { dechiffrer } from './secrets.js'

/** Le mode de facturation d'un cabinet, tel que son revendeur l'a réglé. */
export type ModeFacturation = 'cle_cabinet' | 'credits'

export interface Facturation {
  mode: ModeFacturation
  resellerId: string | null
  /** Solde courant, en crédits. Peut être négatif, dans la limite ci-dessous. */
  solde: number
  /** Jusqu'où le revendeur laisse descendre le solde. */
  decouvert: number
}

function admin() {
  const client = clientAdmin()
  if (!client) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : les crédits ne peuvent pas être lus.")
  }
  return client
}

/**
 * Comment ce cabinet paie son IA, et où il en est.
 *
 * Lu avec la clé de service : la décision d'autoriser un appel ne peut pas
 * dépendre de ce que le client veut bien envoyer.
 */
export async function facturationDuCabinet(cabinetId: string): Promise<Facturation> {
  const db = admin()

  const [{ data: cabinet }, { data: abo }] = await Promise.all([
    db.from('cabinets').select('reseller_id').eq('id', cabinetId).maybeSingle<{ reseller_id: string }>(),
    db.from('subscriptions').select('ai_billing').eq('cabinet_id', cabinetId).maybeSingle<{ ai_billing: string }>(),
  ])

  const mode: ModeFacturation = abo?.ai_billing === 'credits' ? 'credits' : 'cle_cabinet'
  const resellerId = cabinet?.reseller_id ?? null
  if (mode !== 'credits' || !resellerId) {
    return { mode, resellerId, solde: 0, decouvert: 0 }
  }

  const [{ data: reglages }, { data: lignes }] = await Promise.all([
    db
      .from('reseller_ai_settings')
      .select('decouvert_credits')
      .eq('reseller_id', resellerId)
      .maybeSingle<{ decouvert_credits: number }>(),
    db.from('credit_ledger').select('delta').eq('cabinet_id', cabinetId),
  ])

  const solde = (lignes ?? []).reduce((total, l) => total + (l as { delta: number }).delta, 0)
  return { mode, resellerId, solde, decouvert: reglages?.decouvert_credits ?? 0 }
}

/** La clé Anthropic du revendeur, déchiffrée, ou null s'il n'en a pas posé. */
export async function cleAnthropicDuRevendeur(resellerId: string): Promise<string | null> {
  const db = clientAdmin()
  if (!db) return null
  const { data } = await db
    .from('reseller_secrets')
    .select('anthropic_key_enc')
    .eq('reseller_id', resellerId)
    .maybeSingle<{ anthropic_key_enc: string | null }>()
  if (!data?.anthropic_key_enc) return null
  return dechiffrer(data.anthropic_key_enc)
}

/** La clé Stripe du revendeur, déchiffrée, ou null. */
export async function cleStripeDuRevendeur(resellerId: string): Promise<string | null> {
  const db = clientAdmin()
  if (!db) return null
  const { data } = await db
    .from('reseller_secrets')
    .select('stripe_secret_enc')
    .eq('reseller_id', resellerId)
    .maybeSingle<{ stripe_secret_enc: string | null }>()
  if (!data?.stripe_secret_enc) return null
  return dechiffrer(data.stripe_secret_enc)
}

/**
 * Le solde permet-il un appel de plus ?
 *
 * Le découvert existe pour une raison précise : une séance ne s'interrompt
 * pas parce qu'un compteur tombe à zéro devant une patiente. Le revendeur
 * choisit jusqu'où il avance, et la thérapeute est prévenue à l'écran.
 */
export function refusDeCredit(f: Facturation): HttpError | null {
  if (f.mode !== 'credits') return null
  if (f.solde > -f.decouvert) return null
  return new HttpError(
    402,
    f.decouvert > 0
      ? `Vos crédits d'analyse sont épuisés, découvert compris. Rechargez depuis votre tableau de bord pour reprendre.`
      : `Vos crédits d'analyse sont épuisés. Rechargez depuis votre tableau de bord pour reprendre.`,
  )
}

/**
 * Inscrit un mouvement au grand livre. Réservé au serveur.
 *
 * Un échec ici ne fait pas échouer l'appel qui vient d'aboutir : la note est
 * produite, la thérapeute l'a. Mieux vaut un crédit non débité qu'une note
 * perdue — et l'écriture manquée se voit dans le journal.
 */
export async function inscrire(input: {
  cabinetId: string
  resellerId: string
  delta: number
  reason: 'achat' | 'geste' | 'consommation' | 'ajustement'
  kind?: string
  note?: string
}): Promise<void> {
  const db = clientAdmin()
  if (!db) return
  const { error } = await db.from('credit_ledger').insert({
    cabinet_id: input.cabinetId,
    reseller_id: input.resellerId,
    delta: input.delta,
    reason: input.reason,
    kind: input.kind ?? null,
    note: input.note ?? null,
  })
  if (error) console.warn(`[credits] mouvement non inscrit — ${error.message}`)
}
