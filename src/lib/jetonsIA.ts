/**
 * Les jetons d'analyse, dits à l'écran — pur.
 *
 * Le compte vit en base et le serveur le tient (server/jetons.ts) : ce module
 * ne décide rien. Il dit ce qu'une action coûtera, ce qu'il en reste, ce
 * qu'un barème rapporte au revendeur, et quand le forfait se renouvelle —
 * dans les mots des deux écrans qui en parlent, celui de la praticienne et
 * celui du revendeur.
 *
 * Nommé « jetonsIA » et non « jeton » : src/lib/jeton.ts lit le jeton de
 * SESSION. Deux fichiers presque homonymes pour deux choses sans rapport, ce
 * serait l'erreur d'import assurée.
 */
import { euro } from './format.js'
import type {
  AchatVerifie,
  ActionJetons,
  Bareme,
  CoutReel,
  EtatJetons,
  LigneHistorique,
  LotJetons,
  ModeFacturation,
} from '../types/jetons.js'

/* ---- Les actions ------------------------------------------------------- */

/**
 * Le barème par défaut de la base (0065, `reseller_jetons`), recopié pour la
 * démonstration. server/jetonsEcran.test.ts vérifie qu'il dit la même chose
 * que celui du serveur.
 */
export const BAREME_PAR_DEFAUT_ECRAN: Bareme = {
  seance: 6,
  module: 3,
  profil: 5,
  affirmations: 1,
  hypnose: 50,
  retouche: 2,
  retouche_hypnose: 8,
}

/** Dans l'ordre du barème, de la séance aux retouches. */
export const ACTIONS_DU_BAREME: readonly ActionJetons[] = [
  'seance',
  'module',
  'profil',
  'affirmations',
  'hypnose',
  'retouche',
  'retouche_hypnose',
]

/**
 * Ce que chaque action recouvre, dit au revendeur qui en fixe le prix.
 *
 * UN MODULE COÛTE CE QU'IL COÛTE, D'OÙ QU'ON L'ÉCRIVE (2 octobre 2026). La
 * séance paie sa note — et l'actualisation du profil qui la suit, comprise
 * une fois ; chaque module retenu se paie ensuite au prix du module, comme
 * dans l'atelier (server/jetons.ts).
 */
export const LIBELLE_ACTION: Record<ActionJetons, string> = {
  seance: 'Note de séance (mise à jour du profil comprise)',
  module: 'Module, en séance ou dans l’atelier',
  profil: 'Profil (hors séance)',
  affirmations: 'Affirmations de la semaine',
  hypnose: 'Hypnose de 30 minutes',
  retouche: "Retouche d'un texte par l'IA",
  retouche_hypnose: "Retouche d'un mouvement d'hypnose",
}

/** Le même, en deux mots : l'historique de la praticienne et son barème. */
export const ACTION_COURTE: Record<ActionJetons, string> = {
  seance: 'Séance',
  module: 'Module',
  profil: 'Profil',
  affirmations: 'Affirmations',
  hypnose: 'Hypnose',
  retouche: 'Retouche',
  retouche_hypnose: "Retouche d'hypnose",
}

/* ---- Compter ----------------------------------------------------------- */

/** « 1 jeton », « 12 jetons », « 1 000 jetons » — et « 0 jeton », comme on le dit. */
export function jetonsDits(n: number): string {
  return `${n.toLocaleString('fr-FR')} jeton${Math.abs(n) > 1 ? 's' : ''}`
}

/** « 1 jeton offert », « 200 jetons offerts » — le participe suit le nombre. */
export function offertsDits(n: number): string {
  return `${jetonsDits(n)} offert${Math.abs(n) > 1 ? 's' : ''}`
}

/** « il vous en reste 312 », « il ne vous en reste aucun ». */
export function resteDit(solde: number): string {
  return solde > 0 ? `il vous en reste ${solde.toLocaleString('fr-FR')}` : 'il ne vous en reste aucun'
}

function minuscule(phrase: string): string {
  return phrase.charAt(0).toLowerCase() + phrase.slice(1)
}

/**
 * Ce qu'une action va coûter, avant de la lancer.
 *
 * `null` hors du mode jetons — ou tant qu'on ne le sait pas : l'écran garde
 * alors ses textes d'avant, qui parlent de la clé du cabinet. Annoncer des
 * jetons à un cabinet qui paie avec sa clé serait faux ; annoncer sa clé à
 * un cabinet alimenté par son revendeur le serait tout autant.
 *
 * `compris` : une action déjà payée par le forfait d'une séance (le profil
 * actualisé juste après elle).
 */
