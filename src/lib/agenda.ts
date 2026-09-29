/**
 * La prochaine séance, datée (0059) — la part qui se raisonne sans base ni
 * écran.
 *
 * La prochaine séance était un texte libre : « Jeudi 10 septembre, 14 h ».
 * Il se lisait, mais rien ne s'en déduisait — ni l'ordre de la liste, ni les
 * séances du jour, ni le rappel de la veille. Elle devient un instant
 * (`patients.next_session_at`), choisi à l'heure de Paris ; le texte reste en
 * repli pour les fiches d'avant, jusqu'à ce qu'on les date.
 *
 * TOUT SE COMPTE À L'HEURE DE PARIS, comme les rappels (0055) : c'est celle
 * des cabinets et celle où la base écrit le rappel de la veille. Une
 * praticienne en déplacement qui fixe « 14 h » fixe le 14 h de son patient.
 *
 * Les règles du rappel redisent celles de la base (`rappeler_la_veille()`,
 * 0059) : la base décide, l'écran annonce — avec les mêmes mots.
 *
 * Logique pure, sans import de l'application.
 */
import { decalerJour, jourDeParis } from './assiduite'
import { heureDeParis, heureDite, heureDuChamp, jourDit } from './rappelsReguliers'

export const FUSEAU_DES_SEANCES = 'Europe/Paris'
/** L'heure du rappel, la veille : en fin de journée, quand on regarde demain. */
export const HEURE_DU_RAPPEL = '18:00'
/** Ce que la base écrit, mot pour mot (0059) : l'heure s'y ajoute, puis un point. */
export const DEBUT_DU_RAPPEL = 'Votre séance est demain à '
export const TITRE_DU_RAPPEL = 'À demain'
/** Au-delà, la saisie est sans doute une faute de frappe sur l'année. */
export const HORIZON_JOURS = 366
/** Le libellé que les écrans affichent faute de séance. */
export const SANS_SEANCE = 'Aucune séance planifiée'

/* ------------------------------------------------------------------ *
 * Les instants
 * ------------------------------------------------------------------ */

const PARTIES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_DES_SEANCES,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** L'écart de Paris sur UTC à cet instant, en millisecondes (une ou deux heures). */
function ecartDeParis(instant: number): number {
  const p = Object.fromEntries(PARTIES.formatToParts(new Date(instant)).map((x) => [x.type, x.value]))
  const commeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return commeUtc - Math.floor(instant / 1000) * 1000
}

/** Un « AAAA-MM-JJ » qui existe au calendrier (pas de 31 septembre). */
export function jourValide(jour: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).toISOString().slice(0, 10) === jour
}

/**
 * L'instant d'un jour et d'une heure de Paris.
 *
 * Calculé par l'écart réel de Paris ce jour-là, relu une seconde fois à
 * l'instant trouvé : c'est ce qui tient les deux changements d'heure — le
 * 14 h d'un mardi de novembre n'est pas à la même distance d'UTC que celui
 * d'un mardi de juillet. `null` sur une saisie incomplète ou impossible.
 */
export function instantDeParis(jour: string, heure: string): Date | null {
  const hhmm = heureDuChamp(heure)
  if (!jourValide(jour) || !hhmm) return null
  const [a, m, j] = jour.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const naif = Date.UTC(a, m - 1, j, h, mi)
  let t = naif - ecartDeParis(naif)
  const reprise = ecartDeParis(t)
  if (reprise !== ecartDeParis(naif)) t = naif - reprise
  return new Date(t)
}

/** Le jour et l'heure de Paris d'un instant enregistré, pour préremplir les champs. */
export function jourEtHeure(iso: string | null | undefined): { jour: string; heure: string } {
  if (!iso) return { jour: '', heure: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { jour: '', heure: '' }
  return { jour: jourDeParis(d), heure: heureDeParis(d) }
}

/** Première lettre en capitale : « Demain, 14 h » en tête de ligne. */
export function capitale(texte: string): string {
  return texte ? texte[0].toUpperCase() + texte.slice(1) : texte
}

/**
 * « mardi 6 octobre, 14 h 30 » — ce que la fiche affiche.
 *
 * Absolu, jamais « demain » : ce libellé vit dans l'état du cabinet, qui peut
 * rester ouvert d'un jour sur l'autre. L'année ne s'écrit que si ce n'est pas
 * celle en cours.
 */
export function libelleSeance(iso: string, maintenant: Date = new Date()): string {
  const { jour, heure } = jourEtHeure(iso)
  if (!jour) return ''
  const [a, m, j] = jour.split('-').map(Number)
  const date = new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: jour.slice(0, 4) === jourDeParis(maintenant).slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  })
  return `${date}, ${heureDite(heure)}`
}

