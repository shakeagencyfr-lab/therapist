/**
 * Ce que le revendeur a le droit de calculer.
 *
 * Tout part de compteurs. Aucune fonction de ce fichier ne touche à une donnée
 * de santé, et il n'existe aucun chemin pour en obtenir une : la base ne les
 * sert pas à ce rôle (supabase/migrations/0002).
 */
import { CABINET_STATS, PLANS } from '@/data/reseller'
import type { AppState } from './state'
import type { CabinetId, Levier, Plan, PlanCode, PortfolioRow, Subscription } from '@/types/reseller'

/** Sous ce nombre de patients actifs, une moyenne devient un chiffre individuel. */
export const SEUIL_ANONYMAT = 3

export function planOf(code: PlanCode): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0]
}

/** Fiches actives autorisées : celles négociées, sinon celles de l'offre. */
export function maxPatientsOf(subscription: Subscription, plan: Plan): number | null {
  return subscription.maxPatientsOverride ?? plan.maxPatients
}

/** L'exception posée sur un levier, s'il y en a une. null = rien de négocié. */
export function overrideDe(subscription: Subscription, levier: Levier): boolean | null {
  if (levier === 'shop') return subscription.shopOverride
  if (levier === 'marqueBlanche') return subscription.marqueBlancheOverride
  return subscription.siteOverride
}

/** Un levier est-il ouvert à ce cabinet ? L'exception l'emporte sur l'offre. */
export function levierOuvert(subscription: Subscription, plan: Plan, levier: Levier): boolean {
  return overrideDe(subscription, levier) ?? plan[levier]
}

/** Le portefeuille, prêt à afficher. */
export function portfolio(state: AppState): PortfolioRow[] {
  return state.rCabinets
    .filter((c) => !c.archived)
    .map((cabinet) => {
      const subscription = state.rSubs[cabinet.id]
      const plan = planOf(subscription.plan)
      const stats = CABINET_STATS[cabinet.id] ?? {
        therapists: 1,
        patientsActive: 0,
        adherenceAvg: null,
        sessions30d: 0,
      }
      return { cabinet, stats, subscription, plan }
    })
}

export function cabinetById(state: AppState, id: CabinetId) {
  return state.rCabinets.find((c) => c.id === id) ?? state.rCabinets[0]
}

/**
 * Une moyenne n'est publiable qu'au-dessus du seuil. La règle est appliquée en
 * base ; on la répète ici pour pouvoir l'expliquer à l'écran plutôt que
 * d'afficher un tiret sans raison.
 */
export function adherenceLabel(row: PortfolioRow): { value: string; suppressed: boolean } {
  if (row.stats.adherenceAvg === null || row.stats.patientsActive < SEUIL_ANONYMAT) {
    return { value: '—', suppressed: true }
  }
  return { value: `${row.stats.adherenceAvg.toFixed(1).replace('.', ',')} %`, suppressed: false }
}

/** Revenu mensuel récurrent : les abonnements qui facturent réellement. */
export function mrrCents(rows: PortfolioRow[]): number {
  return rows
    .filter((r) => r.subscription.status === 'actif')
    .reduce((total, r) => total + r.plan.priceCents, 0)
}

/**
 * Cabinets dont les fiches actives approchent le plafond de leur offre.
 *
 * C'est le seul compteur qui appelle une action commerciale : une praticienne
 * qui bute sur son plafond est une praticienne prête à monter d'offre, et
 * mieux vaut le lui proposer que la laisser buter.
 */
export function nearCap(rows: PortfolioRow[]): PortfolioRow[] {
  return rows.filter((r) => {
    const max = maxPatientsOf(r.subscription, r.plan)
    return max !== null && r.stats.patientsActive >= max * 0.8
  })
}

/** Cabinets dont le contrat demande une action. */
export function needsAttention(rows: PortfolioRow[]): PortfolioRow[] {
  return rows.filter((r) => r.subscription.status === 'impaye' || r.subscription.status === 'suspendu')
}

/** Somme des compteurs du portefeuille. */
export function totals(rows: PortfolioRow[]) {
  return {
    cabinets: rows.length,
    patients: rows.reduce((n, r) => n + r.stats.patientsActive, 0),
    sessions: rows.reduce((n, r) => n + r.stats.sessions30d, 0),
  }
}

/**
 * Occupation du portefeuille : fiches actives rapportées aux plafonds.
 *
 * C'est le chiffre qui dit s'il reste de la place à vendre. Les cabinets sans
 * limite sont comptés à part : les inclure ferait tendre le taux vers zéro et
 * cacherait justement ceux qui butent.
 */
export function occupation(rows: PortfolioRow[]) {
  let actives = 0
  let capacite = 0
  let illimites = 0
  for (const r of rows) {
    const max = maxPatientsOf(r.subscription, r.plan)
    if (max === null) {
      illimites += 1
      continue
    }
    actives += r.stats.patientsActive
    capacite += max
  }
  return { actives, capacite, illimites, pct: capacite > 0 ? (actives / capacite) * 100 : 0 }
}

/** Sous-domaine proposé pour un nom de cabinet. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques décomposés par NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
