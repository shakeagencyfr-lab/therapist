/**
 * L'accès d'un patient à son espace, tel que sa fiche le montre et le règle.
 *
 * Une fiche porte une adresse ; c'est elle qui ouvre l'espace, au premier
 * lien. `claim_access()` rattache alors le compte à la fiche — c'est
 * `auth_user_id` — et, depuis 0045, l'adresse d'une fiche rattachée ne
 * change plus qu'en détachant ce compte. Trois états en découlent, et
 * l'écran doit dire lequel : on ne relance pas un patient qui n'a jamais
 * reçu de lien comme on relance celui qui ne s'est jamais connecté.
 *
 * Tout ce qui suit est pur : les phrases se vérifient sans base ni écran.
 */

/**
 * `sans-adresse` : la fiche n'a rien à quoi envoyer un lien ;
 * `en-attente`   : une adresse, aucun compte rattaché — lien jamais ouvert ;
 * `active`       : son compte est rattaché, son espace est ouvert.
 */
export type EtatAcces = 'sans-adresse' | 'en-attente' | 'active'

export function etatAcces(fiche: { email?: string; compteActif?: boolean }): EtatAcces {
  if (fiche.compteActif) return 'active'
  return fiche.email?.trim() ? 'en-attente' : 'sans-adresse'
}

/** Ce que l'en-tête des réglages dit de l'accès, fiche repliée comprise. */
export function libelleAcces(etat: EtatAcces, email: string): string {
  switch (etat) {
    case 'active':
      return `Espace activé · ${email}`
    case 'en-attente':
      return `Espace pas encore activé · aucune connexion avec ${email}`
    default:
      return "Aucune adresse : son espace ne peut pas s'ouvrir"
  }
}

/**
 * L'adresse telle qu'on l'écrit en base.
 *
 * En minuscules parce que c'est ainsi que l'index d'unicité la compare
 * (`lower(email)`) et que `claim_access()` la rapproche du compte : une
 * majuscule de plus ne fait pas une autre personne.
 */
export function normaliserAdresse(saisie: string): string {
  return saisie.trim().toLowerCase()
}

/** Le même contrôle que le serveur d'invitations et la base : ni plus, ni moins. */
export function adresseValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * Le refus de la base, dit pour être lu.
 *
 * Deux refus sont écrits pour la thérapeute : l'adresse déjà portée par une
 * autre fiche du cabinet (l'index d'unicité), et les phrases que la
 * fonction de 0045 lève elle-même (`check_violation`). Le reste est une
 * panne, et la panne ne s'explique pas avec un code.
 */
export function refusAdresse(error: { code?: string; message?: string }, email: string): string {
  if (error.code === '23505') {
    return `Une autre fiche de votre cabinet porte déjà l'adresse ${email}.`
  }
  if (error.code === '23514' && error.message) return error.message
  return "L'adresse n'a pas pu être enregistrée. Réessayez."
}

/**
 * La phrase qui suit la création d'une fiche.
 *
 * GENRE NEUTRE. On ne sait rien de la personne au moment de créer sa fiche :
 * « Marc est ajoutée », « Elle entrera… » accordaient au féminin tous les
 * patients du cabinet. On parle donc de la fiche, et de son espace.
 *
 * `envoi` est la réponse du serveur d'invitations, ou nul quand la fiche n'a
 * pas d'adresse. Le serveur dit s'il a envoyé quelque chose : une phrase
 * d'échec ne s'affiche jamais dans le bandeau des réussites — d'où `partiel`.
 */
export function messageCreation(
  nom: string,
  email: string,
  envoi: { ok: boolean; message: string } | null,
): { message: string; partiel: boolean } {
  const faite = `La fiche de ${nom} est créée.`
  if (!email || !envoi) {
    return {
      message: `${faite} Ajoutez son adresse dans « Réglages de la fiche » pour lui ouvrir son espace.`,
      partiel: false,
    }
  }
  if (envoi.message) return { message: `${faite} ${envoi.message}`, partiel: !envoi.ok }
  return envoi.ok
    ? { message: `${faite} Son lien d'accès part à ${email}.`, partiel: false }
    : {
        message: `${faite} Le lien d'accès n'a pas pu partir : renvoyez-le depuis « Réglages de la fiche ».`,
        partiel: true,
      }
}
