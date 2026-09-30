/**
 * Le contrat d'un cabinet, tel que les écrans le disent.
 *
 * Deux espaces parlent du même contrat — le portefeuille et l'écran Offres du
 * revendeur, le bandeau de la thérapeute — et chacun en faisait sa phrase.
 * L'un affichait « Essai jusqu'au 15 septembre » sous un contrat actif,
 * l'autre la même pastille grise pour un essai qui court et un essai fini,
 * le troisième « Essai · échéance — » parce qu'il lisait la fin de période
 * au lieu de la fin d'essai. Les phrases sont donc écrites ici, une fois.
 *
 * La règle, elle, vit en base (`abonnement_en_regle`, 0035) : ce module ne
 * décide jamais si un contrat court, il reçoit le verdict et le dit.
 */
import { dateLongue, euroCents, plural } from './format'
import type { SubscriptionStatus } from '@/types/reseller'

export const JOUR_MS = 86_400_000

/** On prévient la dernière semaine : assez pour s'organiser, pas assez pour lasser. */
export const PREAVIS_ESSAI_JOURS = 7

/** Ce qu'il faut d'un contrat pour en parler. */
export interface ContratDit {
  /** Le code de l'offre ; vide quand le cabinet n'a aucun contrat. */
  plan: string
  status: SubscriptionStatus
  /** Le verdict de la base. */
  enRegle: boolean
  /** Fin d'essai, en ISO. */
  trialEndsAt: string | null
  /** Fin de période payée, en ISO. */
  periodEndAt: string | null
}

const LIBELLES: Record<SubscriptionStatus, string> = {
  essai: 'Essai',
  actif: 'Actif',
  impaye: 'Impayé',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
}

/** Ce que la suspension ferme — la même liste partout où on la dit. */
export const CE_QUI_EST_SUSPENDU =
  "l'analyse, la boutique, la marque blanche, le site vitrine, et l'ouverture ou la réouverture de fiches"

/**
 * Jours entiers qui restent avant `fin`, comptés au-dessus : il reste « un
 * jour » jusqu'à la dernière minute. null : pas de date, ou date passée.
 */
export function joursRestants(fin: string | null | undefined, maintenant: number = Date.now()): number | null {
  if (!fin) return null
  const t = Date.parse(fin)
  if (!Number.isFinite(t) || t <= maintenant) return null
  return Math.ceil((t - maintenant) / JOUR_MS)
}

/**
 * Un essai qui court et finit dans la semaine : le nombre de jours qui
 * restent. null dans tous les autres cas — contrat actif, essai déjà fini,
 * ou fin encore lointaine.
 */
export function essaiBientotFini(
  contrat: { statut: string; enRegle: boolean; finEssai: string | null },
  maintenant: number = Date.now(),
  seuil: number = PREAVIS_ESSAI_JOURS,
): number | null {
  if (contrat.statut !== 'essai' || !contrat.enRegle) return null
  const jours = joursRestants(contrat.finEssai, maintenant)
  return jours !== null && jours <= seuil ? jours : null
}

/** « Il vous reste 3 jours d'essai : il prend fin le 1 octobre 2026. » */
export function phraseEssaiRestant(jours: number, fin: string | null): string {
  const quand = fin ? ` : il prend fin le ${dateLongue(fin)}` : ''
  if (jours <= 1) return `C'est le dernier jour de votre période d'essai${quand}.`
  return `Il vous reste ${plural(jours, "jour d'essai", "jours d'essai")}${quand}.`
}

/** La pastille : « Essai expiré » n'est pas « Essai », et un cabinet sans contrat n'est ni l'un ni l'autre. */
export function libelleContrat(c: Pick<ContratDit, 'plan' | 'status' | 'enRegle'>): string {
  if (!c.plan) return 'Sans contrat'
  if (c.status === 'essai' && !c.enRegle) return 'Essai expiré'
  return LIBELLES[c.status]
}

