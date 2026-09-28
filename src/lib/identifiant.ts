/**
 * L'identifiant d'un cabinet : ce qu'on en saisit, ce qu'on en refuse, et ce
 * que devient une adresse quand il change.
 *
 * L'identifiant est une ADRESSE — klaroweb.site/son-identifiant, et
 * /son-identifiant/mon pour l'espace des patients. Depuis 0049, un ancien
 * identifiant continue d'y mener : la base le résout (`cabinet_vitrine`) et
 * rend l'actuel, et l'écran remplace l'adresse par la nouvelle. Ce module dit
 * laquelle.
 */
import { CHEMINS_RESERVES } from './vitrine'

/** La forme que la base exige (contrainte `cabinets_slug_forme`). */
const FORME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

/**
 * Ce que le champ garde pendant la frappe.
 *
 * `slugify` retire les tirets de fin : appliqué à chaque frappe, il rendait
 * impossible d'écrire « cabinet-fontaine » — le tiret disparaissait avant
 * qu'on ait tapé la suite. Ici on nettoie sans retirer le tiret final ; la
 * vérification, elle, dit s'il en reste un au moment de publier.
 */
export function identifiantEnSaisie(brut: string): string {
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
}

/**
 * Pourquoi cet identifiant ne peut pas servir d'adresse — ou null s'il le
 * peut. Dit AVANT l'écriture : la base refuse de toute façon, mais son refus
 * est un code, et le revendeur mérite de savoir lequel de ses mots pose
 * problème.
 */
export function problemeIdentifiant(slug: string): string | null {
  const s = slug.trim()
  if (s.length < 3) return "L'identifiant compte au moins trois caractères : c'est une adresse à la racine du domaine."
  if (CHEMINS_RESERVES.has(s)) {
    return `« ${s} » est réservé par la plateforme : il servirait une page de Klaro plutôt que le cabinet.`
  }
  if (!FORME.test(s)) {
    return "Lettres non accentuées, chiffres et tirets seulement, sans tiret au début ni à la fin."
  }
  return null
}

/**
 * L'adresse ouverte, réécrite sous l'identifiant actuel du cabinet — ou null
 * s'il n'y a rien à réécrire.
 *
 * Les trois portes d'un cabinet sont couvertes : sa page (/ancien, et
 * l'ancienne forme /c/ancien), l'espace de ses patients (/ancien/mon) et le
 * widget posé sur son site (/e/ancien). Tout le reste de l'adresse — la
 * requête, le fragment qui porte parfois un jeton de connexion — est gardé
 * par l'appelant, qui ne remplace que le chemin.
 */
export function cheminSousIdentifiant(chemin: string, lu: string, actuel: string): string | null {
  const ancien = lu.trim().toLowerCase()
  const nouveau = actuel.trim().toLowerCase()
  if (!nouveau || ancien === nouveau) return null
  const m = /^\/(?:(c|e)\/)?([a-z0-9][a-z0-9-]{0,62})(\/mon)?\/?$/i.exec(chemin.trim())
  if (!m || (m[2] ?? '').toLowerCase() !== ancien) return null
  const widget = (m[1] ?? '').toLowerCase() === 'e'
  if (widget && m[3]) return null
  return `${widget ? '/e' : ''}/${nouveau}${m[3] ? '/mon' : ''}`
}