export interface Devis {
  cout: number
  solde: number
  /** Le solde ne couvre pas l'action : le bouton se ferme, et l'écran dit où recharger. */
  manque: boolean
  /** Déjà payée par le forfait d'une séance. */
  compris: boolean
}

export function devisJetons(
  etat: Pick<EtatJetons, 'mode' | 'solde' | 'enRegle' | 'bareme'> | null,
  action: ActionJetons,
  compris = false,
  /** Combien de fois l'action : les consignes des modules retenus d'une séance. */
  quantite = 1,
): Devis | null {
  if (!etat || etat.mode !== 'jetons') return null
  const cout = compris ? 0 : Math.max(0, etat.bareme[action] ?? 0) * Math.max(0, Math.floor(quantite))
  /* HORS CONTRAT, CE N'EST PAS UN MANQUE. Le serveur refuse alors toute
     analyse, et le bandeau du contrat le dit déjà : pousser à recharger un
     cabinet dont l'essai est fini, c'est lui vendre des jetons inutilisables. */
  return { cout, solde: etat.solde, manque: etat.enRegle && cout > etat.solde, compris }
}

/**
 * La phrase posée à côté du bouton.
 *
 * « Cette analyse utilisera 12 jetons (il vous en reste 312). » Et quand le
 * solde ne suffit pas : « Il vous reste 3 jetons, et cette analyse en demande
 * 12. » — le constat, sans reproche ; le lien vers la recharge suit.
 */
export function phraseDuDevis(devis: Devis, sujet = 'Cette analyse'): string {
  // Le forfait d'une séance comprend UNE actualisation du profil : la seconde se paie.
  if (devis.compris) return `Inclus dans la séance : ${minuscule(sujet)} n'utilise aucun jeton (une par séance).`
  if (devis.manque) {
    const constat = devis.solde > 0 ? `Il vous reste ${jetonsDits(devis.solde)}` : 'Il ne vous reste aucun jeton'
    return `${constat}, et ${minuscule(sujet)} en demande ${devis.cout.toLocaleString('fr-FR')}.`
  }
  return `${sujet} utilisera ${jetonsDits(devis.cout)} (${resteDit(devis.solde)}).`
}

/** Le mode, seulement quand il est lu : null veut dire « on ne sait pas encore ». */
export function modeLu(etat: Pick<EtatJetons, 'mode'> | null): ModeFacturation | null {
  return etat?.mode ?? null
}

/* ---- Le prix, vu par le revendeur -------------------------------------- */

/** En dessous, la marge d'une action se lit en alerte : le revendeur la vend presque à prix coûtant. */
export const SEUIL_MARGE = 60

/**
 * Combien de modules une séance retient, en moyenne — pour dire ce que coûte
 * une séance complète. Un brouillon en propose trois ou quatre ; on compte le
 * haut de la fourchette, pour ne pas flatter le nombre de séances par mois.
 */
export const CONSIGNES_PAR_SEANCE_ESTIMEES = 4

/** Une séance complète, en jetons : sa note, et ses modules retenus au prix du module. */
export function jetonsDUneSeanceComplete(bareme: Pick<Bareme, 'seance' | 'module'>): number {
  return bareme.seance + CONSIGNES_PAR_SEANCE_ESTIMEES * bareme.module
}

/**
 * Le prix d'un jeton, au plus bas : celui de la recharge la plus avantageuse
 * encore en vente, en centimes d'euro (fractionnaires). C'est le pire cas
 * pour la marge : la praticienne qui achète le gros paquet.
 */
export function prixDuJetonCents(recharges: Array<{ jetons: number; prixCents: number; actif?: boolean }>): number | null {
  let bas: number | null = null
  for (const r of recharges) {
    if (r.actif === false || !(r.jetons > 0) || !(r.prixCents > 0)) continue
    const unitaire = r.prixCents / r.jetons
    if (bas === null || unitaire < bas) bas = unitaire
  }
  return bas
}

/** « 0,085 € » : le prix d'un jeton, avec les millimes qui font la différence. */
export function euroParJeton(prixCents: number, jetons: number): string {
  if (!(jetons > 0)) return '—'
  const euros = prixCents / jetons / 100
  return `${euros.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`
}

/**
 * Ce qu'une action coûte vraiment au revendeur, en centimes d'euro, d'après
 * les appels mesurés.
 *
 * LA SÉANCE ADDITIONNE CE QU'ELLE COMPREND. La mesure de « séance » ne couvre
 * que le brouillon ; or la séance payée comprend aussi une actualisation du
 * profil, qui est un appel à part. Ses modules, eux, se paient chacun au prix
 * du module : ils ont leur propre ligne.
 */
