/**
 * Ce que le revendeur a le droit de calculer.
 *
 * Tout part de compteurs. Aucune fonction de ce fichier ne touche à une donnée
 * de santé, et il n'existe aucun chemin pour en obtenir une : la base ne les
 * sert pas à ce rôle (supabase/migrations/0002).
 */
import { CABINET_STATS, PLANS } from '@/data/reseller'
import type { AppState } from './state'
import type { CabinetId, Plan, PlanCode, PortfolioRow, Subscription } from '@/types/reseller'

/** Sous ce nombre de patients actifs, une moyenne devient un chiffre individuel. */
export const SEUIL_ANONYMAT = 3

export function planOf(code: PlanCode): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0]
}

/** Plafond effectif : celui négocié avec le cabinet, sinon celui de l'offre. */
export function capOf(subscription: Subscription): number {
  return subscription.capOverrideCents ?? planOf(subscription.plan).aiCapCents
}

/** Le portefeuille, prêt à afficher. */
export function portfolio(state: AppState): PortfolioRow[] {
  return state.rCabinets
    .filter((c) => !c.archived)
    .map((cabinet) => {
      const subscription = state.rSubs[cabinet.id]
      const plan = planOf(subscription.plan)
      const capCents = capOf(subscription)
      const stats = CABINET_STATS[cabinet.id] ?? {
        therapists: 1,
        patientsActive: 0,
        adherenceAvg: null,
        sessions30d: 0,
        aiSpendCents: 0,
      }
      return {
        cabinet,
        stats,
        subscription,
        plan,
        capCents,
        usagePct: capCents > 0 ? (stats.aiSpendCents / capCents) * 100 : 0,
      }
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

/** Cabinets qui approchent ou dépassent leur plafond de consommation IA. */
export function nearCap(rows: PortfolioRow[]): PortfolioRow[] {
  return rows.filter((r) => r.usagePct >= 80)
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
    aiSpendCents: rows.reduce((n, r) => n + r.stats.aiSpendCents, 0),
    aiCapCents: rows.reduce((n, r) => n + r.capCents, 0),
  }
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
