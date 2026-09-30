/**
 * Lire un corps de requête d'analyse : le dossier, les textes, les bornes.
 *
 * Sortis de server/ai.ts quand la retouche (server/retouche.ts) a eu besoin
 * de lire le même dossier, avec les mêmes refus : une seule lecture, pour
 * que la retouche d'un texte n'accepte pas ce que son écriture refusait.
 */
import { HttpError } from './errors.js'
import { contexteLuSchema, type PatientContext } from './schemas.js'

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Le dossier du patient, LU et non plus cru sur parole (server/schemas.ts).
 *
 * Un champ d'un mauvais type levait un TypeError au milieu d'un prompt, et
 * l'écran disait « Erreur interne du serveur » : un message qui n'apprend
 * rien à personne. Le refus se dit maintenant, avec le remède — un onglet
 * resté sur une ancienne version de l'application se corrige en rechargeant.
 */
export function asContext(value: unknown): PatientContext {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'Le dossier du patient est absent de la requête.')
  }
  const lu = contexteLuSchema.safeParse(value)
  if (!lu.success) {
    // Les chemins seulement — des noms de champs, jamais leur contenu.
    const champs = lu.error.issues.map((i) => i.path.join('.') || '(racine)').join(', ')
    console.warn(`[ia] dossier illisible — ${champs}`)
    throw new HttpError(
      400,
      "Le dossier du patient est arrivé incomplet. Rechargez la page, puis relancez : rien n'a été produit.",
    )
  }
  return lu.data
}

/** Au plus `combien` chaînes, de `longueur` caractères au plus : le reste est ignoré. */
export function asStrings(value: unknown, combien: number, longueur: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.slice(0, longueur))
        .slice(0, combien)
    : []
}

/**
 * Ce que la thérapeute écrit elle-même, borné AVEC REFUS.
 *
 * À l'inverse du dossier, qu'on coupe sans rien dire (server/schemas.ts) :
 * couper en silence la fin d'une séance ferait analyser une séance qui n'a
 * pas eu lieu, couper un brief ferait écrire un module sur la moitié d'une
 * intention. Au-delà, la requête est refusée en disant quoi raccourcir. Les
 * bornes sont larges — trois heures de parole, des pages de notes — : elles
 * n'arrêtent qu'un corps qui n'a plus rien d'une séance, avant qu'il ne
 * devienne une facture.
 */
export const BORNES = {
  /** Transcription et notes d'une séance : environ trois heures de parole. */
  matiere: 200_000,
  brief: 4_000,
  notes: 50_000,
  intention: 2_000,
}

export const nombre = (n: number) => n.toLocaleString('fr-FR')
