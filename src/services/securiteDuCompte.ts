/**
 * La sécurité du compte : double authentification et délai d'inactivité.
 *
 * Tout passe par le service d'authentification (l'API MFA de Supabase Auth)
 * depuis le navigateur : le secret de l'application d'authentification ne
 * transite jamais par notre serveur, et n'est jamais rangé nulle part par
 * nous. Il s'affiche une fois, le temps de l'inscription, puis n'existe plus
 * que dans le téléphone de la personne et chez le service.
 *
 * Chaque geste rend `{ ok, … }` ou `{ ok: false, message }` en français :
 * l'écran n'a jamais à lire une erreur du service.
 */
import {
  adresseImageQr,
  facteursTotpVerifies,
  messageDoubleAuth,
  nomDuFacteur,
  normaliserCodeTotp,
  type FacteurLu,
} from '@/lib/doubleAuthentification'
import { CLE_METADONNEE, type DelaiInactivite } from '@/lib/inactivite'
import { supabase } from '@/lib/supabase'

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; message: string }

const SANS_BASE = "L'application n'est pas reliée à sa base : ce réglage est indisponible."

/** Où en est la double authentification du compte. */
export interface EtatDoubleAuth {
  /** L'application reliée, quand il y en a une (la plus ancienne). */
  facteur: { id: string; depuis: string | null } | null
}

/** Une inscription en cours : le QR code à scanner, et la clé à recopier. */
export interface Inscription {
  factorId: string
  /** Adresse `data:` d'une image — jamais du balisage à injecter. */
  image: string
  /** La clé secrète, pour qui ne peut pas scanner. */
  cle: string
}

/** Les facteurs du compte, relus au service (et non dans la session gardée). */
async function lireFacteurs(): Promise<Resultat<FacteurLu[]>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const { data, error } = await db.auth.mfa.listFactors()
  if (error || !data) return { ok: false, message: messageDoubleAuth(error ?? {}) }
  return { ok: true, valeur: data.all as FacteurLu[] }
}

export async function lireDoubleAuth(): Promise<Resultat<EtatDoubleAuth>> {
  const lus = await lireFacteurs()
  if (!lus.ok) return lus
  const f = facteursTotpVerifies(lus.valeur)[0]
  return {
    ok: true,
    valeur: { facteur: f?.id ? { id: f.id, depuis: f.updated_at ?? f.created_at ?? null } : null },
  }
}

/**
 * Commence l'inscription : le service fabrique un secret et son QR code.
 *
 * Les inscriptions abandonnées d'avant (onglet fermé avant le premier code)
 * sont retirées d'abord : elles s'accumulent sinon jusqu'au plafond du
 * service, et ne protègent rien.
 */
export async function commencerInscription(): Promise<Resultat<Inscription>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const lus = await lireFacteurs()
  if (lus.ok) {
    for (const f of lus.valeur) {
      if (f.status === 'unverified' && f.id) await db.auth.mfa.unenroll({ factorId: f.id })
    }
  }
  const { data, error } = await db.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: nomDuFacteur(new Date()),
    // Ce que l'application d'authentification affiche au-dessus du code.
    issuer: 'Klaro',
  })
  if (error || !data || data.type !== 'totp') {
    return { ok: false, message: messageDoubleAuth(error ?? {}) }
  }
  const image = adresseImageQr(data.totp.qr_code)
  if (!image || !data.totp.secret) {
    await db.auth.mfa.unenroll({ factorId: data.id })
    return { ok: false, message: "Le QR code n'a pas pu être préparé. Réessayez dans un instant." }
  }
  return { ok: true, valeur: { factorId: data.id, image, cle: data.totp.secret } }
}

/**
 * Le premier code : il prouve que l'application est bien réglée, et active
 * la double authentification.
 *
 * Les AUTRES appareils sont ensuite déconnectés : une session ouverte
 * ailleurs n'a jamais donné de code, et c'est justement ce qu'on veut
 * fermer. Ils demanderont le code à la prochaine connexion.
 */
export async function confirmerInscription(
  factorId: string,
  code: string,
): Promise<Resultat<{ autresFermes: boolean }>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: normaliserCodeTotp(code) })
  if (error) return { ok: false, message: messageDoubleAuth(error) }
  const { error: eAutres } = await db.auth.signOut({ scope: 'others' })
  return { ok: true, valeur: { autresFermes: !eAutres } }
}

/** Renoncer en cours d'inscription : le secret à peine créé est retiré. */
export async function abandonnerInscription(factorId: string): Promise<void> {
  await supabase()?.auth.mfa.unenroll({ factorId })
}

/**
 * Désactiver, en confirmant par un code.
 *
 * Le service exige déjà une session « aal2 » pour retirer un facteur vérifié ;
 * le code demandé ici est une preuve FRAÎCHE : un poste resté ouvert ne suffit
 * pas à ôter la protection. La session est ensuite rafraîchie, pour que le
 * jeton cesse de dire qu'une application est reliée.
 */
export async function desactiverDoubleAuth(factorId: string, code: string): Promise<Resultat<null>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: normaliserCodeTotp(code) })
  if (error) return { ok: false, message: messageDoubleAuth(error) }
  const { error: eRetrait } = await db.auth.mfa.unenroll({ factorId })
  if (eRetrait) return { ok: false, message: messageDoubleAuth(eRetrait) }
  await db.auth.refreshSession()
  return { ok: true, valeur: null }
}

/**
 * Le code demandé à la connexion.
 *
 * Un compte n'a en principe qu'une application reliée ; s'il en a plusieurs
 * (une seconde, de secours), le code est essayé sur chacune tant qu'il est
 * simplement refusé — c'est le même code pour la personne, qui ne sait pas
 * laquelle elle tient.
 */
export async function verifierCodeDeConnexion(code: string): Promise<Resultat<null>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const lus = await lireFacteurs()
  if (!lus.ok) return lus
  const facteurs = facteursTotpVerifies(lus.valeur)
  if (!facteurs.length) {
    return {
      ok: false,
      message: "Aucune application d'authentification n'est plus reliée à ce compte. Rechargez la page.",
    }
  }
  let dernier = ''
  for (const f of facteurs) {
    if (!f.id) continue
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: f.id, code: normaliserCodeTotp(code) })
    if (!error) return { ok: true, valeur: null }
    dernier = messageDoubleAuth(error)
    if (error.code !== 'mfa_verification_failed') break
  }
  return { ok: false, message: dernier || messageDoubleAuth({}) }
}

/**
 * Le délai d'inactivité, rangé dans les métadonnées du compte.
 *
 * Il suit la personne d'un appareil à l'autre, et revient dans la session :
 * aucune lecture de plus au démarrage.
 */
export async function reglerDelaiInactivite(minutes: DelaiInactivite): Promise<Resultat<null>> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const { error } = await db.auth.updateUser({ data: { [CLE_METADONNEE]: minutes } })
  if (error) return { ok: false, message: "Le réglage n'a pas pu être enregistré. Réessayez dans un instant." }
  return { ok: true, valeur: null }
}