/** Le ton de la pastille : tout ce qui est hors contrat alerte, l'essai qui court reste neutre. */
export function tonContrat(c: Pick<ContratDit, 'status' | 'enRegle'>): 'ok' | 'neutral' | 'warn' {
  if (!c.enRegle) return 'warn'
  return c.status === 'actif' ? 'ok' : 'neutral'
}

/** La note sous les puces du contrat, dans l'écran Offres. */
export function noteDuContrat(c: ContratDit): string {
  if (!c.plan) return "Aucun contrat : posez une offre à ce cabinet pour ouvrir ses leviers."
  const suspendu = `Hors contrat : ${CE_QUI_EST_SUSPENDU} sont suspendus. Les dossiers restent entiers.`
  if (c.status === 'essai') {
    if (c.enRegle) {
      return c.trialEndsAt
        ? `Essai en cours jusqu'au ${dateLongue(c.trialEndsAt)} : l'offre s'applique.`
        : "Essai en cours : l'offre s'applique."
    }
    return c.trialEndsAt ? `Essai expiré le ${dateLongue(c.trialEndsAt)}. ${suspendu}` : `Essai expiré. ${suspendu}`
  }
  if (!c.enRegle) return suspendu
  return c.periodEndAt
    ? `Le contrat court : l'offre s'applique. Prochaine échéance le ${dateLongue(c.periodEndAt)}.`
    : "Le contrat court : l'offre s'applique."
}

/** La date qui compte pour ce contrat : la fin d'essai pour un essai, l'échéance sinon. */
export function dateDuContrat(c: Pick<ContratDit, 'status' | 'trialEndsAt' | 'periodEndAt'>): string {
  if (c.status === 'essai') return c.trialEndsAt ? `Fin d'essai le ${dateLongue(c.trialEndsAt)}` : '—'
  return c.periodEndAt ? `Échéance le ${dateLongue(c.periodEndAt)}` : '—'
}

/** Ce qu'on lit d'un contrat en défaut, dans « À traiter ». */
export function motifATraiter(c: ContratDit): string {
  if (!c.plan) return 'Sans contrat'
  if (c.status === 'essai') return c.trialEndsAt ? `Essai expiré le ${dateLongue(c.trialEndsAt)}` : 'Essai expiré'
  return c.periodEndAt ? `${LIBELLES[c.status]} · échéance ${dateLongue(c.periodEndAt)}` : LIBELLES[c.status]
}

/** Les essais qui finissent dans la semaine, les plus proches d'abord. */
export function essaisQuiFinissent<T extends { subscription: ContratDit }>(
  rows: T[],
  maintenant: number = Date.now(),
  seuil: number = PREAVIS_ESSAI_JOURS,
): Array<{ row: T; jours: number }> {
  return rows
    .map((row) => ({
      row,
      jours: row.subscription.plan
        ? essaiBientotFini(
            { statut: row.subscription.status, enRegle: row.subscription.enRegle, finEssai: row.subscription.trialEndsAt },
            maintenant,
            seuil,
          )
        : null,
    }))
    .filter((x): x is { row: T; jours: number } => x.jours !== null)
    .sort((a, b) => a.jours - b.jours)
}

/* ---- Les dates saisies ------------------------------------------------- */

function deux(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Une date de base, à la forme d'un champ date — « 2026-10-12 », en heure locale. */
export function versChampDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/**
 * Le champ date, à la forme de la base : la FIN de ce jour-là, en heure
 * locale. Un essai « jusqu'au 12 octobre » court donc tout le 12 — le poser
 * à minuit l'aurait fermé le matin même du jour annoncé.
 */
export function depuisChampDate(valeur: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)
  if (d.getMonth() !== Number(m[2]) - 1) return null
  return d.toISOString()
}

/** La fin d'essai proposée quand on (re)met un cabinet en essai : celle qui court encore, sinon quatorze jours. */
export function finEssaiProposee(trialEndsAt: string | null, maintenant: number = Date.now()): string {
  const t = trialEndsAt ? Date.parse(trialEndsAt) : NaN
  return versChampDate(new Date(Number.isFinite(t) && t > maintenant ? t : maintenant + 14 * JOUR_MS).toISOString())
}

/* ---- Le journal -------------------------------------------------------- */

