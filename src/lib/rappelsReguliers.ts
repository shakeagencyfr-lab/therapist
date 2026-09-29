/**
 * Les rappels qui reviennent et le rappel du soir (0055) — la part qui se
 * raisonne sans base ni écran.
 *
 * TOUT SE COMPTE À L'HEURE DE PARIS. C'est celle des cabinets, celle où la
 * base range les jours (0051) et celle où elle écrit les mots du jour. Une
 * thérapeute en déplacement qui programme « chaque lundi à 9 h » veut le
 * 9 h de ses patientes, pas celui de son hôtel : l'écran le lui dit quand
 * son navigateur n'est pas à l'heure de Paris.
 *
 * Les règles d'ici redisent celles de la base (generer_rappels_recurrents,
 * soirs_dus, cabinet_programmer_rappel). La base décide ; l'écran annonce,
 * et refuse avant d'envoyer ce que la base refuserait — avec les mêmes mots.
 *
 * Logique pure, sans import de l'application.
 */
import { decalerJour, jourDeParis } from './assiduite'
import { plural } from './format'

export const JOURS_DE_LA_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const

/** Au-delà, la base refuse : un rappel de santé ne court pas sans fin. */
export const DUREE_MAX_JOURS = 366
/** Quatre semaines : l'écart ordinaire entre deux séances. */
export const DUREE_PAR_DEFAUT_JOURS = 28
export const LIMITE_TEXTE = 1000
export const LIMITE_TITRE = 120
export const HEURE_DU_SOIR_PAR_DEFAUT = '20:30'

/* ------------------------------------------------------------------ *
 * Les heures et les jours
 * ------------------------------------------------------------------ */

/**
 * « HH:MM », ou rien.
 *
 * Un champ d'heure de téléphone rend parfois les secondes (« 20:30:00 »),
 * parfois rien du tout sur une saisie à moitié faite. La base n'accepte que
 * « HH:MM » : on normalise ici, et une heure illisible ne part pas.
 */
export function heureDuChamp(valeur: string | null | undefined): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec((valeur ?? '').trim())
  return m ? `${m[1]}:${m[2]}` : null
}

/** L'heure comme on la dit : « 20 h 30 », « 9 h ». */
export function heureDite(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}

/**
 * « Chaque lundi, 9 h 30 » — le même libellé que la base écrit dans le
 * journal des envois (libelle_rappel_recurrent), pour que la liste des
 * rappels et le journal se reconnaissent.
 */
export function libelleRecurrence(jourSemaine: number | null, heure: string): string {
  const quand = jourSemaine ? `Chaque ${JOURS_DE_LA_SEMAINE[jourSemaine - 1]}` : 'Chaque jour'
  return `${quand}, ${heureDite(heure)}`
}

/** Le jour de la semaine d'un « AAAA-MM-JJ », à la norme ISO : 1 = lundi. */
export function jourIso(jour: string): number {
  const [a, m, j] = jour.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j)).getUTCDay()
  return d === 0 ? 7 : d
}

