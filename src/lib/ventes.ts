/**
 * Les ventes de la boutique, une fois l'argent encaissé : le livre des
 * recettes que la praticienne exporte, le reçu que le patient télécharge, le
 * remboursement et ce que l'écran en dit (migration 0058).
 *
 * Logique pure : rien ici ne parle à la base ni au serveur, tout s'éprouve
 * sans eux. Imports relatifs seulement, pour que le serveur puisse la lire.
 *
 * UN LIVRE DE RECETTES COMPTE L'ARGENT QUAND IL BOUGE. Une vente entre au
 * livre à la date de son encaissement ; son remboursement en sort à la date
 * du remboursement, en négatif. Une vente de mars remboursée en avril
 * appartient donc aux deux mois — et le total d'une période est ce qui a
 * vraiment été encaissé pendant cette période, ce que la comptabilité de
 * trésorerie d'une praticienne demande.
 */
import { instantDeParis, jourValide } from './agenda'
import { decalerJour, jourDeParis } from './assiduite'
import { plural } from './format'
import { segmentDeFichier } from './pdfTexte'

/* ------------------------------------------------------------------ *
 * Les commandes, telles que la base les rend
 * ------------------------------------------------------------------ */

/** Une vente au sens du livre : payée, ou payée puis remboursée. */
export type StatutVente = 'payee' | 'remboursee'

export function estVente(status: string): status is StatutVente {
  return status === 'payee' || status === 'remboursee'
}

/** Une ligne de `orders` telle que l'export et la liste la lisent. */
export interface CommandeLue {
  id: string
  title: string
  amount_cents: number
  currency: string
  status: string
  paid_at: string | null
  rembourse_at: string | null
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  stripe_livemode?: boolean | null
  patient: { display_name: string } | null
}

/**
 * « 3F2A-9C1B » : la référence d'une commande, lisible et recopiable.
 *
 * Tirée de son identifiant, elle est la même sur le reçu du patient, dans la
 * liste des ventes et dans le livre exporté — c'est ce qui permet de
 * rapprocher un reçu d'une ligne sans nommer personne. Elle ne porte aucune
 * marque : en marque blanche, le reçu est celui du cabinet.
 */
export function referenceDeCommande(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase()
  return hex.length === 8 ? `${hex.slice(0, 4)}-${hex.slice(4)}` : hex || '—'
}

/** « Payée », « Remboursée ». */
export function statutDit(status: string): string {
  if (status === 'remboursee') return 'Remboursée'
  if (status === 'payee') return 'Payée'
  if (status === 'en_attente') return 'En attente'
  if (status === 'annulee') return 'Annulée'
  return status
}

/**
 * « C. M. », « J.-P. D. » : des initiales, pour que le livre se transmette
 * à un comptable sans nommer les personnes suivies. Le nom complet n'y
 * entre que sur un choix explicite de la praticienne.
 */
export function initialesDe(nom: string | null | undefined): string {
  const mots = (nom ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean)
  return mots
    .map((mot) =>
      mot
        .split('-')
        .filter(Boolean)
        .map((partie) => {
          const premiere = Array.from(partie).find((c) => /\p{L}|\p{N}/u.test(c))
          return premiere ? `${premiere.toLocaleUpperCase('fr-FR')}.` : ''
        })
        .filter(Boolean)
        .join('-'),
    )
    .filter(Boolean)
    .join(' ')
}

/* ------------------------------------------------------------------ *
 * La période
 * ------------------------------------------------------------------ */

export type ChoixPeriode = 'mois' | 'mois-precedent' | 'annee' | 'annee-precedente' | 'libre'

export const PERIODES: Array<{ value: ChoixPeriode; label: string }> = [
  { value: 'mois', label: 'Ce mois-ci' },
  { value: 'mois-precedent', label: 'Mois dernier' },
  { value: 'annee', label: 'Cette année' },
  { value: 'annee-precedente', label: 'Année dernière' },
  { value: 'libre', label: 'Autre période' },
]

function deuxChiffres(n: number): string {
  return String(n).padStart(2, '0')
}

function dernierJour(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate()
}

/**
 * Les bornes d'une période toute faite, en jours de Paris, bornes
 * comprises. Le mois entier, même en cours : les jours à venir ne
 * contiennent rien, et le fichier porte le nom du mois.
 */
