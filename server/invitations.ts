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
 *
 * En marque blanche totale, le courriel part du serveur d'envoi du cabinet et
 * le lien mène à SON domaine (server/courriel.ts, server/domaines.ts). Sinon,
 * il part du service de la plateforme, comme avant. C'est le même lien de
 * connexion dans les deux cas : seule l'enveloppe change.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { envoyerParCabinet, smtpDuCabinet } from './courriel.js'
import { levierDuCabinet } from './droits.js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * Adresse du site, pour la destination du lien. Fixée par le serveur et
 * jamais reçue du client : accepter une URL de retour arbitraire ouvrirait
 * une redirection vers n'importe où depuis un courriel de confiance.
 */
const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

export type InviteKind = 'praticienne' | 'patient'

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

/**
 * L'adresse à laquelle la personne arrivera.
 *
 * Le domaine vérifié du cabinet l'emporte sur le nôtre : en marque blanche,
 * un lien qui ramène sur l'adresse de la plateforme annule tout le reste.
 */
async function baseDuCabinet(
  admin: SupabaseClient,
  cabinetId: string,
): Promise<{ base: string; sien: boolean }> {
  const { data } = await admin
    .from('cabinet_domains')
    .select('domaine, verifie')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ domaine: string; verifie: boolean }>()
  if (!data?.verifie || !data.domaine) return { base: SITE, sien: false }
  /* Un domaine posé et vérifié ne suffit pas : encore faut-il que l'offre
     l'ouvre encore. Depuis 0023, un levier fermé fait cesser de répondre le
     domaine — un lien qui y mène ramènerait donc sur une porte muette, des
     semaines après l'envoi. On repasse alors par l'adresse de la plateforme,
     qui, elle, répond toujours. */
  const ouvert = await levierDuCabinet(cabinetId, 'marqueBlanche', admin)
  return ouvert ? { base: `https://${data.domaine}`, sien: true } : { base: SITE, sien: false }
}

/** Ce que `lienDeConnexion` a fait, et pas seulement ce qu'il a rendu. */
interface LienNeuf {
  /** Le lien, quand il y en a un — et alors LE COMPTE VIENT D'ÊTRE CRÉÉ. */
  lien: string | null
  /** Rien à envoyer : la personne était déjà inscrite. Ce n'est pas une panne. */
  existe: boolean
}

/**
 * Le lien de connexion d'un compte QUI N'EXISTE PAS ENCORE.
 *
 * C'est ce qui permet de l'expédier nous-mêmes, depuis le serveur d'envoi du
 * cabinet — et c'est aussi ce qui rend la limite indispensable.
 *
 * Un lien de connexion ouvre un compte. Le fabriquer ici, c'est le faire
 * passer par un serveur d'envoi que le cabinet possède et dont il lit les
 * journaux. Tant que le compte est neuf, la seule chose qui transite est une
 * porte vers un espace vide, celui que le cabinet vient lui-même de créer.
 *
 * Si le compte existe déjà, non. `magiclink` rendrait un lien qui ouvre un
 * compte EXISTANT — celui d'une consœur, d'un revendeur, de qui l'on veut
 * pourvu qu'on connaisse son adresse et qu'on ait posé une fiche à ce nom.
 * On ne le fabrique donc pas : l'envoi retombe sur le service de la
 * plateforme, dont le courriel ne passe que par la boîte de la destinataire.
 */
async function lienDeConnexion(
  admin: SupabaseClient,
  email: string,
  redirectTo: string | undefined,
): Promise<LienNeuf> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })
  if (error) {
    // Compte existant : ce n'est pas une panne, c'est le cas qu'on refuse.
    const existe = dejaInscrit(error)
    if (!existe) console.error(`[invitation] lien — ${error.status ?? ''} ${error.message}`)
    return { lien: null, existe }
  }
  const lien = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? null
  return { lien, existe: false }
}

/**
 * Cette erreur dit-elle « ce compte existe déjà » ?
 *
 * La distinction porte tout le reste : un compte existant n'est pas une
 * panne, et une panne n'est pas un compte existant. Les deux appels qui
 * ouvrent un compte la posent, et ils doivent la poser de la même manière —
 * elle vivait ici en deux exemplaires qui ne disaient pas tout à fait pareil.
 */