/** L'heure qu'il est à Paris, « HH:MM ». */
export function heureDeParis(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** « aujourd'hui », « demain », ou « lundi 5 octobre ». */
export function jourDit(jour: string, aujourdhui: string): string {
  if (jour === aujourdhui) return "aujourd'hui"
  if (jour === decalerJour(aujourdhui, 1)) return 'demain'
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** « 26 octobre 2026 » : une date de fin se lit avec son année. */
export function dateDite(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * La précision à ajouter après une heure, quand le navigateur n'est pas à
 * l'heure de Paris : « 9 h » voudrait sinon dire deux choses.
 */
export function mentionFuseau(fuseauDuNavigateur: string | undefined): string {
  return !fuseauDuNavigateur || fuseauDuNavigateur === 'Europe/Paris' ? '' : ' (heure de Paris)'
}

/* ------------------------------------------------------------------ *
 * Les rappels qui reviennent
 * ------------------------------------------------------------------ */

export interface DestinataireRappel {
  id: string
  nom: string
  /** Suivi clos depuis la programmation : il ne reçoit plus rien. */
  clos: boolean
}

export interface RappelRegulier {
  id: string
  titre: string
  texte: string
  /** Vide : chaque jour. Sinon 1 = lundi … 7 = dimanche. */
  jourSemaine: number | null
  /** « HH:MM », heure de Paris. */
  heure: string
  /** Dernier jour inclus, « AAAA-MM-JJ ». */
  finLe: string
  creeLe: string
  annuleLe: string | null
  destinataires: DestinataireRappel[]
}

/** Une ligne de `rappels_recurrents`, avec ses destinataires, telle que l'API la rend. */
export interface LigneRappel {
  id: string
  title: string
  body: string
  jour_semaine: number | null
  heure: string
  fin_le: string
  created_at: string
  annule_le: string | null
  destinataires?: Array<{
    patient_id: string
    patient: { display_name: string | null; archived_at: string | null } | null
  }> | null
}

/**
 * Les rappels du cabinet, à la forme que l'écran lit.
 *
 * Une ligne à l'heure illisible est écartée plutôt qu'affichée « 00 h » :
 * la contrainte de la base l'interdit, et un rappel faux à l'écran ferait
 * croire à un envoi qui n'aura pas lieu à cette heure-là.
 */
export function rappelsDepuisLignes(lignes: LigneRappel[] | null | undefined): RappelRegulier[] {
  return (lignes ?? []).flatMap((l) => {
    const heure = heureDuChamp(l.heure)
    if (!heure) return []
    return [
      {
        id: l.id,
        titre: l.title,
        texte: l.body,
        jourSemaine: l.jour_semaine ?? null,
        heure,
        finLe: l.fin_le,
        creeLe: l.created_at,
        annuleLe: l.annule_le,
        destinataires: (l.destinataires ?? [])
          .map((d) => ({
            id: d.patient_id,
            nom: d.patient?.display_name?.trim() || 'Fiche sans nom',
            clos: Boolean(d.patient?.archived_at),
          }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      },
    ]
  })
}

export type EtatRappel = 'en-cours' | 'termine' | 'arrete'

type Planification = Pick<RappelRegulier, 'jourSemaine' | 'heure' | 'finLe' | 'annuleLe'>

/**
 * Le prochain jour d'envoi, ou `null` s'il n'y en aura plus.
 *
 * Aujourd'hui compte si l'heure n'est pas encore passée — c'est aussi la
 * règle de la base pour un rappel qu'on vient de programmer : « chaque jour
 * à 9 h » programmé à 9 h 10 part demain. Rien après la date de fin, rien
 * une fois arrêté.
 */
export function prochainEnvoi(r: Planification, maintenant: Date = new Date()): string | null {
  if (r.annuleLe) return null
  const aujourdhui = jourDeParis(maintenant)
  const heure = heureDeParis(maintenant)
  for (let i = 0; i <= 7; i += 1) {
    const jour = decalerJour(aujourdhui, i)
    if (jour > r.finLe) return null
    if (i === 0 && r.heure <= heure) continue
    if (r.jourSemaine && jourIso(jour) !== r.jourSemaine) continue
    return jour
  }
  return null
}

export function etatRappel(r: Planification, maintenant: Date = new Date()): EtatRappel {
  if (r.annuleLe) return 'arrete'
  return prochainEnvoi(r, maintenant) ? 'en-cours' : 'termine'
}

/** « Prochain envoi : demain, 9 h 30 », ou ce qui en tient lieu. */
export function phraseProchainEnvoi(r: RappelRegulier, maintenant: Date = new Date()): string {
  const etat = etatRappel(r, maintenant)
  if (etat === 'arrete') return 'Arrêté : il ne partira plus.'
  if (etat === 'termine') return `Terminé le ${dateDite(r.finLe)}.`
  if (!r.destinataires.some((d) => !d.clos)) {
    return "Plus personne à qui l'envoyer : les suivis choisis sont clos."
  }
  const jour = prochainEnvoi(r, maintenant) as string
  return `Prochain envoi : ${jourDit(jour, jourDeParis(maintenant))}, ${heureDite(r.heure)}. Jusqu'au ${dateDite(r.finLe)}.`
}

/** « Anna, Bea et 2 autres » — et le suivi clos, dit comme tel. */
export function phraseDestinataires(destinataires: DestinataireRappel[], montres = 3): string {
  const actifs = destinataires.filter((d) => !d.clos).map((d) => d.nom)
  const clos = destinataires.length - actifs.length
  const debut = actifs.slice(0, montres).join(', ')
  const reste = actifs.length - montres
  const noms = reste > 0 ? `${debut} et ${plural(reste, 'autre', 'autres')}` : debut
  const fin = clos ? ` (${plural(clos, 'suivi clos', 'suivis clos')}, sans envoi)` : ''
  return `${noms || 'Personne'}${fin}`
}

/** Les rappels du cabinet, dans l'ordre où l'on veut les lire : en cours d'abord. */
export function rappelsOrdonnes(rappels: RappelRegulier[], maintenant: Date = new Date()): RappelRegulier[] {
  const rang = { 'en-cours': 0, termine: 1, arrete: 2 } as const
  return rappels
    .map((r) => ({ r, etat: etatRappel(r, maintenant), prochain: prochainEnvoi(r, maintenant) ?? '9999' }))
    .sort((a, b) => rang[a.etat] - rang[b.etat] || (a.prochain + a.r.heure).localeCompare(b.prochain + b.r.heure))
    .map((x) => x.r)
}

/* ------------------------------------------------------------------ *
 * La saisie
 * ------------------------------------------------------------------ */

export interface SaisieRappel {
  titre: string
  texte: string
  frequence: 'jour' | 'semaine'
  /** 1 = lundi. Lu seulement pour « chaque semaine ». */
  jourSemaine: number
  heure: string
  finLe: string
  patients: string[]
}

/** La date de fin proposée : quatre semaines, l'écart ordinaire entre deux séances. */
export function finParDefaut(maintenant: Date = new Date()): string {
  return decalerJour(jourDeParis(maintenant), DUREE_PAR_DEFAUT_JOURS)
}

/** La date la plus lointaine que la base accepte. */
export function finMaximale(maintenant: Date = new Date()): string {
  return decalerJour(jourDeParis(maintenant), DUREE_MAX_JOURS)
}

const longueur = (texte: string) => Array.from(texte.trim()).length

/**
 * Ce qui empêche de programmer, dit comme la base le dirait — ou `null`.
 *
 * Un cas de plus que la base : un rappel qui n'enverrait RIEN (fin
 * aujourd'hui et heure passée, « chaque lundi » qui s'arrête un dimanche).
 * La base l'accepterait, et la thérapeute croirait un rappel en route.
 */
export function refusRappel(s: SaisieRappel, maintenant: Date = new Date()): string | null {
  const aujourdhui = jourDeParis(maintenant)
  if (!s.texte.trim()) return 'Écrivez le mot qui partira.'
  if (longueur(s.texte) > LIMITE_TEXTE) return "Le mot dépasse 1 000 caractères : un rappel se lit d'un coup d'œil."
  if (longueur(s.titre) > LIMITE_TITRE) return 'Le titre dépasse 120 caractères.'
  const heure = heureDuChamp(s.heure)
  if (!heure) return "Choisissez une heure d'envoi."
  if (s.frequence === 'semaine' && !(Number.isInteger(s.jourSemaine) && s.jourSemaine >= 1 && s.jourSemaine <= 7)) {
    return 'Choisissez le jour de la semaine.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.finLe)) return 'Choisissez une date de fin.'
  if (s.finLe < aujourdhui) return "La date de fin est déjà passée : choisissez aujourd'hui ou plus tard."
  if (s.finLe > decalerJour(aujourdhui, DUREE_MAX_JOURS)) {
    return 'Un rappel récurrent court un an au plus : choisissez une date de fin plus proche.'
  }
  if (!s.patients.length) return 'Choisissez au moins une personne.'
  const premier = prochainEnvoi(
    { jourSemaine: s.frequence === 'semaine' ? s.jourSemaine : null, heure, finLe: s.finLe, annuleLe: null },
    maintenant,
  )
  if (!premier) return "Aucun envoi n'aurait lieu avant la date de fin : repoussez-la, ou changez le jour ou l'heure."
  return null
}

/** « Premier envoi : demain, 9 h » — ce que la thérapeute lit avant de valider. */
export function phrasePremierEnvoi(s: SaisieRappel, maintenant: Date = new Date()): string {
  const heure = heureDuChamp(s.heure)
  if (!heure) return ''
  const premier = prochainEnvoi(
    { jourSemaine: s.frequence === 'semaine' ? s.jourSemaine : null, heure, finLe: s.finLe, annuleLe: null },
    maintenant,
  )
  if (!premier) return ''
  return `Premier envoi : ${jourDit(premier, jourDeParis(maintenant))}, ${heureDite(heure)}.`
}

/** Les phrases de la base qu'on montre telles quelles : elles sont écrites pour l'écran. */
const REFUS_DE_LA_BASE = [
  'Écrivez le mot',
  'Le mot dépasse',
  'Le titre dépasse',
  'Jour de la semaine',
  "Choisissez une heure d'envoi",
  'La date de fin',
  'Un rappel récurrent court',
  'Choisissez au moins une personne',
  'Une des fiches choisies',
  "Ce cabinet n'est pas le vôtre",
]

/**
 * Ce que l'écran dit d'un refus de la base.
 *
 * Ses propres phrases passent ; le reste (réseau, panne) devient une phrase
 * qui dit quoi faire. Une base où 0055 n'est pas encore passée le dit aussi,
 * plutôt qu'un « réessayez » qui ne marcherait jamais.
 */
export function messageRefusRappel(message: string | null | undefined): string {
  const brut = message ?? ''
  if (REFUS_DE_LA_BASE.some((debut) => brut.startsWith(debut))) return brut
  if (/cabinet_programmer_rappel|cabinet_arreter_rappel|rappels_recurrents|schema cache|does not exist/i.test(brut)) {
    return "Les rappels réguliers ne sont pas encore ouverts sur ce cabinet : la mise à jour de la base est attendue."
  }
  return "Le rappel n'a pas pu être enregistré. Réessayez dans un instant."
}

/* ------------------------------------------------------------------ *
 * Le rappel du soir, côté patient
 * ------------------------------------------------------------------ */

/** Ses réglages de rappel, tels que l'écran les tient. */
export interface PreferencesRappels {
  masquerContenu: boolean
  soirActif: boolean
  /** « HH:MM », heure de Paris. */
  soirHeure: string
}

/**
 * Les réglages lus en base (patient_preferences_rappels), ou `null`.
 *
 * `null` N'EST PAS « PAR DÉFAUT ». La base rend une ligne — valeurs par
 * défaut comprises — pour la fiche de la personne connectée, et aucune pour
 * une autre : une réponse vide est un refus, que l'écran dit comme tel,
 * plutôt que d'afficher « masqué » sur la foi d'une lecture ratée. Et un
 * `masquer_contenu` illisible vaut masqué : c'est le côté sûr.
 */
export function preferencesDepuisLigne(donnees: unknown): PreferencesRappels | null {
  const ligne = Array.isArray(donnees) ? donnees[0] : donnees
  if (!ligne || typeof ligne !== 'object') return null
  const l = ligne as { masquer_contenu?: unknown; soir_actif?: unknown; soir_heure?: unknown }
  return {
    masquerContenu: l.masquer_contenu !== false,
    soirActif: l.soir_actif === true,
    soirHeure: heureDuChamp(typeof l.soir_heure === 'string' ? l.soir_heure : '') ?? HEURE_DU_SOIR_PAR_DEFAUT,
  }
}

/**
 * Quand arrive le premier rappel du soir, une fois réglé.
 *
 * La base ne fait pas sonner un soir dont l'heure est déjà passée au moment
 * du réglage (soirs_dus) : l'avancer de 21 h à 20 h à 20 h 30 ne réveille pas
 * le téléphone dans la minute. L'écran le dit.
 */
export function phrasePremierSoir(heure: string, maintenant: Date = new Date()): string {
  const h = heureDuChamp(heure)
  if (!h) return ''
  const quand = h > heureDeParis(maintenant) ? "aujourd'hui" : 'demain'
  return `Premier rappel ${quand} à ${heureDite(h)}, sauf si votre note est déjà prise.`
}