/**
 * « aujourd'hui, 14 h 30 », « demain, 9 h », « mardi 6 octobre, 14 h 30 » —
 * ce que lit le patient, qui relit son espace à chaque retour.
 */
export function libelleSeanceProche(iso: string, maintenant: Date = new Date()): string {
  const { jour, heure } = jourEtHeure(iso)
  if (!jour) return ''
  const aujourdhui = jourDeParis(maintenant)
  if (jour === aujourdhui || jour === decalerJour(aujourdhui, 1)) {
    return `${jourDit(jour, aujourdhui)}, ${heureDite(heure)}`
  }
  return libelleSeance(iso, maintenant)
}

/* ------------------------------------------------------------------ *
 * La prochaine séance d'une fiche
 * ------------------------------------------------------------------ */

/** Ce qu'une fiche porte : l'instant daté, le texte libre d'avant. */
export interface SeanceDeFiche {
  /** `undefined` : fiche de démonstration, qui n'a que du texte. */
  prochaineSeanceLe?: string | null
  nextSession: string
}

/** La séance datée est-elle encore à venir — ou aujourd'hui même ? */
export function seanceAVenir(iso: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t >= maintenant.getTime()
}

/**
 * Le libellé « prochaine séance » que la fiche porte dans l'état du cabinet.
 *
 * Une séance datée du jour reste affichée jusqu'au soir — c'est le jour où
 * on la cherche. Passée la veille, elle n'est plus « prochaine » : la fiche
 * dit qu'il n'y a rien de planifié, et le texte d'avant, s'il en reste un, ne
 * reprend pas la main (il est forcément plus ancien que la date).
 */
export function libelleProchaineSeance(
  iso: string | null | undefined,
  texte: string | null | undefined,
  maintenant: Date = new Date(),
): string {
  if (iso) {
    return jourEtHeure(iso).jour >= jourDeParis(maintenant)
      ? capitale(libelleSeance(iso, maintenant))
      : SANS_SEANCE
  }
  return texte?.trim() || SANS_SEANCE
}

/**
 * « Prochaine séance : demain, 14 h 30 » — le fait que l'en-tête de la fiche
 * affiche à côté du programme. Seule, une date ne dit pas de quoi elle est
 * la date. Calculé au rendu : « demain » y reste juste d'un jour sur l'autre.
 * Sans séance datée à venir, le libellé que la fiche porte déjà.
 */
export function libelleEnTete(fiche: SeanceDeFiche, maintenant: Date = new Date()): string {
  if (fiche.prochaineSeanceLe && jourEtHeure(fiche.prochaineSeanceLe).jour >= jourDeParis(maintenant)) {
    return `Prochaine séance : ${libelleSeanceProche(fiche.prochaineSeanceLe, maintenant)}`
  }
  return fiche.nextSession
}

/**
 * Ce que « Ma journée » montre au patient : la séance datée si elle vient,
 * sinon le texte d'avant — `null` quand il n'y a rien à dire.
 */
export function seancePourLePatient(
  iso: string | null | undefined,
  texte: string | null | undefined,
  maintenant: Date = new Date(),
): string | null {
  if (iso) {
    return jourEtHeure(iso).jour >= jourDeParis(maintenant) ? capitale(libelleSeanceProche(iso, maintenant)) : null
  }
  return texte?.trim() || null
}

/**
 * La fiche est-elle « sans prochaine séance » ?
 *
 * SUR LA VRAIE DATE. Une fiche réelle n'a de prochaine séance que datée et à
 * venir : un texte libre d'avant ne se classe pas, et c'est justement la
 * fiche à dater. Une séance du matin est passée l'après-midi : la suivante
 * reste à fixer. Les fiches de démonstration, qui n'ont que du texte, se
 * lisent sur leur texte.
 */
export function sansProchaineSeance(fiche: SeanceDeFiche, maintenant: Date = new Date()): boolean {
  if (fiche.prochaineSeanceLe === undefined) return fiche.nextSession.startsWith('Aucune')
  return !seanceAVenir(fiche.prochaineSeanceLe, maintenant)
}

/**
 * La liste rangée par prochaine séance : la plus proche d'abord, puis les
 * fiches sans séance à venir, dans leur ordre d'arrivée.
 */
export function parProchaineSeance<T extends { prochaineSeanceLe?: string | null }>(
  fiches: readonly T[],
  maintenant: Date = new Date(),
): T[] {
  const cle = (f: T) =>
    seanceAVenir(f.prochaineSeanceLe, maintenant) ? new Date(f.prochaineSeanceLe as string).getTime() : Infinity
  // Le tri est stable : à égalité (sans séance), l'ordre d'arrivée demeure.
  return [...fiches].sort((a, b) => {
    const ka = cle(a)
    const kb = cle(b)
    return ka === kb ? 0 : ka < kb ? -1 : 1
  })
}