export function periodePredefinie(
  choix: Exclude<ChoixPeriode, 'libre'>,
  maintenant: Date = new Date(),
): { du: string; au: string } {
  const [a, m] = jourDeParis(maintenant).split('-').map(Number)
  if (choix === 'annee') return { du: `${a}-01-01`, au: `${a}-12-31` }
  if (choix === 'annee-precedente') return { du: `${a - 1}-01-01`, au: `${a - 1}-12-31` }
  const [annee, mois] = choix === 'mois' ? [a, m] : m === 1 ? [a - 1, 12] : [a, m - 1]
  return {
    du: `${annee}-${deuxChiffres(mois)}-01`,
    au: `${annee}-${deuxChiffres(mois)}-${deuxChiffres(dernierJour(annee, mois))}`,
  }
}

/**
 * L'instant où commence un jour de Paris, en ISO. Même calcul que l'heure
 * d'une séance (agenda.ts), qui tient les deux changements d'heure ; un
 * jour impossible est refusé plus haut (refusPeriode), et lève ici.
 */
export function minuitAParis(jour: string): string {
  const instant = instantDeParis(jour, '00:00')
  if (!instant) throw new RangeError(`Jour illisible : ${jour}`)
  return instant.toISOString()
}

/**
 * Les instants qui bornent une période de jours : du premier minuit compris
 * au minuit suivant le dernier jour, exclu. Ce sont eux que la base compare.
 */
export function bornesDeLaPeriode(du: string, au: string): { debut: string; fin: string } {
  return { debut: minuitAParis(du), fin: minuitAParis(decalerJour(au, 1)) }
}

/** Ce qui empêche d'exporter une période, dit comme l'écran le dira ; vide sinon. */
export function refusPeriode(du: string, au: string): string {
  if (!jourValide(du) || !jourValide(au)) return 'Choisissez une date de début et une date de fin.'
  if (du > au) return 'La date de début vient après la date de fin.'
  return ''
}

/** « du 1er au 30 septembre 2026 », « du 12 mars 2025 au 4 février 2026 ». */
export function periodeDite(du: string, au: string): string {
  if (!jourValide(du) || !jourValide(au)) return ''
  const dit = (jour: string, options: Intl.DateTimeFormatOptions) => {
    const [a, m, j] = jour.split('-').map(Number)
    const texte = new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })
    return j === 1 ? texte.replace(/^1(?!\d)/, '1er') : texte
  }
  const complet: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  if (du === au) return `le ${dit(du, complet)}`
  const memeAnnee = du.slice(0, 4) === au.slice(0, 4)
  const memeMois = memeAnnee && du.slice(5, 7) === au.slice(5, 7)
  const debut = dit(du, memeMois ? { day: 'numeric' } : memeAnnee ? { day: 'numeric', month: 'long' } : complet)
  return `du ${debut} au ${dit(au, complet)}`
}

/* ------------------------------------------------------------------ *
 * Le livre des recettes
 * ------------------------------------------------------------------ */

/** Une écriture du livre : un encaissement, ou un remboursement en négatif. */
export interface EcritureDuLivre {
  /** L'instant de l'opération, ISO. */
  le: string
  operation: 'vente' | 'remboursement'
  produit: string
  patient: string
  /** Négatif pour un remboursement. */
  montantCents: number
  devise: string
  /** L'état de la commande aujourd'hui. */
  statut: string
  reference: string
  commandeStripe: string
  paiementStripe: string
}

function dans(instant: string | null, debut: number, fin: number): boolean {
  if (!instant) return false
  const t = Date.parse(instant)
  return Number.isFinite(t) && t >= debut && t < fin
}

/**
 * Les écritures d'une période, dans l'ordre du temps.
 *
 * `nomsComplets` : faux par défaut — des initiales. Un livre de recettes
 * part chez un comptable, parfois par courriel ; il n'a pas à dire qui
 * consulte une hypnothérapeute.
 */
