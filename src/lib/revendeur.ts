/**
 * Le revendeur : son équipe, la fermeture de ses cabinets, ses coordonnées de
 * support. Ce que les écrans en disent.
 *
 * La règle vit en base (0057) : qui peut inviter, retirer, fermer, et ce
 * qu'un cabinet fermé coupe. Ce module ne décide rien — il traduit les mots
 * que rendent les fonctions de la base, et répète quelques gardes pour ne pas
 * montrer un bouton qu'elle refusera. La base reste seule juge.
 */
import { adressePlausible } from './equipe'
import { dateLongue, euroCents, plural } from './format'

/* ---- Les rôles ---------------------------------------------------------- */

/** Les deux rôles d'un compte revendeur, tels que la base les connaît. */
export type RoleRevendeur = 'owner' | 'staff'

/** Le rôle, tel qu'on le lit à l'écran. Neutre : on ne sait pas qui l'occupe. */
export function libelleRoleRevendeur(role: string): string {
  return role === 'owner' ? 'Propriétaire du compte' : "Membre de l'équipe"
}

/**
 * Ce que chaque rôle ouvre — dit à celle ou celui qui invite, AVANT de choisir.
 *
 * Écrit d'après les politiques de la base : un membre de l'équipe ouvre des
 * cabinets, les règle et invite leurs praticiennes ; le catalogue (0049),
 * l'équipe, les coordonnées et la fermeture (0057) sont au propriétaire.
 */
export const CE_QUE_PEUT_LE_ROLE: Record<RoleRevendeur, string> = {
  staff:
    'Ouvre des cabinets, invite leurs praticiennes, règle leurs contrats, leurs exceptions et leur marque.',
  owner:
    "Tout ce que fait l'équipe, et en plus : le catalogue d'offres, l'équipe elle-même, les coordonnées de support et la fermeture d'un cabinet.",
}

/* ---- L'équipe ----------------------------------------------------------- */

/** Une ligne de `equipe_du_revendeur()`. */
export interface MembreRevendeur {
  reseller_id: string
  user_id: string
  email: string
  role: string
  created_at: string
  /** La ligne de la personne connectée. */
  moi: boolean
}