/** Une ligne de `journal_des_contrats()`. */
export interface EntreeJournal {
  quand: string
  action: string
  cabinetId: string | null
  cabinet: string | null
  meta: Record<string, unknown>
  auteur: 'vous' | 'equipe' | 'plateforme'
}

/** Qui a fait le geste, sans nommer personne. */
export function auteurDit(auteur: EntreeJournal['auteur']): string {
  if (auteur === 'vous') return 'par vous'
  if (auteur === 'equipe') return 'par votre équipe'
  return 'par la plateforme'
}

function statutDit(v: unknown): string {
  return typeof v === 'string' && v in LIBELLES ? LIBELLES[v as SubscriptionStatus].toLowerCase() : 'aucun'
}

function dateDite(v: unknown): string {
  return typeof v === 'string' && v ? dateLongue(v) : 'aucune'
}

function paire(meta: Record<string, unknown>): { avant: unknown; apres: unknown } {
  return { avant: meta.avant ?? null, apres: meta.apres ?? null }
}

/** Les leviers, avec leur genre : « la boutique ouverte », « le site ouvert ». */
const LEVIERS_DITS: Record<string, { nom: string; feminin: boolean }> = {
  shop: { nom: 'boutique', feminin: true },
  marque_blanche: { nom: 'marque blanche', feminin: true },
  site: { nom: 'site vitrine', feminin: false },
  // 0065 : l'exception d'hypnose, et l'hypnose comprise dans une offre.
  hypnose: { nom: 'hypnose', feminin: true },
  hypnose_incluse: { nom: 'hypnose', feminin: true },
}

/** « 800 jetons par mois ». */
function forfaitDit(valeur: unknown): string {
  return `${plural(Number(valeur ?? 0), 'jeton', 'jetons')} par mois`
}

function exceptionDite(champ: string, valeur: unknown): string {
  if (champ === 'max_patients') return valeur === null ? "selon l'offre" : plural(Number(valeur), 'fiche', 'fiches')
  if (champ === 'jetons_mois') return valeur === null ? "selon l'offre" : forfaitDit(valeur)
  const f = LEVIERS_DITS[champ]?.feminin ?? false
  if (valeur === null) return "selon l'offre"
  return valeur ? (f ? 'ouverte' : 'ouvert') : f ? 'fermée' : 'fermé'
}

function reglageDit(champ: string, valeur: unknown): string {
  if (champ === 'price_cents') return typeof valeur === 'number' ? euroCents(valeur) : '—'
  if (champ === 'max_patients') return valeur === null ? 'sans limite' : plural(Number(valeur), 'fiche', 'fiches')
  if (champ === 'label') return `« ${String(valeur ?? '')} »`
  if (champ === 'jetons_mois') return forfaitDit(valeur)
  const f = LEVIERS_DITS[champ]?.feminin ?? false
  return valeur ? (f ? 'comprise' : 'compris') : f ? 'non comprise' : 'non compris'
}

const NOMS_REGLAGES: Record<string, string> = {
  label: 'nom',
  price_cents: 'prix',
  max_patients: 'plafond',
  shop: 'boutique',
  marque_blanche: 'marque blanche',
  site: 'site vitrine',
  jetons_mois: 'forfait',
  hypnose_incluse: 'hypnose',
}

/**
 * La ligne du journal, en français.
 *
 * `nomOffre` traduit un code d'offre en son nom : le journal garde le code,
 * qui ne change pas, et l'écran dit le nom d'aujourd'hui.
 */