export function dejaInscrit(error: { message?: string | null; status?: number | null } | null): boolean {
  if (!error) return false
  return /already|registered|exists/i.test(error.message ?? '') || error.status === 422
}

/**
 * Le courriel n'est pas parti du serveur du cabinet — et il ne partira pas.
 *
 * À ce moment-là le compte EST ouvert : `generateLink` l'a créé pour
 * fabriquer le lien. Le service de la plateforme ne sait plus rien en faire —
 * il n'invite qu'un compte neuf — et répondrait « déjà inscrite » sur celui
 * que nous venons nous-mêmes d'ouvrir. Longtemps, c'est cette réponse-là qui
 * remontait à l'écran : un bandeau vert, « elle a déjà un compte », alors que
 * personne n'avait rien reçu et que la thérapeute croyait l'invitation
 * partie. On dit donc les deux choses vraies : rien n'est parti, et le compte
 * est là — elle y entre en saisissant son adresse.
 */
export function courrielNonParti(email: string): InviteResult {
  return {
    status: 502,
    body: {
      message: `Votre serveur d'envoi n'a pas répondu : le courriel n'est pas parti. Le compte de ${email} est bien ouvert — elle peut se connecter en entrant son adresse sur le site. Vérifiez vos réglages d'envoi dans Marque blanche, puis prévenez-la.`,
    },
  }
}

