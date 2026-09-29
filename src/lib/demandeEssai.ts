/**
 * Une demande d'essai, déposée depuis la page d'accueil — la part qui se
 * raisonne sans réseau.
 *
 * TROIS GARDES, UNE SEULE RÈGLE. L'écran s'en sert pour dire, champ par
 * champ, ce qui manque ; le serveur pour refuser ce qui n'a pas passé
 * l'écran ; la base (0060, `deposer_demande_essai`) réécrit les mêmes bornes
 * en SQL, parce qu'un formulaire se contourne et une fonction de la base, non.
 * Les longueurs et les listes ci-dessous sont celles de la migration : les
 * changer ici sans elle ferait accepter par l'écran ce que la base refuse.
 *
 * Aucun import d'alias : le serveur lit ce fichier tel quel.
 */

/** Combien de patients la praticienne suit — des fourchettes, pas un chiffre. */
export const FOURCHETTES = [
  { valeur: 'moins-10', libelle: 'Moins de 10' },
  { valeur: '10-25', libelle: 'De 10 à 25' },
  { valeur: '26-80', libelle: 'De 26 à 80' },
  { valeur: 'plus-80', libelle: 'Plus de 80' },
] as const

export type Fourchette = (typeof FOURCHETTES)[number]['valeur']

/** L'offre qui l'intéresse. Les codes sont ceux de la table `plans`. */
export const OFFRES_DEMANDEES = [
  { valeur: 'essentiel', libelle: 'Essentiel' },
  { valeur: 'cabinet', libelle: 'Cabinet' },
  { valeur: 'reseau', libelle: 'Réseau' },
  { valeur: 'a-voir', libelle: 'Je ne sais pas encore' },
] as const

export type OffreDemandee = (typeof OFFRES_DEMANDEES)[number]['valeur']

/** Les bornes, identiques à celles de la base (0060). */
export const BORNES = {
  nom: [2, 120],
  email: [3, 254],
  cabinet: [2, 120],
  ville: [2, 80],
  telephone: [6, 30],
  message: [0, 2000],
} as const

/** Ce que l'écran envoie. Tout arrive en texte, rien n'est encore sûr. */
export interface SaisieDemande {
  nom: string
  email: string
  telephone: string
  cabinet: string
  ville: string
  patients: string
  offre: string
  message: string
  consentement: boolean
}

export type ChampDemande = keyof SaisieDemande

/** Une demande qui a passé toutes les gardes, nettoyée. */
export interface DemandePropre {
  nom: string
  email: string
  telephone: string | null
  cabinet: string
  ville: string
  patients: Fourchette
  offre: OffreDemandee
  message: string | null
  consentement: true
}

export type Verdict =
  | { ok: true; demande: DemandePropre }
  | { ok: false; erreurs: Partial<Record<ChampDemande, string>> }

/** Même motif que la base : quelque chose, une arobase, un domaine avec un point. */
export function adresseValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/** Des chiffres, des espaces, + ( ) . - ; et au moins six chiffres. */
export function telephoneValide(tel: string): boolean {
  return /^[0-9 +().-]{6,30}$/.test(tel) && tel.replace(/\D/g, '').length >= 6
}

/** Un caractère de contrôle n'a rien à faire dans un nom ni dans une ville. */
function sansControle(texte: string): boolean {
  return !/[\u0000-\u001f\u007f]/.test(texte)
}

const propre = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Une saisie vide, pour démarrer le formulaire. */
export const SAISIE_VIDE: SaisieDemande = {
  nom: '',
  email: '',
  telephone: '',
  cabinet: '',
  ville: '',
  patients: '',
  offre: '',
  message: '',
  consentement: false,
}

/**
 * La saisie, relue champ par champ.
 *
 * Accepte n'importe quoi en entrée — le serveur lui passe le corps brut d'une
 * requête — et ne rend une demande que si TOUT est en règle. Les messages
 * disent quoi faire, pas ce qui est faux.
 */
