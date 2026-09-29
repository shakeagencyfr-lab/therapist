/**
 * Les demandes d'essai de la page d'accueil, côté serveur.
 *
 * Le visiteur n'a pas de compte. Sa demande passe ici — et non directement
 * par la base — pour une seule raison : le CAPTCHA. Vérifié par le serveur
 * avec la clé secrète, il ne vaut quelque chose que si aucune autre porte
 * n'existe ; c'est pourquoi `deposer_demande_essai` (0060) ne s'exécute que
 * pour la clé de service. Ouverte au rôle anonyme, n'importe quel robot
 * l'aurait appelée directement et le CAPTCHA n'aurait rien gardé.
 *
 * L'ordre, et ce que chaque étape arrête :
 *   1. le champ piège — un robot qui le remplit reçoit un « merci », rien
 *      n'est écrit, et il n'apprend pas qu'il a été reconnu ;
 *   2. la relecture de chaque champ (src/lib/demandeEssai.ts, la même que
 *      celle de l'écran) ;
 *   3. le CAPTCHA, si `HCAPTCHA_SECRET` est posé — sinon, rien : les bornes
 *      de la base sont alors la seule garde, et elles tiennent ;
 *   4. la base, qui relit tout encore une fois et borne : trois demandes par
 *      adresse et par jour, trente par heure sur la plateforme.
 *
 * Aucun contenu de demande n'est journalisé : un nom, une adresse et un
 * cabinet sont des données personnelles.
 */
import { confirmation, reponseAuRefus, validerDemande, type DemandePropre } from '../src/lib/demandeEssai.js'
import { clientAdmin } from './auth.js'

export interface ReponseDemande {
  status: number
  body: { ok?: boolean; message: string; erreurs?: Record<string, string> }
}

/** Le nom du geste, tel que la page l'envoie à api/invitations. */
export const GESTE_DEMANDE = 'demande-essai'

/** Ce dont la demande a besoin du monde extérieur — séparé pour s'éprouver sans lui. */
export interface PorteDemande {
  /** La clé secrète hCaptcha, ou null quand le CAPTCHA n'est pas réglé. */
  secretCaptcha: string | null
  /** Demande à hCaptcha si le jeton est bon. Lève si hCaptcha ne répond pas. */
  verifierCaptcha(jeton: string, secret: string, ip: string | null): Promise<boolean>
  /** Appelle la fonction de dépôt. Rend sa réponse, ou null si la base n'a pas répondu. */
  deposer(demande: DemandePropre): Promise<{ ok?: boolean; motif?: string } | null>
}

/** Le délai au-delà duquel hCaptcha est tenu pour injoignable. */
const DELAI_CAPTCHA_MS = 6_000

async function verifierAupresDeHcaptcha(jeton: string, secret: string, ip: string | null): Promise<boolean> {
  const corps = new URLSearchParams({ secret, response: jeton })
  if (ip) corps.set('remoteip', ip)
  const cleDeSite = (process.env.VITE_HCAPTCHA_SITE_KEY ?? '').trim()
  if (cleDeSite) corps.set('sitekey', cleDeSite)
  const abandon = new AbortController()
  const minuteur = setTimeout(() => abandon.abort(), DELAI_CAPTCHA_MS)
  try {
    const reponse = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps.toString(),
      signal: abandon.signal,
    })
    const lu = (await reponse.json().catch(() => ({}))) as { success?: boolean }
    return lu.success === true
  } finally {
    clearTimeout(minuteur)
  }
}

async function deposerEnBase(demande: DemandePropre): Promise<{ ok?: boolean; motif?: string } | null> {
  const admin = clientAdmin()
  if (!admin) return null
  const { data, error } = await admin.rpc('deposer_demande_essai', {
    p_nom: demande.nom,
    p_email: demande.email,
    p_telephone: demande.telephone,
    p_cabinet: demande.cabinet,
    p_ville: demande.ville,
    p_patients: demande.patients,
    p_offre: demande.offre,
    p_message: demande.message,
    p_consentement: demande.consentement,
  })
  if (error) {
    // Le code seulement : jamais le contenu de la demande.
    console.error(`[demande-essai] dépôt — ${error.code ?? ''} ${error.message}`)
    return null
  }
  return (data ?? null) as { ok?: boolean; motif?: string } | null
}