/** Une invitation d'équipe en attente, lue sur `reseller_invitations`. */
export interface InvitationRevendeur {
  id: string
  reseller_id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

/** Combien de propriétaires compte l'équipe. */
export function nombreDeProprietaires(membres: Array<{ role: string }>): number {
  return membres.filter((m) => m.role === 'owner').length
}

/**
 * Peut-on proposer « Retirer » sur cette ligne ?
 *
 * Même règle que `retirer_du_revendeur()` : jamais soi-même, jamais le
 * dernier propriétaire, et seulement quand on est propriétaire.
 */
export function peutRetirerDuRevendeur(
  membre: { role: string; moi: boolean },
  moiProprietaire: boolean,
  proprietaires: number,
): boolean {
  if (!moiProprietaire || membre.moi) return false
  if (membre.role === 'owner' && proprietaires <= 1) return false
  return true
}

/** Les mots que rend `retirer_du_revendeur()`. */
export type CodeRetraitRevendeur = 'ok' | 'pas_proprietaire' | 'soi_meme' | 'dernier_proprietaire' | 'inconnu'

/** Ce que l'écran dit après un retrait, réussi ou non. */
export function messageRetraitRevendeur(code: string | null | undefined, qui: string): { ok: boolean; message: string } {
  switch (code) {
    case 'ok':
      return {
        ok: true,
        message: `${qui} ne fait plus partie de votre équipe : ses accès à l'espace revendeur sont fermés, et les invitations envoyées depuis ce compte sont annulées.`,
      }
    case 'pas_proprietaire':
      return { ok: false, message: "Seul un propriétaire du compte peut retirer quelqu'un de l'équipe." }
    case 'soi_meme':
      return {
        ok: false,
        message: "Vous ne pouvez pas vous retirer vous-même. Un autre propriétaire du compte peut le faire.",
      }
    case 'dernier_proprietaire':
      return { ok: false, message: 'Le dernier propriétaire du compte ne peut pas être retiré.' }
    case 'inconnu':
      return { ok: false, message: `${qui} ne fait déjà plus partie de l'équipe.` }
    default:
      return { ok: false, message: "Le retrait n'a pas pu être fait. Réessayez dans un instant." }
  }
}

/** Pourquoi la base a refusé d'écrire une invitation d'équipe. */
export function refusInvitationRevendeur(code: string | undefined): string {
  if (code === '42501') return 'Seul un propriétaire du compte invite, relance ou annule une invitation.'
  if (code === '23505') return 'Une invitation attend déjà cette adresse dans votre équipe.'
  return "L'invitation n'a pas pu être enregistrée. Réessayez dans un instant."
}

/** Cette adresse est-elle déjà celle d'un membre de l'équipe ? */
export function dejaDansLEquipe(email: string, membres: Array<{ email: string }>): boolean {
  const cherche = email.trim().toLowerCase()
  return Boolean(cherche) && membres.some((m) => m.email.trim().toLowerCase() === cherche)
}

/**
 * Pourquoi l'invitation ne peut pas partir telle qu'elle est saisie — ou null.
 *
 * Dit avant d'écrire : une adresse déjà membre partait jusqu'à la base, qui
 * posait une invitation que `claim_access()` fermait aussitôt sans rien faire.
 */
export function problemeInvitation(
  email: string,
  membres: Array<{ email: string }>,
  attente: Array<{ email: string }>,
): string | null {
  const e = email.trim()
  if (!e) return null
  if (!adressePlausible(e)) return 'Cette adresse ne ressemble pas à une adresse électronique.'
  if (dejaDansLEquipe(e, membres)) return 'Cette personne fait déjà partie de votre équipe.'
  if (dejaDansLEquipe(e, attente)) return 'Une invitation attend déjà cette adresse : relancez-la plutôt.'
  return null
}

/* ---- Les coordonnées de support ---------------------------------------- */

export interface Coordonnees {
  /** Le nom affiché aux praticiennes. */
  nom: string
  /** L'adresse de support ; vide, les praticiennes ne lisent que le nom. */
  courriel: string
}

/** Les bornes de la base (0057) : 2 à 80 caractères, une adresse bien formée. */
export const NOM_MAX = 80

/** Pourquoi les coordonnées ne peuvent pas être enregistrées — ou null. */
export function problemeCoordonnees(c: Coordonnees): string | null {
  const nom = c.nom.trim()
  if (nom.length < 2) return 'Le nom affiché compte au moins deux caractères.'
  if (nom.length > NOM_MAX) return `Le nom affiché tient en ${NOM_MAX} caractères au plus.`
  const courriel = c.courriel.trim()
  if (courriel && !adressePlausible(courriel)) {
    return 'Cette adresse de support ne ressemble pas à une adresse électronique.'
  }
  return null
}

/** La ligne à écrire : le nom sans ses espaces, l'adresse vide devenue null. */
export function versLigneCoordonnees(c: Coordonnees): { name: string; support_email: string | null } {
  const courriel = c.courriel.trim()
  return { name: c.nom.trim(), support_email: courriel ? courriel : null }
}

/**
 * Ce que la praticienne lit dans son bandeau de contrat, mot pour mot.
 *
 * La même phrase que `ContactRevendeur` (src/components/layout/
 * BandeauContrat.tsx) : le revendeur voit ce qu'il publie avant de le
 * publier. Un test veille à ce que les deux ne divergent pas.
 */
export function phraseDeContact(c: Coordonnees, pour = "pour réactiver l'offre"): string {
  const nom = c.nom.trim()
  const courriel = c.courriel.trim()
  if (!nom) return `Adressez-vous à votre revendeur ${pour}.`
  if (!courriel) return `Adressez-vous à votre revendeur, ${nom}, ${pour}.`
  return `Écrivez à votre revendeur, ${nom}, ${pour} : ${courriel}.`
}

/* ---- Fermer un cabinet -------------------------------------------------- */

/** Les mots que rend `revendeur_fermer_cabinet()`. */
export type CodeFermeture = 'ok' | 'pas_proprietaire' | 'inconnu' | 'deja_ferme' | 'deja_ouvert'

/** Ce que l'écran dit après une fermeture ou une réouverture. */
export function messageFermeture(
  code: string | null | undefined,
  nom: string,
  fermer: boolean,
): { ok: boolean; message: string } {
  switch (code) {
    case 'ok':
      return fermer
        ? {
            ok: true,
            message: `${nom} est fermé. Ses patients n'ont plus accès à leur espace et sa page publique ne répond plus ; la praticienne garde ses dossiers. Vous pouvez le rouvrir à tout moment depuis sa fiche.`,
          }
        : {
            ok: true,
            message: `${nom} est rouvert : ses patients retrouvent leur espace et sa page publique répond de nouveau. Ses options ne reviennent que si son contrat est en règle.`,
          }
    case 'deja_ferme':
      return { ok: true, message: `${nom} était déjà fermé.` }
    case 'deja_ouvert':
      return { ok: true, message: `${nom} était déjà ouvert.` }
    case 'pas_proprietaire':
      return { ok: false, message: 'Seul un propriétaire du compte revendeur peut fermer ou rouvrir un cabinet.' }
    case 'inconnu':
      return { ok: false, message: "Ce cabinet n'est pas dans votre portefeuille." }
    default:
      return {
        ok: false,
        message: fermer
          ? "Le cabinet n'a pas pu être fermé. Réessayez dans un instant."
          : "Le cabinet n'a pas pu être rouvert. Réessayez dans un instant.",
      }
  }
}

/**
 * Ce que la fermeture coupe, dit AVANT le second clic.
 *
 * « Confirmer ? » seul ne protège de rien. Le revendeur doit lire que des
 * patients perdent leur espace — et qu'il ne perd rien de ce qu'il ferme.
 */
export function consequencesFermeture(nom: string, patients: number): string {
  const qui =
    patients <= 0
      ? "l'espace de ses patients"
      : patients === 1
        ? "l'espace de son patient, qui ne pourra plus s'y connecter"
        : `l'espace de ses ${patients} patients, qui ne pourront plus s'y connecter`
  return `Fermer ${nom} coupe aussitôt ${qui}, sa page publique et son widget, sa boutique, son domaine, l'analyse et l'ouverture de fiches. Rien n'est effacé : la praticienne garde ses dossiers et peut les exporter, et vous pourrez rouvrir le cabinet à tout moment.`
}

/** « Fermé depuis le 3 octobre 2026 », ou « Fermé » sans date connue. */
export function fermetureDite(fermeLe: string | null | undefined): string {
  return fermeLe ? `Fermé depuis le ${dateLongue(fermeLe)}` : 'Fermé'
}

/**
 * Le portefeuille, en deux : ce qui tourne, et ce qui est fermé.
 *
 * Un cabinet fermé ne compte ni dans le revenu, ni dans les fiches vendues,
 * ni dans « À traiter » : il n'est plus en règle par construction (0057), et
 * le laisser dans la liste allumait « Contrats en défaut » pour un geste
 * voulu.
 */
export function separerFermes<T extends { cabinet: { archived: boolean } }>(rows: T[]): { ouverts: T[]; fermes: T[] } {
  const ouverts: T[] = []
  const fermes: T[] = []
  for (const r of rows) (r.cabinet.archived ? fermes : ouverts).push(r)
  return { ouverts, fermes }
}

/* ---- La dépense d'analyse ---------------------------------------------- */

/**
 * La dépense d'analyse du mois, en euros.
 *
 * La base la rend en centimes décimaux (le coût exact de chaque appel) ; on
 * arrondit au centime. Elle est payée par le cabinet, sur sa propre clé :
 * l'écran le dit à côté, pour qu'elle ne se lise pas comme une charge du
 * revendeur.
 */
export function depenseAnalyseDite(cents: number | null | undefined): string {
  const n = Number(cents)
  return euroCents(Number.isFinite(n) && n > 0 ? Math.round(n) : 0)
}

/** « 3 praticiennes », « Aucune praticienne ». */
export function praticiennesDites(n: number): string {
  return n <= 0 ? 'Aucune praticienne' : plural(n, 'praticienne', 'praticiennes')
}
