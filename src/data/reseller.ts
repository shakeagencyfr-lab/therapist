/**
 * Portefeuille de démonstration du revendeur.
 *
 * Ce sont des données de démonstration : dans le produit réel, elles viennent
 * de `reseller_cabinet_overview()`, une fonction qui filtre sur l'appartenance
 * du demandeur et ne renvoie que des compteurs. On remarquera qu'aucun nom de
 * patient n'apparaît ici — et qu'il n'y en aura jamais.
 */
import type {
  Cabinet,
  CabinetId,
  CabinetStats,
  Plan,
  Subscription,
} from '@/types/reseller'

/** Les trois offres. Mêmes valeurs que la table `plans` (migration 0003). */
export const PLANS: Plan[] = [
  {
    code: 'essentiel',
    label: 'Essentiel',
    priceCents: 3900,
    maxPatients: 25,
    aiCapCents: 1500,
    includes: [
      'Fiches patients et parcours hebdomadaire',
      'Bibliothèque audio du cabinet',
      'Application patient et journal partagé',
    ],
  },
  {
    code: 'cabinet',
    label: 'Cabinet',
    priceCents: 7900,
    maxPatients: 80,
    aiCapCents: 5000,
    includes: [
      "Tout l'Essentiel",
      'Captation de séance et brouillon de note',
      'Profil psychologique et atelier de modules',
    ],
  },
  {
    code: 'reseau',
    label: 'Réseau',
    priceCents: 14900,
    maxPatients: null,
    aiCapCents: 15000,
    includes: [
      'Tout le Cabinet',
      'Plusieurs praticiennes par cabinet',
      'Marque blanche et sous-domaine dédié',
    ],
  },
]

/** L'accent et le sombre par défaut, repris des jetons de design. */
const DEFAULT_BRANDING = {
  accent: '#A17A45',
  accentHover: '#856239',
  accentDeep: '#6E5230',
  dark: '#33291C',
}

export const CABINETS: Cabinet[] = [
  {
    id: 'ollivier',
    name: 'Cabinet Laetitia Ollivier',
    slug: 'laetitia-ollivier',
    tagline: 'Espace thérapie',
    branding: { ...DEFAULT_BRANDING, logo: 'LO' },
    therapist: 'Laetitia Ollivier',
    email: 'laetitia@cabinet-ollivier.fr',
    since: 'Depuis mars 2026',
    archived: false,
  },
  {
    id: 'benali',
    name: 'Espace Nour Benali',
    slug: 'nour-benali',
    tagline: 'Hypnose et accompagnement',
    branding: { accent: '#5F7A6B', accentHover: '#4E6659', accentDeep: '#3F5449', dark: '#26302B', logo: 'NB' },
    therapist: 'Nour Benali',
    email: 'contact@espace-benali.fr',
    since: "Depuis la semaine dernière",
    archived: false,
  },
  {
    id: 'fontaines',
    name: 'Cabinet des Trois Fontaines',
    slug: 'trois-fontaines',
    tagline: 'Thérapies brèves',
    branding: { accent: '#7A5F86', accentHover: '#654E70', accentDeep: '#53415C', dark: '#2E2733', logo: '3F' },
    therapist: 'Hélène Vasseur',
    email: 'direction@troisfontaines.fr',
    since: 'Depuis novembre 2025',
    archived: false,
  },
  {
    id: 'rive-gauche',
    name: 'Hypnose Rive Gauche',
    slug: 'rive-gauche',
    tagline: 'Cabinet de thérapie',
    branding: { accent: '#8A5A2B', accentHover: '#734A24', accentDeep: '#5E3D1E', dark: '#2F2519', logo: 'RG' },
    therapist: 'Pierre Aumont',
    email: 'p.aumont@rivegauche-hypnose.fr',
    since: 'Depuis janvier 2026',
    archived: false,
  },
  {
    id: 'reyt',
    name: 'Atelier Sylvain Reyt',
    slug: 'sylvain-reyt',
    tagline: 'Hypnose ericksonienne',
    branding: { accent: '#4E6A82', accentHover: '#41586C', accentDeep: '#354859', dark: '#232E37', logo: 'SR' },
    therapist: 'Sylvain Reyt',
    email: 'sylvain@atelier-reyt.fr',
    since: 'Depuis juin 2026',
    archived: false,
  },
]

/**
 * Compteurs par cabinet.
 *
 * Espace Nour Benali n'a que deux patients actifs : sa moyenne d'assiduité
 * est volontairement absente, comme la base la supprimerait.
 */
export const CABINET_STATS: Record<CabinetId, CabinetStats> = {
  ollivier: { therapists: 1, patientsActive: 5, adherenceAvg: 78.6, sessions30d: 14, aiSpendCents: 2140 },
  benali: { therapists: 1, patientsActive: 2, adherenceAvg: null, sessions30d: 3, aiSpendCents: 310 },
  fontaines: { therapists: 3, patientsActive: 34, adherenceAvg: 71.2, sessions30d: 62, aiSpendCents: 9880 },
  'rive-gauche': { therapists: 1, patientsActive: 18, adherenceAvg: 64.8, sessions30d: 21, aiSpendCents: 3960 },
  reyt: { therapists: 1, patientsActive: 9, adherenceAvg: 83.4, sessions30d: 11, aiSpendCents: 1420 },
}

export const SUBSCRIPTIONS: Record<CabinetId, Subscription> = {
  ollivier: { cabinetId: 'ollivier', plan: 'cabinet', status: 'actif', periodEnd: '12 octobre', capOverrideCents: null },
  benali: { cabinetId: 'benali', plan: 'essentiel', status: 'essai', periodEnd: '14 septembre', capOverrideCents: null },
  fontaines: { cabinetId: 'fontaines', plan: 'reseau', status: 'actif', periodEnd: '1er octobre', capOverrideCents: null },
  'rive-gauche': { cabinetId: 'rive-gauche', plan: 'cabinet', status: 'impaye', periodEnd: '28 août', capOverrideCents: null },
  reyt: { cabinetId: 'reyt', plan: 'essentiel', status: 'actif', periodEnd: '6 octobre', capOverrideCents: null },
}

/** Libellés des statuts d'abonnement. */
export const STATUS_LABEL: Record<Subscription['status'], string> = {
  essai: 'Essai',
  actif: 'Actif',
  impaye: 'Impayé',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
}

/** Palettes proposées dans l'éditeur de marque. */
export const BRAND_PRESETS: Array<{ label: string; accent: string; accentHover: string; accentDeep: string; dark: string }> = [
  { label: 'Ocre', accent: '#A17A45', accentHover: '#856239', accentDeep: '#6E5230', dark: '#33291C' },
  { label: 'Sauge', accent: '#5F7A6B', accentHover: '#4E6659', accentDeep: '#3F5449', dark: '#26302B' },
  { label: 'Prune', accent: '#7A5F86', accentHover: '#654E70', accentDeep: '#53415C', dark: '#2E2733' },
  { label: 'Ardoise', accent: '#4E6A82', accentHover: '#41586C', accentDeep: '#354859', dark: '#232E37' },
  { label: 'Terre', accent: '#8A5A2B', accentHover: '#734A24', accentDeep: '#5E3D1E', dark: '#2F2519' },
]
