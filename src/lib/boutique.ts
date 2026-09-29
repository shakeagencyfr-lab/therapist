/**
 * La boutique, en phrases et en chiffres : ce que les deux écrans disent
 * d'un paiement, d'une reprise, d'un total. Rien ici ne parle au serveur ;
 * tout se lit et s'éprouve sans lui.
 *
 * UNE PROMESSE PAR PHRASE, ET TENUE. L'écran disait « Rouvrez cette page
 * dans un instant : elle repartira toute seule » alors que rien ne repartait,
 * et « il le sera dans un instant » d'un prélèvement qui prend des jours.
 * Chaque phrase ci-dessous dit ce que la reprise fait vraiment : elle repasse
 * à chaque ouverture de la boutique, pas avant.
 */
import { plural } from './format'

export type Ton = 'ok' | 'warn' | 'hot'

export interface Annonce {
  tone: Ton
  text: string
}

/** Ce que le serveur rend au retour de Stripe (voir `verifierPaiement`). */
export interface RetourDePaiement {
  payee: boolean
  title: string | null
  livre: boolean
  attente: 'reglement' | 'abandon' | 'echec' | null
}

/** Ce que la reprise rend (voir `verifierEnAttente`). */
export interface RepriseLue {
  confirmees: Array<{ id: string; title: string; livre: boolean; nouvelle: boolean }>
  echouees: Array<{ id: string; title: string }>
}

const REPRISE_PROMISE = 'Elle sera reprise à votre prochain passage dans la boutique.'

/** « Ancrage », « Ancrage » et « Sommeil », « A », « B » et « C ». */
export function listeDeTitres(titres: string[]): string {
  const cites = titres.map((t) => `« ${t} »`)
  if (cites.length <= 1) return cites.join('')
  return `${cites.slice(0, -1).join(', ')} et ${cites[cites.length - 1]}`
}

/** « : « Ancrage » », ou rien quand le titre manque. */
function deQuoi(titre: string | null): string {
  return titre ? ` : « ${titre} »` : ''
}

/** L'annonce du retour de Stripe, côté patient. */
export function annonceDuRetour(r: RetourDePaiement): Annonce {
  if (r.payee) {
    return r.livre
      ? { tone: 'ok', text: `Paiement confirmé${deQuoi(r.title)}. Merci.` }
      : {
          tone: 'hot',
          text: `Paiement confirmé${deQuoi(r.title)}, mais la livraison n'a pas abouti. ${REPRISE_PROMISE}`,
        }
  }
  if (r.attente === 'reglement') {
    return {
      tone: 'warn',
      text:
        `Votre banque doit encore confirmer ce paiement${deQuoi(r.title)} — cela peut prendre ` +
        'quelques jours. Il reste ci-dessous, en attente, et il est vérifié à chacune de vos ' +
        'visites dans la boutique.',
    }
  }
  if (r.attente === 'echec') {
    return { tone: 'hot', text: `Votre banque a refusé ce paiement${deQuoi(r.title)} : rien n'a été débité.` }
  }
  return { tone: 'hot', text: "Le paiement n'a pas été mené à son terme : rien n'a été débité." }
}

/**
 * L'annonce de la reprise, côté patient — ou rien, s'il n'y a rien à dire.
 *
 * `dejaAnnoncee` : la commande dont le retour de Stripe vient de parler. Le
 * retour et la reprise partent ensemble au montage ; sans ce filtre, le même
 * achat serait annoncé deux fois.
 */
export function annonceDeLaReprise(r: RepriseLue, dejaAnnoncee: string | null = null): Annonce | null {
  const confirmees = r.confirmees.filter((c) => c.id !== dejaAnnoncee)
  const echouees = r.echouees.filter((c) => c.id !== dejaAnnoncee)
  const phrases: string[] = []
  let grave = false

  const payees = confirmees.filter((c) => c.livre && c.nouvelle).map((c) => c.title)
  if (payees.length) phrases.push(`Paiement confirmé : ${listeDeTitres(payees)}. Merci.`)

  const arrivees = confirmees.filter((c) => c.livre && !c.nouvelle).map((c) => c.title)
  if (arrivees.length) {
    phrases.push(
      arrivees.length > 1
        ? `${listeDeTitres(arrivees)} sont arrivés dans votre espace.`
        : `${listeDeTitres(arrivees)} est arrivé dans votre espace.`,
    )
  }

  const bloquees = confirmees.filter((c) => !c.livre).map((c) => c.title)
  if (bloquees.length) {
    grave = true
    phrases.push(
      `Paiement confirmé : ${listeDeTitres(bloquees)}, mais la livraison n'a pas abouti. ${REPRISE_PROMISE}`,
    )
  }

  if (echouees.length) {
    grave = true
    phrases.push(
      `Votre banque a refusé le paiement de ${listeDeTitres(echouees.map((c) => c.title))} : rien n'a été débité.`,
    )
  }

  if (!phrases.length) return null
  return { tone: grave ? 'hot' : 'ok', text: phrases.join(' ') }
}