export function ecrituresDuLivre(
  commandes: readonly CommandeLue[],
  bornes: { debut: string; fin: string },
  options: { nomsComplets: boolean },
): EcritureDuLivre[] {
  const debut = Date.parse(bornes.debut)
  const fin = Date.parse(bornes.fin)
  const ecritures: EcritureDuLivre[] = []
  for (const c of commandes) {
    if (!estVente(c.status)) continue
    const commun = {
      produit: c.title,
      patient: options.nomsComplets ? (c.patient?.display_name ?? '').trim() : initialesDe(c.patient?.display_name),
      devise: (c.currency || 'eur').toUpperCase(),
      statut: statutDit(c.status),
      reference: referenceDeCommande(c.id),
      commandeStripe: c.stripe_session_id ?? '',
      paiementStripe: c.stripe_payment_intent ?? '',
    }
    if (dans(c.paid_at, debut, fin)) {
      ecritures.push({ ...commun, le: c.paid_at as string, operation: 'vente', montantCents: c.amount_cents })
    }
    if (c.status === 'remboursee' && dans(c.rembourse_at, debut, fin)) {
      ecritures.push({
        ...commun,
        le: c.rembourse_at as string,
        operation: 'remboursement',
        montantCents: -c.amount_cents,
      })
    }
  }
  return ecritures.sort(
    (x, y) =>
      Date.parse(x.le) - Date.parse(y.le) ||
      (x.operation === y.operation ? 0 : x.operation === 'vente' ? -1 : 1) ||
      x.reference.localeCompare(y.reference),
  )
}

/** Ce que la période a rapporté, et ce qu'elle a rendu. */
export interface BilanDuLivre {
  ventes: number
  remboursements: number
  encaisseCents: number
  rembourseCents: number
  netCents: number
}

export function bilanDuLivre(ecritures: readonly EcritureDuLivre[]): BilanDuLivre {
  const b: BilanDuLivre = { ventes: 0, remboursements: 0, encaisseCents: 0, rembourseCents: 0, netCents: 0 }
  for (const e of ecritures) {
    if (e.operation === 'vente') {
      b.ventes++
      b.encaisseCents += e.montantCents
    } else {
      b.remboursements++
      b.rembourseCents -= e.montantCents
    }
    b.netCents += e.montantCents
  }
  return b
}

/** « 29,90 € », « −15,00 € ». */
export function euros(cents: number): string {
  const signe = cents < 0 ? '−' : ''
  return `${signe}${montantCsv(Math.abs(cents))} €`
}

/** Le bilan en une phrase, pour l'écran. */
export function phraseDuBilan(b: BilanDuLivre): string {
  if (!b.ventes && !b.remboursements) return 'Aucune vente ni aucun remboursement sur cette période.'
  const parts = [plural(b.ventes, 'vente', 'ventes')]
  if (b.remboursements) parts.push(plural(b.remboursements, 'remboursement', 'remboursements'))
  return `${parts.join(' et ')} · ${euros(b.netCents)} encaissés au net`
}

/* ------------------------------------------------------------------ *
 * Le fichier
 * ------------------------------------------------------------------ */

export const COLONNES_DU_LIVRE = [
  'Date',
  'Opération',
  'Produit',
  'Patient',
  'Montant',
  'Devise',
  'Statut',
  'Référence',
  'Commande Stripe',
  'Paiement Stripe',
] as const

/**
 * Un montant tel qu'Excel en français le lit comme un nombre : virgule
 * décimale, pas de séparateur de milliers, pas de symbole.
 */