export function validerDemande(brut: unknown): Verdict {
  const s = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>
  const nom = propre(s.nom)
  const email = propre(s.email).toLowerCase()
  const telephone = propre(s.telephone)
  const cabinet = propre(s.cabinet)
  const ville = propre(s.ville)
  const patients = propre(s.patients)
  const offre = propre(s.offre)
  const message = typeof s.message === 'string' ? s.message.trim() : ''
  const erreurs: Partial<Record<ChampDemande, string>> = {}

  const longueur = (v: string, [min, max]: readonly [number, number]) => v.length >= min && v.length <= max

  if (!longueur(nom, BORNES.nom) || !sansControle(nom)) erreurs.nom = 'Indiquez votre prénom et votre nom.'
  if (!longueur(email, BORNES.email) || !adresseValide(email)) {
    erreurs.email = 'Indiquez une adresse électronique complète, par exemple vous@cabinet.fr.'
  }
  if (telephone && (!longueur(telephone, BORNES.telephone) || !telephoneValide(telephone))) {
    erreurs.telephone = 'Ce numéro ne se lit pas : des chiffres, et éventuellement + ( ) . -'
  }
  if (!longueur(cabinet, BORNES.cabinet) || !sansControle(cabinet)) erreurs.cabinet = 'Indiquez le nom de votre cabinet.'
  if (!longueur(ville, BORNES.ville) || !sansControle(ville)) erreurs.ville = 'Indiquez la ville du cabinet.'
  if (!FOURCHETTES.some((f) => f.valeur === patients)) erreurs.patients = 'Choisissez une fourchette.'
  if (!OFFRES_DEMANDEES.some((o) => o.valeur === offre)) erreurs.offre = 'Choisissez une offre, ou « Je ne sais pas encore ».'
  if (message.length > BORNES.message[1]) {
    erreurs.message = `Le message tient en ${BORNES.message[1]} caractères au plus.`
  }
  if (s.consentement !== true) {
    erreurs.consentement = 'Cochez cette case pour que nous puissions vous recontacter.'
  }

  if (Object.keys(erreurs).length) return { ok: false, erreurs }
  return {
    ok: true,
    demande: {
      nom,
      email,
      telephone: telephone || null,
      cabinet,
      ville,
      patients: patients as Fourchette,
      offre: offre as OffreDemandee,
      message: message || null,
      consentement: true,
    },
  }
}

/** Le premier champ en défaut, dans l'ordre du formulaire : c'est là qu'on met le focus. */
export const ORDRE_DES_CHAMPS: ChampDemande[] = [
  'nom',
  'email',
  'telephone',
  'cabinet',
  'ville',
  'patients',
  'offre',
  'message',
  'consentement',
]

export function premierChampEnDefaut(erreurs: Partial<Record<ChampDemande, string>>): ChampDemande | null {
  return ORDRE_DES_CHAMPS.find((c) => erreurs[c]) ?? null
}

/* ------------------------------------------------------------------ *
 * Ce que la base répond, et ce qu'on en dit
 * ------------------------------------------------------------------ */

/**
 * Le motif d'un refus de `deposer_demande_essai` (0060).
 *
 *   champ    un champ n'a pas passé la base (l'écran l'aurait dû arrêter) ;
 *   adresse  trois demandes déjà reçues de cette adresse en 24 heures ;
 *   heure    trop de demandes sur la plateforme dans l'heure ;
 *   fermee   aucun revendeur n'accueille les demandes.
 */
export type MotifRefus = 'champ' | 'adresse' | 'heure' | 'fermee'

/** La phrase et le statut HTTP d'un refus de la base. */
export function reponseAuRefus(motif: string | undefined): { status: number; message: string } {
  switch (motif) {
    case 'adresse':
      return {
        status: 429,
        message:
          'Nous avons déjà bien reçu vos demandes de la journée pour cette adresse : inutile de renvoyer, nous revenons vers vous.',
      }
    case 'heure':
      return {
        status: 429,
        message: 'Beaucoup de demandes nous arrivent en ce moment. Réessayez dans une heure : rien n’a été enregistré.',
      }
    case 'fermee':
      return {
        status: 503,
        message: 'Les demandes ne sont pas ouvertes pour le moment. Réessayez un peu plus tard : rien n’a été enregistré.',
      }
    default:
      return { status: 400, message: 'Un champ n’a pas été accepté. Relisez le formulaire, puis renvoyez-le.' }
  }
}

/** Le message de confirmation : honnête, sans délai promis qu'on ne tiendrait pas. */
export function confirmation(demande: Pick<DemandePropre, 'nom' | 'email'>): string {
  const prenom = demande.nom.split(/\s+/)[0] ?? ''
  return `Merci${prenom ? `, ${prenom}` : ''}. Votre demande est bien arrivée : nous revenons vers vous rapidement, à l’adresse ${demande.email}.`
}
