/**
 * Les jetons de démonstration : ceux d'un revendeur qui a activé le mode
 * jetons, et ceux d'un cabinet qu'il alimente.
 *
 * Sans session — démonstration publique, banc de rendu — l'onglet « Jetons
 * IA » du revendeur montre ces réglages en lecture seule, comme l'onglet
 * Équipe montre une équipe fictive. Les coûts réels sont ceux mesurés sur
 * les appels de septembre 2026 (table `ai_usage`), arrondis : le banc vérifie
 * que les marges se calculent sur des chiffres plausibles, pas sur des zéros.
 *
 * Les dates partent d'aujourd'hui : un forfait « qui se renouvelle le 1er
 * octobre » affiché en novembre ferait croire à une panne.
 */
import { BAREME_PAR_DEFAUT_ECRAN } from '@/lib/jetonsIA'
import type { EtatJetons, EtatRevendeurJetons } from '@/types/jetons'
import { CABINETS } from './reseller'

/** Le premier du mois suivant, « AAAA-MM-JJ », en heure locale. */
function premierDuMoisSuivant(maintenant = new Date()): string {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function dansJours(jours: number, maintenant = new Date()): string {
  return new Date(maintenant.getTime() + jours * 86_400_000).toISOString()
}

function ilYA(heures: number, maintenant = new Date()): string {
  return new Date(maintenant.getTime() - heures * 3_600_000).toISOString()
}

const RECHARGES = [
  { id: 'demo-100', libelle: '100 jetons', jetons: 100, prixCents: 1200 },
  { id: 'demo-300', libelle: '300 jetons', jetons: 300, prixCents: 3000 },
  { id: 'demo-1000', libelle: '1 000 jetons', jetons: 1000, prixCents: 8500 },
]

const OPTION_HYPNOSE = { prixCents: 1900, jours: 30, jetons: 200 }

export const ETAT_REVENDEUR_DEMO: EtatRevendeurJetons = {
  actif: true,
  mode: 'jetons',
  cle: { posee: true, poseeLe: '2026-09-02T18:14:17Z' },
  stripe: { pose: true, poseLe: '2026-09-03T09:30:00Z', compte: 'Klaro (démonstration)' },
  bareme: { ...BAREME_PAR_DEFAUT_ECRAN },
  essaiJetons: 100,
  optionHypnose: { ...OPTION_HYPNOSE },
  recharges: RECHARGES.map((r, i) => ({ ...r, actif: true, position: i + 1, archiveeLe: null })),
  coutsReels: [
    { action: 'seance', appels: 42, parAppelCentimesUsd: 5.56, parActionCentimesEur: 5.12 },
    { action: 'module', appels: 118, parAppelCentimesUsd: 5.83, parActionCentimesEur: 5.36 },
    { action: 'profil', appels: 31, parAppelCentimesUsd: 8.53, parActionCentimesEur: 7.85 },
    { action: 'affirmations', appels: 64, parAppelCentimesUsd: 0.13, parActionCentimesEur: 0.12 },
    { action: 'hypnose', appels: 36, parAppelCentimesUsd: 10.34, parActionCentimesEur: 38.05 },
  ],
  cabinets: CABINETS.filter((c) => !c.archived).map((c, i) => ({
    cabinetId: c.id,
    nom: c.name,
    consommesMois: [214, 36, 1187, 0, 95][i] ?? 0,
    solde: [586, 64, 813, 0, 205][i] ?? 0,
  })),
  chiffrement: true,
  // La démonstration se lit, elle ne se règle pas : aucune session derrière.
  proprietaire: false,
}

/** Le cabinet de démonstration, tel qu'Intégrations › Jetons IA le montre. */
export function etatJetonsDemo(maintenant = new Date()): EtatJetons {
  return {
    mode: 'jetons',
    enRegle: true,
    solde: 312,
    mensuel: { total: 800, restant: 212, renouvellement: premierDuMoisSuivant(maintenant) },
    essai: null,
    acheteRestant: 100,
    lots: [
      { origine: 'mensuel', jetonsInitiaux: 800, restants: 212, expireLe: dansJours(20, maintenant) },
      { origine: 'achat', jetonsInitiaux: 300, restants: 100, expireLe: dansJours(300, maintenant) },
    ],
    hypnose: { droit: false, incluse: false, jusquAu: null },
    bareme: { ...BAREME_PAR_DEFAUT_ECRAN },
    recharges: RECHARGES.map((r) => ({ ...r })),
    optionHypnose: { ...OPTION_HYPNOSE },
    paiementPossible: true,
    historique: [
      { le: ilYA(2, maintenant), action: 'seance', jetons: 12, statut: 'confirme' },
      { le: ilYA(2, maintenant), action: 'module', jetons: 0, statut: 'confirme' },
      { le: ilYA(2, maintenant), action: 'module', jetons: 0, statut: 'confirme' },
      { le: ilYA(2, maintenant), action: 'profil', jetons: 0, statut: 'confirme' },
      { le: ilYA(26, maintenant), action: 'module', jetons: 5, statut: 'confirme' },
      { le: ilYA(50, maintenant), action: 'seance', jetons: 12, statut: 'rembourse' },
      { le: ilYA(74, maintenant), action: 'affirmations', jetons: 1, statut: 'confirme' },
    ],
  }
}