export function montantCsv(cents: number): string {
  const entier = Math.round(cents)
  const signe = entier < 0 ? '-' : ''
  const abs = Math.abs(entier)
  return `${signe}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** « 29/09/2026 », au jour de Paris. */
export function dateCsv(instant: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(instant))
}

/**
 * Un champ de texte prêt pour le fichier.
 *
 * LE FICHIER S'OUVRE DANS UN TABLEUR. Un titre de produit ou un nom qui
 * commence par « = », « + », « - » ou « @ » y serait lu comme une formule —
 * et une formule peut aller chercher ailleurs. On la neutralise d'une
 * apostrophe, comme le recommande l'OWASP. Le séparateur, les guillemets et
 * les retours à la ligne sont mis entre guillemets.
 */
export function champCsv(valeur: string | null | undefined): string {
  let v = (valeur ?? '').replace(/\r\n?|\n/g, ' ')
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[;"]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Le livre en CSV pour Excel en français : point-virgule, virgule décimale,
 * UTF-8 annoncé par son BOM (sans lui, Excel lit les accents de travers),
 * fins de ligne Windows.
 */
export function csvDuLivre(ecritures: readonly EcritureDuLivre[]): string {
  const lignes = [COLONNES_DU_LIVRE.map((c) => champCsv(c)).join(';')]
  for (const e of ecritures) {
    lignes.push(
      [
        dateCsv(e.le),
        e.operation === 'vente' ? 'Vente' : 'Remboursement',
        champCsv(e.produit),
        champCsv(e.patient),
        montantCsv(e.montantCents),
        champCsv(e.devise),
        champCsv(e.statut),
        e.reference,
        champCsv(e.commandeStripe),
        champCsv(e.paiementStripe),
      ].join(';'),
    )
  }
  return `﻿${lignes.join('\r\n')}\r\n`
}

/** « Ventes_2026-09-01_2026-09-30.csv » */
export function nomFichierVentes(du: string, au: string): string {
  return `Ventes_${du}_${au}.csv`
}

/* ------------------------------------------------------------------ *
 * Le remboursement
 * ------------------------------------------------------------------ */

/**
 * Le paiement dans le tableau de bord Stripe du cabinet — ou la liste des
 * paiements quand on ne le connaît pas. Le mode test a sa propre adresse.
 * L'identifiant n'entre dans l'adresse que s'il a la forme d'un paiement :
 * la base le garantit déjà (0058), l'écran ne s'en remet pas qu'à elle.
 */
export function lienStripe(p: { paiement: string | null | undefined; livemode: boolean | null | undefined }): string {
  const base = `https://dashboard.stripe.com/${p.livemode === false ? 'test/' : ''}payments`
  return p.paiement && /^pi_[A-Za-z0-9]+$/.test(p.paiement) ? `${base}/${p.paiement}` : base
}

/** Ce que le serveur rend d'une demande de remboursement (voir server/shop.ts). */
export interface IssueRemboursement {
  rembourse: boolean
  /** Stripe l'a accepté ; la banque ne l'a pas encore crédité. */
  enCours: boolean
  /** Déjà remboursée avant ce geste — ici, ou depuis le tableau de bord Stripe. */
  deja: boolean
  rembourseLe: string | null
  /** Non remboursée : pourquoi. */
  raison: 'droits' | 'cle' | 'refus' | 'action' | null
  paiement: string | null
  livemode: boolean | null
}

/**
 * Ce que l'écran dit d'un remboursement, et s'il faut ouvrir Stripe.
 *
 * Le remboursement ne retire rien au patient : c'est un geste d'argent, pas
 * de soin. Le dire ici, au moment où on le fait, évite de croire l'audio
 * repris — ou de le chercher.
 */
export function annonceDuRemboursement(
  issue: IssueRemboursement,
  vente: { title: string; amount_cents: number },
): { tone: 'ok' | 'warn'; text: string; lien: string | null } {
  const quoi = `la vente « ${vente.title} » (${euros(vente.amount_cents)})`
  const Quoi = `La vente « ${vente.title} » (${euros(vente.amount_cents)})`
  const lien = lienStripe(issue)
  if (issue.rembourse) {
    if (issue.deja) {
      return {
        tone: 'ok',
        text: `${Quoi} était déjà remboursée chez Stripe : elle est maintenant notée remboursée ici aussi.`,
        lien: null,
      }
    }
    return {
      tone: 'ok',
      text: issue.enCours
        ? `Remboursement de ${quoi} accepté par Stripe. La banque du patient le crédite en général sous 5 à 10 jours.`
        : `${Quoi} est remboursée. La banque du patient crédite la somme en général sous 5 à 10 jours.`,
      lien: null,
    }
  }
  const recliquer = 'Une fois le remboursement fait dans Stripe, cliquez à nouveau sur « Rembourser » : la vente sera notée remboursée, sans second remboursement.'
  if (issue.raison === 'droits') {
    return {
      tone: 'warn',
      text: `Votre clé Stripe n'a pas le droit de rembourser. Remboursez ${quoi} depuis votre tableau de bord Stripe, ou donnez à la clé l'accès « Remboursements » en écriture. ${recliquer}`,
      lien,
    }
  }
  if (issue.raison === 'cle') {
    return {
      tone: 'warn',
      text: `Votre compte Stripe n'est plus relié à la boutique : remboursez ${quoi} depuis votre tableau de bord Stripe, ou reliez-le à nouveau dans Intégrations.`,
      lien,
    }
  }
  if (issue.raison === 'action') {
    return {
      tone: 'warn',
      text: `Stripe attend une étape de plus pour rembourser ${quoi}. Terminez-la depuis votre tableau de bord Stripe.`,
      lien,
    }
  }
  return {
    tone: 'warn',
    text: `Stripe a refusé de rembourser ${quoi} — un paiement contesté, ou déjà remboursé en partie. Le détail est dans votre tableau de bord Stripe. ${recliquer}`,
    lien,
  }
}

