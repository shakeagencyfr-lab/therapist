import { Segmented } from '@/components/ui'
import { useStore } from '@/state/store'
import type { ResellerView } from '@/state/state'
import { CabinetPortfolio } from './CabinetPortfolio'
import { BrandEditor } from './BrandEditor'
import { PlansView } from './PlansView'
import s from './ResellerSpace.module.css'

const TABS: Array<{ value: ResellerView; label: string }> = [
  { value: 'portfolio', label: 'Cabinets' },
  { value: 'brand', label: 'Marque' },
  { value: 'plans', label: 'Offres' },
]

const TITLES: Record<ResellerView, { title: string; intro: string }> = {
  portfolio: {
    title: 'Vos cabinets',
    intro:
      "Chaque cabinet est une installation indépendante, avec ses patients, ses audios et sa marque. Vous voyez ici ce qui vous regarde : l'usage, le contrat et la consommation. Jamais les patients, ni ce qu'ils écrivent.",
  },
  brand: {
    title: 'Marque du cabinet',
    intro:
      "L'accent et la couleur sombre sont paramétrables par cabinet, et l'aperçu montre le résultat avant de l'appliquer. Le reste de l'interface — fonds, bordures, typographie — ne bouge pas : c'est ce qui garde les écrans lisibles d'un cabinet à l'autre.",
  },
  plans: {
    title: 'Offres et abonnements',
    intro:
      "Trois offres, et un plafond de consommation IA sur chacune. Les quatre fonctions d'analyse coûtent de l'argent à chaque appel : sans plafond, une thérapeute qui capte beaucoup de séances mange la marge.",
  },
}

/**
 * L'espace du revendeur. Une autre personne que la thérapeute, un autre
 * métier : vendre et administrer des cabinets. Aucune donnée de santé n'entre
 * dans cet écran.
 */
export function ResellerSpace() {
  const { state, set } = useStore()
  const { title, intro } = TITLES[state.rView]

  return (
    <div className={s.space}>
      <div className={s.head}>
        <div>
          <span className={s.overline}>Espace revendeur</span>
          <h1 className={s.h1}>{title}</h1>
          <p className={s.intro}>{intro}</p>
        </div>
      </div>

      <div className={s.tabs}>
        <Segmented options={TABS} value={state.rView} onChange={(rView) => set({ rView, rNotice: '' })} />
      </div>

      {state.rView === 'portfolio' && <CabinetPortfolio />}
      {state.rView === 'brand' && <BrandEditor />}
      {state.rView === 'plans' && <PlansView />}
    </div>
  )
}
