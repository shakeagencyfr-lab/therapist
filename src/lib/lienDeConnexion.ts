/**
 * Le lien des courriels de connexion, sur NOTRE domaine.
 *
 * Le bouton des courriels pointait vers l'adresse de la base
 * (`<projet>.supabase.co/auth/v1/verify?token=…`) alors que le courriel part
 * de klaroweb.site : un lien qui ne mène pas au domaine de l'expéditeur est
 * le premier signe d'hameçonnage que regardent les messageries, et le
 * courriel finissait en indésirables. Pire, les robots qui « visitent » les
 * liens d'un courriel reçu (Outlook, certaines passerelles d'entreprise)
 * consommaient ce lien à usage unique avant la personne.
 *
 * Désormais le lien mène à la page où l'on veut entrer, avec l'empreinte du
 * jeton (`?token_hash=…&type=…`). C'est la page — donc un navigateur qui
 * exécute l'application, pas un robot — qui l'échange contre une session
 * (`verifyOtp`), puis l'efface de l'adresse.
 *
 * Sans aucun import : le serveur le charge aussi (invitations du cabinet).
 */

/** Les types de lien que le service d'authentification sait vérifier par empreinte. */
export const TYPES_DE_LIEN = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'] as const
export type TypeDeLien = (typeof TYPES_DE_LIEN)[number]

export interface JetonDeLien {
  tokenHash: string
  type: TypeDeLien
}

/** L'empreinte portée par l'adresse, si elle en porte une qui se tient. */
export function lireJetonDeLien(recherche: string): JetonDeLien | null {
  const q = new URLSearchParams(recherche.replace(/^\?/, ''))
  const tokenHash = q.get('token_hash') ?? ''
  const type = q.get('type') ?? ''
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) return null
  if (!(TYPES_DE_LIEN as readonly string[]).includes(type)) return null
  return { tokenHash, type: type as TypeDeLien }
}

/** L'adresse sans l'empreinte : elle ne sert qu'une fois, elle ne reste ni à l'écran ni dans l'historique. */
export function retirerJetonDeLien(adresse: string): string {
  const url = new URL(adresse)
  url.searchParams.delete('token_hash')
  url.searchParams.delete('type')
  return url.pathname + (url.search === '?' ? '' : url.search) + url.hash
}

/** Le lien d'un courriel : la page d'arrivée, et l'empreinte à y échanger. */
export function lienVersLaPage(destination: string, tokenHash: string, type: TypeDeLien): string {
  const url = new URL(destination)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', type)
  return url.toString()
}
