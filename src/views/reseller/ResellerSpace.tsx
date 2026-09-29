import { Segmented } from '@/components/ui'
import { useStore } from '@/state/store'
import type { ResellerView } from '@/state/state'
import { ResellerProvider } from '@/reseller/context'
import { CabinetPortfolio } from './CabinetPortfolio'
import { BrandEditor } from './BrandEditor'
import { PlansView } from './PlansView'
import { FicheCabinet } from './FicheCabinet'
import { EquipeRevendeur } from './EquipeRevendeur'
import { Demandes } from './Demandes'
import { useDemandes } from '@/reseller/useDemandes'
import { libelleOnglet } from '@/lib/demandesRevendeur'
import s from './ResellerSpace.module.css'

const TABS: Array<{ value: ResellerView; label: string }> = [
  { value: 'portfolio', label: 'Cabinets' },
  { value: 'brand', label: 'Marque' },
  { value: 'plans', label: 'Offres' },
  { value: 'equipe', label: 'Équipe' },
]

const TITLES: Record<ResellerView, { title: string; intro: string }> = {
  portfolio: {
    title: 'Vos cabinets',
    intro:
      "Chaque cabinet est une installation indépendante, avec ses patients, ses audios et sa marque. Vous voyez ici ce qui vous regarde : l'usage et le contrat. Jamais les patients, ni ce qu'ils écrivent.",
  },
  brand: {
    title: 'Marque du cabinet',
    intro:
      "L'accent et la couleur sombre sont paramétrables par cabinet, et l'aperçu montre le résultat avant de l'appliquer. Le reste de l'interface — fonds, bordures, typographie — ne bouge pas : c'est ce qui garde les écrans lisibles d'un cabinet à l'autre.",
  },
  plans: {
    title: 'Offres et abonnements',
    intro:
      "Chaque thérapeute branche sa propre clé d'analyse et paie ses appels directement : votre offre ne vend que l'application. Vous réglez ici ce que chaque offre ouvre — nombre de patients, boutique, marque blanche, site vitrine — et son prix.",
  },
  fiche: {
    title: 'Fiche du cabinet',
    intro:
      "Son contrat et ses échéances, ses praticiennes, ses chiffres et l'histoire de son contrat — et les gestes qui le règlent, le ferment ou le rouvrent. Toujours sans un patient ni un dossier.",
  },
  equipe: {
    title: 'Votre équipe',
    intro:
      "Les personnes qui travaillent avec vous dans cet espace, et les coordonnées que vos praticiennes lisent quand elles ont besoin de vous joindre. Aucune de ces personnes ne voit un patient ni un dossier.",
  },
  demandes: {
    title: "Demandes d'essai",
    intro:
      "Les praticiennes qui ont laissé leurs coordonnées sur la page d'accueil, les nouvelles en tête. Vous les recontactez, vous les classez, et « Ouvrir le cabinet » pré-remplit l'ouverture. Elles n'arrivent que chez vous.",
  },
}

/**
 * L'espace du revendeur. Une autre personne que la thérapeute, un autre
 * métier : vendre et administrer des cabinets. Aucune donnée de santé n'entre
 * dans cet écran.
 */
export function ResellerSpace() {
  const { state, set } = useStore()
  /* LES DEMANDES D'ESSAI (0060) : un onglet de plus, pour le seul revendeur
     qui les accueille, avec le nombre des nouvelles. */
  const demandes = useDemandes()
  const vue: ResellerView = state.rView === 'demandes' && !demandes.accueille ? 'portfolio' : state.rView
  const onglets = demandes.accueille
    ? [...TABS, { value: 'demandes' as ResellerView, label: libelleOnglet(demandes.nouvelles) }]
    : TABS
  const { title, intro } = TITLES[vue]

  return (
    <ResellerProvider>
    <div className={s.space}>
      <div className={s.head}>
        <div>
          <span className={s.overline}>Espace revendeur</span>
          <h1 className={s.h1}>{title}</h1>
          <p className={s.intro}>{intro}</p>
        </div>
      </div>

      <div className={s.tabs}>
        {/* La fiche d'un cabinet n'a pas d'onglet : c'est « Cabinets » qui
            reste allumé, et le recliquer ramène au portefeuille. */}
        <Segmented
          options={onglets}
          value={vue === 'fiche' ? 'portfolio' : vue}
          onChange={(rView) => set({ rView, rNotice: '' })}
        />
      </div>

      {vue === 'portfolio' && <CabinetPortfolio />}
      {vue === 'fiche' && <FicheCabinet />}
      {vue === 'brand' && <BrandEditor />}
      {vue === 'plans' && <PlansView />}
      {vue === 'equipe' && <EquipeRevendeur />}
      {vue === 'demandes' && <Demandes donnees={demandes} />}
    </div>
    </ResellerProvider>
  )
}