export function coutsParAction(couts: CoutReel[]): Partial<Record<ActionJetons, number>> {
  const brut: Partial<Record<ActionJetons, number>> = {}
  for (const c of couts) brut[c.action] = c.parActionCentimesEur
  const parAction = { ...brut }
  if (brut.seance !== undefined) {
    parAction.seance = brut.seance + (brut.profil ?? 0)
  }
  return parAction
}

export interface Marge {
  /** Ce que la praticienne paie l'action, au jeton le moins cher. Null sans recharge en vente. */
  prixCents: number | null
  /** En pour cent du prix. Null quand on ne peut pas la calculer. */
  margePct: number | null
  /** Sous le seuil — ou une action offerte qui coûte pourtant quelque chose. */
  faible: boolean
}

export function margeDe(jetons: number, prixJetonCents: number | null, coutCentimesEur: number | null | undefined): Marge {
  const prixCents = prixJetonCents === null ? null : jetons * prixJetonCents
  const cout = typeof coutCentimesEur === 'number' && Number.isFinite(coutCentimesEur) ? coutCentimesEur : null
  if (prixCents === null || cout === null) return { prixCents, margePct: null, faible: false }
  // Une action à zéro jeton qui coûte un appel : c'est une perte, pas une marge.
  if (prixCents <= 0) return { prixCents, margePct: null, faible: cout > 0 }
  const margePct = Math.round(((prixCents - cout) / prixCents) * 100)
  return { prixCents, margePct, faible: margePct < SEUIL_MARGE }
}

/** Un montant en centimes (fractionnaires), dit en euros : « 1,02 € », « moins de 0,01 € ». */
export function centimesDits(centimes: number): string {
  return euro(centimes / 100)
}

/**
 * Le même, pour une cellule de tableau : « < 0,01 € » tient où « moins de » déborde.
 *
 * ZÉRO SE DIT ZÉRO. Une action offerte (0 jeton) coûte « 0,00 € » à la
 * praticienne : `euro(0)` en faisait « moins de 0,01 € », qui laissait croire
 * qu'on la faisait encore payer — et débordait de la cellule.
 */
export function centimesCourts(centimes: number): string {
  if (centimes === 0) return '0,00 €'
  return centimes > 0 && centimes < 1 ? '< 0,01 €' : centimesDits(centimes)
}

/* ---- Les prix saisis --------------------------------------------------- */

/** Un prix en centimes, écrit comme on l'écrit : « 19 », « 19,50 ». */
export function prixEnSaisie(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',')
}

