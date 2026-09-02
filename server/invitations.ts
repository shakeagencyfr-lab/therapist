/**
 * Envoi des invitations.
 *
 * Créer une invitation en base ne prévient personne : c'est une ligne qui
 * attend. Ce module envoie le courriel qui va avec — celui qui contient le
 * lien de connexion.
 *
 * Il tourne côté serveur parce qu'il lui faut la clé de service, qui
 * contourne la RLS. D'où la règle appliquée ici : la clé de service ne sert
 * qu'à ENVOYER. Le droit d'inviter, lui, est vérifié avec le jeton de
 * l'appelant, sous la RLS, exactement comme s'il faisait la requête lui-même.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * Adresse du site, pour la destination du lien. Fixée par le serveur et
 * jamais reçue du client : accepter une URL de retour arbitraire ouvrirait
 * une redirection vers n'importe où depuis un courriel de confiance.
 */
const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

export type InviteKind = 'praticienne' | 'patiente'

export interface InviteBody {
  email: string
  cabinetId: string
  kind: InviteKind
}

export interface InviteResult {
  status: number
  body: { ok?: boolean; message: string }
}

/**
 * La configuration nécessaire à l'envoi est-elle présente ?
 *
 * La clé publiable en fait partie : c'est elle qui sert à construire le
 * client agissant au nom de l'appelant. Sans elle, createClient lève — et
 * une exception ici mettrait l'API par terre plutôt que de refuser poliment.
 */
export function peutEnvoyer(): boolean {
  return Boolean(URL && SERVICE && PUBLISHABLE)
}

/** Client agissant AU NOM de l'appelant : la RLS s'applique. */
function clientAppelant(token: string): SupabaseClient {
  return createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Client d'administration : réservé à l'envoi du courriel. */
function clientAdmin(): SupabaseClient {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function adresseValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export async function envoyerInvitation(
  token: string | null,
  raw: unknown,
): Promise<InviteResult> {
  if (!peutEnvoyer()) {
    return {
      status: 503,
      body: {
        message:
          "L'envoi des invitations n'est pas configuré sur ce serveur. La personne peut se connecter en entrant son adresse sur le site.",
      },
    }
  }
  if (!token) {
    return { status: 401, body: { message: 'Connectez-vous pour inviter quelqu’un.' } }
  }

  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<InviteBody>
  const email = String(body.email ?? '').trim().toLowerCase()
  const cabinetId = String(body.cabinetId ?? '').trim()
  const kind: InviteKind = body.kind === 'patiente' ? 'patiente' : 'praticienne'

  if (!adresseValide(email)) {
    return { status: 400, body: { message: "Cette adresse ne ressemble pas à une adresse électronique." } }
  }
  if (!cabinetId) {
    return { status: 400, body: { message: 'Cabinet manquant.' } }
  }

  // ---- Le droit d'inviter, vérifié sous la RLS de l'appelant --------------
  const appelant = clientAppelant(token)

  /** L'identifiant public du cabinet : il donne l'adresse de sa vitrine. */
  let slugCabinet: string | null = null

  if (kind === 'praticienne') {
    // Un revendeur ne voit que ses propres cabinets : si la ligne remonte,
    // c'est qu'il en est le vendeur.
    const { data, error } = await appelant
      .from('cabinets')
      .select('id, slug')
      .eq('id', cabinetId)
      .maybeSingle<{ id: string; slug: string | null }>()
    if (error || !data) {
      return { status: 403, body: { message: "Ce cabinet n'est pas le vôtre." } }
    }
    slugCabinet = data.slug
    const { data: invitation } = await appelant
      .from('cabinet_invitations')
      .select('email')
      .eq('cabinet_id', cabinetId)
      .is('accepted_at', null)
      .ilike('email', email)
      .maybeSingle()
    if (!invitation) {
      return { status: 409, body: { message: "Aucune invitation en attente pour cette adresse." } }
    }
  } else {
    // Une praticienne n'invite que dans son propre cabinet, et seulement
    // quelqu'un dont elle a déjà créé la fiche.
    const { data, error } = await appelant
      .from('patients')
      .select('id')
      .eq('cabinet_id', cabinetId)
      .ilike('email', email)
      .maybeSingle()
    if (error || !data) {
      return { status: 403, body: { message: "Aucune fiche à cette adresse dans votre cabinet." } }
    }
  }

  // ---- L'envoi, avec la clé de service ------------------------------------
  // Une praticienne arrive sur l'adresse de son cabinet quand il en a une :
  // la porte porte déjà sa marque, avant qu'elle ait entré son adresse.
  const destination =
    kind === 'patiente' ? `${SITE}/mon` : slugCabinet ? `${SITE}/c/${slugCabinet}` : `${SITE}/`
  const admin = clientAdmin()
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: SITE ? destination : undefined,
  })

  if (error) {
    // Un compte existe déjà : il n'y a rien à envoyer, la personne se
    // connecte comme d'habitude. Ce n'est pas un échec.
    const dejaInscrit = /already/i.test(error.message) || error.status === 422
    if (dejaInscrit) {
      return {
        status: 200,
        body: {
          ok: true,
          message: `${email} a déjà un compte : elle se connecte depuis le site avec cette adresse.`,
        },
      }
    }
    // Journal technique seulement : ni contenu, ni dossier.
    console.error(`[invitation] ${kind} — ${error.status ?? ''} ${error.message}`)
    const trop = error.status === 429
    return {
      status: trop ? 429 : 502,
      body: {
        message: trop
          ? "Trop de courriels envoyés dans l'heure. Réessayez plus tard, ou configurez un service d'envoi."
          : "L'invitation n'a pas pu être envoyée. La personne peut se connecter en entrant son adresse sur le site.",
      },
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      message: `Invitation envoyée à ${email}. Le lien la connectera directement.`,
    },
  }
}