/** Le courriel d'invitation, en marque blanche. Rien d'un dossier n'y figure. */
function corpsInvitation(
  kind: InviteKind,
  cabinet: string,
  lien: string,
): { subject: string; text: string; html: string } {
  /* `cabinet` est le nom du cabinet lui-même. L'objet disait donc « Votre
     cabinet sur Cabinet Claire Fontaine » : son cabinet sur son cabinet. La
     praticienne est invitée DANS le sien, pas sur quelque chose d'autre. */
  const objet = kind === 'patient' ? `Votre espace — ${cabinet}` : `${cabinet} vous attend`
  const intro =
    kind === 'patient'
      ? `${cabinet} vous a ouvert votre espace entre les séances : vos exercices de la semaine, votre journal et vos audios.`
      : `${cabinet} est ouvert. Ce lien vous y connecte et vous en rend propriétaire.`
  const text = `${intro}\n\nVotre lien de connexion :\n${lien}\n\nIl vous connecte directement, sans mot de passe à retenir. Si vous n'attendiez pas ce message, ignorez-le : personne n'a accès à votre espace sans ce lien.`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1b1a17">
  <p>${echapper(intro)}</p>
  <p><a href="${echapper(lien)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1b1a17;color:#fff;text-decoration:none">Ouvrir mon espace</a></p>
  <p style="font-size:13px;color:#6b6558">Ce lien vous connecte directement, sans mot de passe à retenir. Si vous n'attendiez pas ce message, ignorez-le : personne n'a accès à votre espace sans ce lien.</p>
</div>`
  return { subject: objet, text, html }
}

/** Le strict nécessaire : ces textes viennent de nous, mais le lien est long. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  /* Le mot est passé de « patiente » à « patient ». Un navigateur qui a
     gardé l'ancien paquet en cache enverra encore l'ancienne valeur pendant
     quelques heures : on l'accepte, plutôt que de traiter sa patiente comme
     une praticienne et de l'envoyer sur le mauvais espace. */
  const demande = String(body.kind ?? '')
  const kind: InviteKind = demande === 'patient' || demande === 'patiente' ? 'patient' : 'praticienne'

  if (!adresseValide(email)) {
    return { status: 400, body: { message: "Cette adresse ne ressemble pas à une adresse électronique." } }
  }
  if (!cabinetId) {
    return { status: 400, body: { message: 'Cabinet manquant.' } }
  }

  // ---- Le droit d'inviter, vérifié sous la RLS de l'appelant --------------
  const appelant = clientAppelant(token)
  /* La clé de service ne sert QU'À ENVOYER : elle lit l'identifiant public du
     cabinet et son domaine, jamais un dossier. Le droit d'inviter, lui, est
     vérifié plus bas avec le jeton de l'appelant, sous la RLS. */
  const admin = clientAdmin()

  /**
   * L'identifiant public du cabinet.
   *
   * Il sert deux fois : l'adresse de la vitrine pour une praticienne, et
   * celle de l'espace patient — `/son-identifiant/mon` — quand le cabinet
   * n'a pas de domaine à lui. Sans lui, un patient reçoit un lien vers la
   * porte du produit alors que son cabinet a une marque.
   */
  let slugCabinet: string | null = null
  {
    const { data } = await admin
      .from('cabinets')
      .select('slug')
      .eq('id', cabinetId)
      .maybeSingle<{ slug: string | null }>()
    slugCabinet = data?.slug ?? null
  }

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

  // ---- L'envoi -------------------------------------------------------------
  // Une praticienne arrive sur l'adresse de son cabinet quand il en a une :
  // la porte porte déjà sa marque, avant qu'elle ait entré son adresse.
  const { base, sien } = await baseDuCabinet(admin, cabinetId)
  /* Sur le domaine du cabinet, `/mon` suffit : l'adresse dit déjà de qui il
     s'agit. Sur le nôtre, on passe par `/son-identifiant/mon`, qui ouvre la
     même application avec sa marque à lui sur la porte. */
  const espacePatient = sien || !slugCabinet ? `${base}/mon` : `${base}/${slugCabinet}/mon`
  const destination =
    kind === 'patient' ? espacePatient : slugCabinet ? `${base}/${slugCabinet}` : `${base}/`

  /* ---- D'abord son serveur d'envoi, si elle en a un --------------------
     En marque blanche totale, le courriel doit partir de son adresse. Le
     lien, lui, ne se fabrique qu'une fois : le demander OUVRE le compte, et
     ferme d'avance la porte du service de la plateforme. Un échec de son
     serveur ne se rattrape donc pas — il se dit. */
  const smtp = await smtpDuCabinet(cabinetId)
  /* Vrai quand le lien n'a pas pu être fabriqué pour son serveur : le
     courriel partira quand même, mais depuis la plateforme — et elle doit le
     savoir, sinon elle croira son domaine en service alors qu'il ne l'est
     pas. */
  let replie = false
  if (smtp) {
    const { data: fiche } = await admin
      .from('cabinets')
      .select('name')
      .eq('id', cabinetId)
      .maybeSingle<{ name: string }>()
    const nomCabinet = fiche?.name ?? 'Votre cabinet'
    const { lien, existe } = await lienDeConnexion(admin, email, base ? destination : undefined)
    if (lien) {
      /* Le compte est ouvert à partir d'ici. Il n'y a plus de repli : ou le
         courriel part de chez elle, ou il ne part pas. */
      let parti = false
      try {
        const courriel = corpsInvitation(kind, nomCabinet, lien)
        /* Le booléen n'était pas lu : `envoyerParCabinet` rend faux quand le
           cabinet n'a plus de réglages d'envoi — effacés entre les deux
           lectures — et l'écran annonçait alors un envoi depuis une adresse
           d'où rien n'était parti. */
        parti = await envoyerParCabinet(cabinetId, { to: email, fromName: nomCabinet, ...courriel })
        if (!parti) console.error(`[invitation] smtp cabinet — réglages disparus avant l'envoi`)
      } catch (err) {
        // Journal technique seulement : ni mot de passe, ni dossier.
        console.error(`[invitation] smtp cabinet — ${(err as Error).message}`)
      }
      if (!parti) return courrielNonParti(email)
      return {
        status: 200,
        body: {
          ok: true,
          message: `Invitation envoyée à ${email} depuis ${smtp.from}. Le lien la connectera directement.`,
        },
      }
    }
    /* Pas de lien, donc pas de compte ouvert. Si la personne est déjà
       inscrite, le service de la plateforme le dira comme avant ; sinon,
       c'est notre fabrique qui a échoué et le courriel partira de chez nous,
       pas de chez elle. */
    replie = !existe
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: base ? destination : undefined,
  })

  if (error) {
    // Un compte existe déjà : il n'y a rien à envoyer, la personne se
    // connecte comme d'habitude. Ce n'est pas un échec.
    if (dejaInscrit(error)) {
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
      message: replie
        ? `Invitation envoyée à ${email}, mais depuis nos serveurs : son lien n'a pas pu être préparé pour les vôtres. Il la connectera directement.`
        : `Invitation envoyée à ${email}. Le lien la connectera directement.`,
    },
  }
}