/** La porte réelle : hCaptcha et la base. */
export function porteReelle(): PorteDemande {
  const secret = (process.env.HCAPTCHA_SECRET ?? '').trim()
  return {
    secretCaptcha: secret || null,
    verifierCaptcha: verifierAupresDeHcaptcha,
    deposer: deposerEnBase,
  }
}

/**
 * Déposer une demande d'essai.
 *
 * `corps` est le corps brut de la requête : `{ geste, demande, piege, captcha }`.
 */
export async function deposerDemande(
  corps: unknown,
  ip: string | null,
  porte: PorteDemande = porteReelle(),
): Promise<ReponseDemande> {
  const brut = (corps && typeof corps === 'object' ? corps : {}) as {
    demande?: unknown
    piege?: unknown
    captcha?: unknown
  }

  const verdict = validerDemande(brut.demande)

  /* 1. LE CHAMP PIÈGE. Un humain ne le voit pas ; un robot le remplit. On
     répond comme à un humain — un refus lui apprendrait quoi éviter. */
  if (typeof brut.piege === 'string' && brut.piege.trim()) {
    return { status: 200, body: { ok: true, message: confirmation(verdict.ok ? verdict.demande : null) } }
  }

  // 2. Chaque champ, relu comme l'écran le relit.
  if (!verdict.ok) {
    return {
      status: 400,
      body: { message: 'Quelques champs sont à compléter.', erreurs: verdict.erreurs as Record<string, string> },
    }
  }

  // 3. Le CAPTCHA, quand il est réglé.
  if (porte.secretCaptcha) {
    const jeton = typeof brut.captcha === 'string' ? brut.captcha.trim() : ''
    if (!jeton) {
      return {
        status: 400,
        body: { message: 'Cochez la case « Je suis un humain » avant d’envoyer : elle nous protège des robots.' },
      }
    }
    let bon = false
    try {
      bon = await porte.verifierCaptcha(jeton, porte.secretCaptcha, ip)
    } catch {
      return {
        status: 503,
        body: { message: 'La vérification anti-robot ne répond pas. Réessayez dans un instant : rien n’a été enregistré.' },
      }
    }
    if (!bon) {
      return {
        status: 400,
        body: { message: 'La vérification anti-robot n’a pas abouti. Cochez la case à nouveau, puis renvoyez.' },
      }
    }
  }

  // 4. La base, qui relit et borne.
  const rendu = await porte.deposer(verdict.demande)
  if (!rendu) {
    return {
      status: 503,
      body: { message: 'Votre demande n’a pas pu être enregistrée. Réessayez dans un instant.' },
    }
  }
  if (rendu.ok !== true) {
    const { status, message } = reponseAuRefus(rendu.motif)
    return { status, body: { message } }
  }
  return { status: 200, body: { ok: true, message: confirmation(verdict.demande) } }
}

/**
 * L'adresse du visiteur, pour hCaptcha seulement — elle n'est ni gardée, ni
 * journalisée. Sur l'hébergeur, `x-forwarded-for` est posé par lui ; sa
 * première valeur est le client.
 */
export function ipDuVisiteur(entetes: Record<string, string | string[] | undefined>): string | null {
  const brut = entetes['x-forwarded-for']
  const valeur = Array.isArray(brut) ? brut[0] : brut
  const premiere = (valeur ?? '').split(',')[0]?.trim()
  return premiere || null
}

/** Le corps porte-t-il une demande d'essai plutôt qu'une invitation ? */
export function estUneDemande(corps: unknown): boolean {
  return Boolean(corps && typeof corps === 'object' && (corps as { geste?: unknown }).geste === GESTE_DEMANDE)
}