/** Une séance du jour, telle que la liste « Aujourd'hui » la montre. */
export interface SeanceDuJour {
  id: string
  nom: string
  /** « 14 h 30 » */
  heure: string
  /** Déjà commencée : elle reste dans la liste, en retrait. */
  passee: boolean
}

/** Les séances du jour de Paris, dans l'ordre de l'horloge. */
export function seancesDuJour(
  fiches: ReadonlyArray<{ id: string; nom: string; prochaineSeanceLe?: string | null }>,
  maintenant: Date = new Date(),
): SeanceDuJour[] {
  const aujourdhui = jourDeParis(maintenant)
  return fiches
    .filter((f) => f.prochaineSeanceLe && jourEtHeure(f.prochaineSeanceLe).jour === aujourdhui)
    .map((f) => ({ f, t: new Date(f.prochaineSeanceLe as string).getTime() }))
    .sort((a, b) => a.t - b.t)
    .map(({ f, t }) => ({
      id: f.id,
      nom: f.nom,
      heure: heureDite(jourEtHeure(f.prochaineSeanceLe).heure),
      passee: t < maintenant.getTime(),
    }))
}

/* ------------------------------------------------------------------ *
 * Le rappel de la veille
 * ------------------------------------------------------------------ */

/** Le mot que la base écrit : « Votre séance est demain à 14 h 30. » */
export function texteDuRappel(iso: string): string {
  return `${DEBUT_DU_RAPPEL}${heureDite(jourEtHeure(iso).heure)}.`
}

/** L'instant du rappel : la veille de la séance, 18 h à Paris. */
export function momentDuRappel(iso: string): Date | null {
  const { jour } = jourEtHeure(iso)
  return jour ? instantDeParis(decalerJour(jour, -1), HEURE_DU_RAPPEL) : null
}

export type EtatRappelVeille = 'sans-seance' | 'clos' | 'passee' | 'prevu' | 'trop-tard'

export function etatRappelVeille(
  iso: string | null | undefined,
  clos: boolean,
  maintenant: Date = new Date(),
): EtatRappelVeille {
  if (!iso) return 'sans-seance'
  if (clos) return 'clos'
  if (!seanceAVenir(iso, maintenant)) return 'passee'
  const moment = momentDuRappel(iso)
  return moment && moment.getTime() > maintenant.getTime() ? 'prevu' : 'trop-tard'
}

/**
 * Ce que la fiche annonce sous la date choisie — la règle de la base, dite.
 */
export function phraseRappelVeille(iso: string | null | undefined, clos: boolean, maintenant: Date = new Date()): string {
  const etat = etatRappelVeille(iso, clos, maintenant)
  switch (etat) {
    case 'sans-seance':
      return 'Datez la séance : la veille à 18 h, un rappel partira dans son espace.'
    case 'clos':
      return 'Suivi clos : aucun rappel ne part.'
    case 'passee':
      return 'Cette séance est passée : fixez la suivante.'
    case 'trop-tard':
      return 'La veille à 18 h est déjà passée : pas de rappel automatique pour cette séance.'
    case 'prevu': {
      const veille = jourDeParis(momentDuRappel(iso as string) as Date)
      return `Rappel ${jourDit(veille, jourDeParis(maintenant))} à 18 h : « ${texteDuRappel(iso as string)} »`
    }
  }
}

/* ------------------------------------------------------------------ *
 * La saisie
 * ------------------------------------------------------------------ */

/** Ce qui empêche d'enregistrer la date — ou `null`. */
export function refusSeance(
  jour: string,
  heure: string,
  /** L'instant déjà enregistré : une date passée qu'on ne touche pas ne bloque rien. */
  enregistree: string | null | undefined,
  maintenant: Date = new Date(),
): string | null {
  if (!jour && !heure) return null
  if (!jour) return 'Choisissez aussi le jour de la séance.'
  if (!heure) return "Choisissez aussi l'heure de la séance."
  const instant = instantDeParis(jour, heure)
  if (!instant) return 'Date ou heure illisible : choisissez-les à nouveau.'
  if (enregistree && new Date(enregistree).getTime() === instant.getTime()) return null
  if (instant.getTime() < maintenant.getTime()) {
    return 'Cette date est déjà passée : choisissez un moment à venir, ou effacez-la.'
  }
  if (jour > decalerJour(jourDeParis(maintenant), HORIZON_JOURS)) {
    return "Cette date est à plus d'un an : vérifiez l'année."
  }
  return null
}