/** L'annonce de la reprise, côté cabinet — ou rien. */
export function annonceDeLaRepriseAuCabinet(r: RepriseLue): Annonce | null {
  const phrases: string[] = []
  let grave = false
  const nouvelles = r.confirmees.filter((c) => c.nouvelle)
  if (nouvelles.length) {
    phrases.push(
      `${plural(nouvelles.length, 'paiement confirmé', 'paiements confirmés')} par Stripe depuis votre dernier passage : ${listeDeTitres(nouvelles.map((c) => c.title))}.`,
    )
  }
  const bloquees = r.confirmees.filter((c) => !c.livre).map((c) => c.title)
  if (bloquees.length) {
    grave = true
    phrases.push(
      `La livraison de ${listeDeTitres(bloquees)} n'a pas abouti : elle sera reprise à la prochaine ouverture de la boutique.`,
    )
  }
  if (r.echouees.length) {
    grave = true
    phrases.push(
      `La banque a rejeté ${plural(r.echouees.length, 'paiement', 'paiements')} : ${listeDeTitres(r.echouees.map((c) => c.title))}. Rien n'est dû.`,
    )
  }
  if (!phrases.length) return null
  return { tone: grave ? 'warn' : 'ok', text: phrases.join(' ') }
}

const GRAVITE: Record<Ton, number> = { ok: 0, warn: 1, hot: 2 }

/**
 * Deux annonces en une : les deux textes, dans l'ordre, et le ton le plus
 * grave. Une livraison en échec ne doit pas s'afficher en vert parce qu'un
 * autre achat, lui, est bien arrivé.
 */
export function fusionner(a: Annonce | null, b: Annonce | null): Annonce | null {
  if (!a) return b
  if (!b) return a
  return { tone: GRAVITE[b.tone] > GRAVITE[a.tone] ? b.tone : a.tone, text: `${a.text} ${b.text}` }
}

/**
 * Le total des ventes affichées, et s'il est complet.
 *
 * L'écran lit les `limite` dernières ventes. Moins que cela : ce sont toutes
 * les ventes, et leur somme est le vrai total. Autant ou plus : il en existe
 * peut-être d'autres, et le chiffre ne vaut que pour celles-là — l'écran doit
 * le dire, au lieu d'appeler « encaissé » une somme partielle.
 *
 * Une vente remboursée (0058) reste dans la liste — elle compte dans ce qui
 * a été lu —, mais plus dans ce qui a été encaissé : l'argent est reparti.
 */
export function totalDesVentes(
  ventes: Array<{ amount_cents: number; status?: string }>,
  limite: number,
): { cents: number; complet: boolean } {
  return {
    cents: ventes.reduce((n, v) => n + (v.status === 'remboursee' ? 0 : v.amount_cents), 0),
    complet: ventes.length < limite,
  }
}

/**
 * Ce qui n'a pas pu être lu, dit en une phrase — ou rien.
 *
 * Une lecture ratée ne doit pas se déguiser en boutique vide : « Aucun
 * produit » d'une boutique pleine pousse à tout recréer en double.
 */
export function phraseDeLecture(manques: string[]): string | null {
  const liste = manques.filter(Boolean)
  if (!liste.length) return null
  const dite =
    liste.length === 1 ? liste[0] : `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`
  return `Lecture impossible pour le moment : ${dite}. Rien n'est perdu — rouvrez la boutique dans un instant.`
}

/** Des centimes à la saisie d'un prix : 990 → « 9,90 », 2900 → « 29 ». */
export function saisieDuPrix(cents: number): string {
  if (!Number.isFinite(cents)) return ''
  const euros = cents / 100
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2).replace('.', ',')
}