/** La saisie d'un prix, en centimes — ou null si ce n'en est pas un. */
export function prixSaisi(saisie: string): number | null {
  const t = saisie.replace(',', '.').trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

/** Un nombre entier saisi, dans ses bornes — ou null. */
export function entierSaisi(saisie: string, min: number, max: number): number | null {
  const t = saisie.replace(/[\s ]/g, '').trim()
  if (!/^\d{1,7}$/.test(t)) return null
  const n = Number(t)
  return n >= min && n <= max ? n : null
}

/** « 19 € », « 19,50 € » : un prix de vente, sans décimales inutiles. */
export function prixDit(cents: number): string {
  return `${prixEnSaisie(cents)} €`
}

/* ---- Le forfait, l'option ---------------------------------------------- */

/** « 1er novembre », « 12 octobre » — d'une date « AAAA-MM-JJ », sans détour par un fuseau. */
export function jourDit(aaaammjj: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(aaaammjj)
  if (!m) return aaaammjj
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const mois = date.toLocaleDateString('fr-FR', { month: 'long' })
  const jour = date.getDate()
  return `${jour === 1 ? '1er' : jour} ${mois}`
}

/** « 12 octobre 2026 » — d'un horodatage ISO. */
export function dateDite(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * « Vos 300 jetons du mois se renouvellent le 1er novembre ; ceux qui
 * restent ne se reportent pas. »
 *
 * La seconde moitié compte autant que la première : sans elle, une
 * praticienne économise ses jetons en fin de mois pour le suivant, et les
 * perd.
 */
export function phraseDuForfait(mensuel: { total: number; renouvellement: string }): string {
  // Un forfait de zéro n'est pas un forfait : rien ne se renouvelle.
  if (!(mensuel.total > 0)) return ''
  const quand = jourDit(mensuel.renouvellement)
  return mensuel.total > 1
    ? `Vos ${mensuel.total.toLocaleString('fr-FR')} jetons du mois se renouvellent le ${quand} ; ceux qui restent ne se reportent pas.`
    : `Votre jeton du mois se renouvelle le ${quand} ; il ne se reporte pas.`
}

/** « Activer l'option — 19 € pour 30 jours, 200 jetons offerts » */
export function libelleOptionHypnose(o: { prixCents: number; jours: number; jetons: number }, verbe = "Activer l'option"): string {
  const jours = `${o.jours} jour${o.jours > 1 ? 's' : ''}`
  const offerts = o.jetons > 0 ? `, ${offertsDits(o.jetons)}` : ''
  return `${verbe} — ${prixDit(o.prixCents)} pour ${jours}${offerts}`
}

/**
 * Le forfait du mois, s'il y en a un — null pour une offre à zéro jeton.
 *
 * `cabinet_jetons` rend un forfait pour tout contrat actif, même quand
 * l'offre (ou l'exception du contrat) en donne zéro : la carte annonçait
 * alors « votre jeton du mois se renouvelle », pour un jeton qui n'existe pas.
 */
export function forfaitDuMois(etat: Pick<EtatJetons, 'mensuel'>): EtatJetons['mensuel'] {
  return etat.mensuel && etat.mensuel.total > 0 ? etat.mensuel : null
}

/**
 * Ce qui reste hors forfait et hors essai, rangé par ce qui fait sa durée.
 *
 * LES JETONS DU PASS HYPNOSE NE DURENT PAS DOUZE MOIS : ils expirent avec le
 * pass. Les compter avec les achats et les gestes sous « valables douze
 * mois », c'était promettre onze mois de trop sur des jetons payés. Pour
 * eux, la date de fin la plus proche — celle qui compte.
 */
export function repartitionDesLots(lots: LotJetons[]): {
  /** Achats et gestes du revendeur : douze mois chacun. */
  douzeMois: number
  /** Les jetons du pass Hypnose, et la fin la plus proche ; null s'il n'en reste pas. */
  option: { restant: number; fin: string } | null
} {
  let douzeMois = 0
  let restant = 0
  let fin = ''
  for (const l of lots) {
    if (l.origine === 'achat' || l.origine === 'geste') douzeMois += l.restants
    if (l.origine === 'option_hypnose' && l.restants > 0) {
      restant += l.restants
      if (!fin || new Date(l.expireLe).getTime() < new Date(fin).getTime()) fin = l.expireLe
    }
  }
  return { douzeMois, option: restant > 0 ? { restant, fin } : null }
}

/** « Voir la précédente », « Voir les 12 précédentes ». */
export function precedentesDites(n: number): string {
  return n > 1 ? `Voir les ${n} précédentes` : 'Voir la précédente'
}

/** L'hypnose, telle que la praticienne la lit dans sa carte. */
export function etatHypnoseDit(h: EtatJetons['hypnose']): string {
  if (h.incluse) return 'Comprise dans votre offre.'
  if (h.droit && h.jusquAu) return `Active jusqu'au ${dateDite(h.jusquAu)}.`
  if (h.droit) return 'Ouverte pour votre cabinet.'
  return "Pas comprise dans votre offre : l'hypnose personnalisée s'ajoute en option."
}

/* ---- L'historique ------------------------------------------------------ */

/** « 30 sept., 14:05 » */
export function quandDit(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Ce qu'une ligne d'historique a coûté : « −12 », « compris », « rendu ». */
export function debitDit(l: LigneHistorique): string {
  if (l.statut === 'rembourse') return 'rendu'
  if (l.jetons === 0) return 'compris'
  return `−${l.jetons.toLocaleString('fr-FR')}`
}

/* ---- Le retour de Stripe ----------------------------------------------- */

export interface RetourDit {
  ton: 'ok' | 'warn'
  texte: string
  /** Stripe n'a pas encore confirmé : un nouvel essai a un sens. */
  attente: boolean
}

/** Ce que l'écran dit après la vérification d'un achat. */
export function retourDit(v: AchatVerifie): RetourDit {
  return { ton: v.ok ? 'ok' : 'warn', texte: v.message, attente: v.attente === true }
}

/** Le barème, rangé dans l'ordre de l'écran. */
export function lignesDuBareme(bareme: Bareme): Array<{ action: ActionJetons; jetons: number }> {
  return ACTIONS_DU_BAREME.map((action) => ({ action, jetons: bareme[action] }))
}