export function phraseDuJournal(e: EntreeJournal, nomOffre: (code: string) => string): string {
  const qui = e.cabinet ?? 'Un cabinet'
  const m = e.meta
  const offre = (v: unknown) => (typeof v === 'string' && v ? nomOffre(v) : 'aucune')
  switch (e.action) {
    case 'contrat.pose': {
      const fin = typeof m.fin_essai === 'string' && m.fin_essai ? `, jusqu'au ${dateLongue(m.fin_essai)}` : ''
      return `${qui} : contrat posé, offre ${offre(m.offre)}, ${statutDit(m.statut)}${m.statut === 'essai' ? fin : ''}.`
    }
    case 'contrat.offre': {
      const { avant, apres } = paire(m)
      return `${qui} : offre ${offre(avant)} → ${offre(apres)}.`
    }
    case 'contrat.statut': {
      const { avant, apres } = paire(m)
      return `${qui} : contrat ${statutDit(avant)} → ${statutDit(apres)}.`
    }
    case 'contrat.fin_essai': {
      const { avant, apres } = paire(m)
      return `${qui} : fin d'essai ${dateDite(avant)} → ${dateDite(apres)}.`
    }
    case 'contrat.echeance': {
      const { avant, apres } = paire(m)
      return `${qui} : échéance ${dateDite(avant)} → ${dateDite(apres)}.`
    }
    /* Le pass Hypnose (0065) : un achat, ou un geste du revendeur. */
    case 'contrat.option_hypnose': {
      const { avant, apres } = paire(m)
      if (!apres) return `${qui} : option Hypnose retirée.`
      if (!avant) return `${qui} : option Hypnose ouverte jusqu'au ${dateDite(apres)}.`
      return `${qui} : option Hypnose ${dateDite(avant)} → ${dateDite(apres)}.`
    }
    case 'contrat.exception': {
      const parties = Object.entries(m).map(([champ, v]) => {
        const { avant, apres } = paire((v ?? {}) as Record<string, unknown>)
        const nom =
          champ === 'max_patients' ? 'plafond' : champ === 'jetons_mois' ? 'forfait' : (LEVIERS_DITS[champ]?.nom ?? champ)
        return `${nom} ${exceptionDite(champ, avant)} → ${exceptionDite(champ, apres)}`
      })
      return `${qui} : exception — ${parties.join(' ; ')}.`
    }
    case 'offre.reglee': {
      const champs = (m.champs ?? {}) as Record<string, unknown>
      const parties = Object.entries(champs).map(([champ, v]) => {
        const { avant, apres } = paire((v ?? {}) as Record<string, unknown>)
        return `${NOMS_REGLAGES[champ] ?? champ} ${reglageDit(champ, avant)} → ${reglageDit(champ, apres)}`
      })
      return `Offre ${offre(m.code)} réglée — ${parties.join(' ; ')}.`
    }
    /* La fermeture entre au journal avec 0057 : elle coupe l'espace des
       patients, et son histoire compte autant que celle du contrat. */
    case 'cabinet.ferme':
      return `${qui} : cabinet fermé.`
    case 'cabinet.rouvert':
      return `${qui} : cabinet rouvert.`
    default:
      return `${qui} : ${e.action}.`
  }
}

/* ---- La réouverture d'un suivi ----------------------------------------- */

/** Ce que rend `mes_droits()`, pour la part qui décide d'une réouverture. */
export interface DroitsLus {
  en_regle?: boolean | null
  max_patients?: number | null
  patients_actives?: number | null
}

/**
 * Pourquoi un suivi clos ne peut pas être rouvert — ou null s'il le peut.
 *
 * Le contrat passe avant le plafond. Hors contrat, la base fixe le plafond au
 * nombre de fiches déjà actives : répondre « closez un autre suivi » envoyait
 * fermer un suivi pour une place qui ne se libère jamais, et chaque clôture
 * coupait un patient de son espace. Des droits illisibles ne refusent rien :
 * la base, elle, tranchera.
 */
export function refusDeReouverture(d: DroitsLus | null): string | null {
  if (!d) return null
  if (d.en_regle === false) {
    return "Votre abonnement n'est plus en cours : aucun suivi ne peut être rouvert jusqu'à la reprise. Vos dossiers restent entiers ; votre revendeur peut réactiver l'offre."
  }
  const max = d.max_patients
  if (max === null || max === undefined) return null
  if ((d.patients_actives ?? 0) < max) return null
  return `Votre offre permet ${plural(max, 'fiche active', 'fiches actives')}, et ${max === 1 ? 'elle l’est' : 'elles le sont toutes'}. Closez un autre suivi, ou demandez à votre revendeur de relever le plafond.`
}