/* ------------------------------------------------------------------ *
 * Le reçu
 * ------------------------------------------------------------------ */

/** Ce que le serveur rend pour fabriquer un reçu (voir `recuDeCommande`). */
export interface DonneesRecu {
  commandeId: string
  /** Le nom du cabinet, tel que le patient le voit dans son espace. */
  cabinet: string
  /** L'identité de facturation du cabinet, si la praticienne l'a remplie (0053). */
  praticien: string | null
  adresse: string | null
  numeroPro: string | null
  /** Le nom de la fiche qui a payé. */
  payeur: string | null
  produit: string
  montantCents: number
  devise: string
  payeLe: string
  rembourseLe: string | null
  paiementStripe: string | null
}

/** Ce que le reçu imprime, dans l'ordre — la mise en page n'invente rien. */
export interface ContenuRecu {
  titre: string
  reference: string
  emetteur: string[]
  payeur: string | null
  ligne: { date: string; designation: string; montant: string }
  total: string
  moyen: string
  paiement: string | null
  remboursement: string | null
  pied: string
}

/** « 25 septembre 2026 », au jour de Paris. */
export function dateLisible(instant: string): string {
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return instant
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

/** Un montant dans la devise de la commande : « 29,90 € ». */
export function montantLisible(cents: number, devise: string): string {
  const code = (devise || 'eur').toUpperCase()
  if (code === 'EUR') return euros(cents)
  return `${montantCsv(cents)} ${code}`
}

/**
 * Le contenu du reçu, le même des deux côtés : le patient le télécharge
 * depuis « Vos achats », la praticienne depuis la vente. Il se fabrique
 * depuis ce que la base a noté, jamais depuis l'écran.
 *
 * Aucune marque de l'application : c'est une pièce du cabinet.
 */
export function contenuDuRecu(d: DonneesRecu): ContenuRecu {
  const adresse = (d.adresse ?? '').split(/\n+/)
  const emetteur: string[] = []
  for (const l of [d.cabinet, d.praticien ?? '', ...adresse, d.numeroPro ?? '']) {
    const propre = l.trim()
    if (propre && !emetteur.includes(propre)) emetteur.push(propre)
  }
  const montant = montantLisible(d.montantCents, d.devise)
  return {
    titre: 'Reçu de paiement',
    reference: `Référence ${referenceDeCommande(d.commandeId)}`,
    emetteur,
    payeur: d.payeur?.trim() ? d.payeur.trim() : null,
    ligne: { date: dateLisible(d.payeLe), designation: d.produit, montant },
    total: montant,
    moyen: `Payé en ligne le ${dateLisible(d.payeLe)}, par l'intermédiaire de Stripe.`,
    paiement: d.paiementStripe ? `Référence du paiement : ${d.paiementStripe}` : null,
    remboursement: d.rembourseLe
      ? `Remboursé le ${dateLisible(d.rembourseLe)} : ${montant} rendus sur le moyen de paiement utilisé.`
      : null,
    pied: 'Ce reçu atteste le paiement ci-dessus. Il ne remplace pas une note d’honoraires.',
  }
}

/** « Recu_3F2A-9C1B_2026-09-12.pdf » */
export function nomFichierRecu(d: Pick<DonneesRecu, 'commandeId' | 'payeLe'>): string {
  return `Recu_${segmentDeFichier(referenceDeCommande(d.commandeId))}_${jourDeParis(d.payeLe)}.pdf`
}
