/**
 * Les demandes d'essai, vues du revendeur qui les accueille — la part qui se
 * raisonne sans réseau : l'ordre de la liste, ce qu'on en dit, et ce qu'une
 * demande pré-remplit dans le formulaire d'ouverture d'un cabinet.
 *
 * La lecture et l'écriture sont dans src/reseller/useDemandes.ts ; la base
 * décide de qui voit quoi (0060).
 */
import { FOURCHETTES, OFFRES_DEMANDEES } from './demandeEssai'

export type StatutDemande = 'nouvelle' | 'contactee' | 'ouverte' | 'sans-suite'

export const STATUTS: Array<{ valeur: StatutDemande; libelle: string }> = [
  { valeur: 'nouvelle', libelle: 'Nouvelle' },
  { valeur: 'contactee', libelle: 'Contactée' },
  { valeur: 'ouverte', libelle: 'Cabinet ouvert' },
  { valeur: 'sans-suite', libelle: 'Sans suite' },
]

export function libelleStatut(statut: string): string {
  return STATUTS.find((s) => s.valeur === statut)?.libelle ?? statut
}

/** Une ligne de `demandes_essai`, telle que la base la rend au revendeur. */
export interface DemandeEssai {
  id: string
  created_at: string
  nom: string
  email: string
  telephone: string | null
  cabinet: string
  ville: string
  patients: string
  offre: string
  message: string | null
  consentement_le: string
  statut: StatutDemande
  statut_le: string | null
  note_interne: string
}

/** La longueur maximale de la note interne (0060). */
export const NOTE_MAX = 4000

/** Les nouvelles d'abord, puis la plus récente en tête. */
export function trierDemandes(demandes: DemandeEssai[]): DemandeEssai[] {
  return [...demandes].sort((a, b) => {
    const na = a.statut === 'nouvelle' ? 0 : 1
    const nb = b.statut === 'nouvelle' ? 0 : 1
    if (na !== nb) return na - nb
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
}

export function compterNouvelles(demandes: DemandeEssai[]): number {
  return demandes.filter((d) => d.statut === 'nouvelle').length
}

/** « Demandes · 3 » : le badge de l'onglet, sans chiffre quand il n'y a rien de neuf. */
export function libelleOnglet(nouvelles: number): string {
  return nouvelles > 0 ? `Demandes · ${nouvelles}` : 'Demandes'
}

export function libelleFourchette(valeur: string): string {
  return FOURCHETTES.find((f) => f.valeur === valeur)?.libelle ?? valeur
}

export function libelleOffre(valeur: string): string {
  return OFFRES_DEMANDEES.find((o) => o.valeur === valeur)?.libelle ?? valeur
}

/**
 * Ce que la demande pré-remplit dans « Ouvrir un cabinet ».
 *
 * L'offre demandée n'est reprise que si le catalogue du revendeur la connaît
 * encore ; sinon — « Je ne sais pas encore », ou une offre retirée — on laisse
 * celle du formulaire. L'identifiant reste vide : il suit le nom du cabinet,
 * et c'est au revendeur de le vérifier (il fait l'adresse du cabinet).
 */
export function preremplissage(
  demande: Pick<DemandeEssai, 'cabinet' | 'nom' | 'email' | 'offre'>,
  offresDuCatalogue: string[],
): { rNewName: string; rNewTherapist: string; rNewEmail: string; rNewSlug: string; rNewPlan?: string } {
  const champs = {
    rNewName: demande.cabinet,
    rNewTherapist: demande.nom,
    rNewEmail: demande.email,
    rNewSlug: '',
  }
  return offresDuCatalogue.includes(demande.offre) ? { ...champs, rNewPlan: demande.offre } : champs
}

/**
 * Une invitation d'ouverture attend-elle déjà cette adresse ? C'est le signe
 * que le cabinet a été ouvert depuis la demande — l'écran propose alors de
 * la marquer « Cabinet ouvert ».
 */
export function invitationPourLaDemande(
  demande: Pick<DemandeEssai, 'email'>,
  invitations: Array<{ email: string; role: string }>,
): boolean {
  const adresse = demande.email.trim().toLowerCase()
  return invitations.some((i) => i.role === 'owner' && i.email.trim().toLowerCase() === adresse)
}
