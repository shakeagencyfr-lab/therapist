/**
 * Page de vente, ou application ? — la décision, prise AVANT tout chargement.
 *
 * La racine de klaroweb.site sert deux publics. Une hypnothérapeute qui
 * découvre le produit doit y lire la page de vente tout de suite ; une
 * praticienne déjà connectée doit y retrouver son espace, comme avant.
 *
 * ON NE DEMANDE PAS À SUPABASE. La reprise de session peut durer jusqu'à
 * trente secondes quand le rafraîchissement du jeton bute sur le réseau
 * (src/auth/session.tsx). Attendre sa réponse pour afficher une page de
 * vente, c'était montrer une page blanche au visiteur qui n'a précisément
 * aucune session. On regarde donc, de façon synchrone, s'il existe une
 * session STOCKÉE dans ce navigateur : sans elle, la page s'affiche aussitôt.
 * Avec elle, l'application s'ouvre et fait sa vérification habituelle — et
 * si la session stockée s'avère morte, c'est la page de vente qui revient
 * (Root, branche « déconnecté »).
 *
 * CE MODULE NE CHARGE RIEN. Il est lu par src/main.tsx avant tout le reste :
 * il n'importe ni le client Supabase, ni React, ni la moindre vue. C'est ce
 * qui permet de ne télécharger que la page, ou que l'application.
 */

export type Entree = 'vente' | 'application'

/** Ce qu'on lit de `window.location`, pour pouvoir l'éprouver sans navigateur. */
export interface Adresse {
  hote: string
  chemin: string
  recherche: string
  fragment: string
}

/**
 * Le domaine ouvert est-il celui de la plateforme — ou de ses adresses de
 * travail (Vercel, développement) ?
 *
 * LE MIROIR EXACT de `estDomainePersonnalise` (src/lib/vitrine.ts), écrit ici
 * sans l'importer : ce module-là tire le client Supabase, et la décision doit
 * se prendre avant qu'il soit téléchargé. decision.test.ts vérifie que les
 * deux disent la même chose — un domaine de cabinet ne doit jamais recevoir
 * la page de vente de son fournisseur, c'est ce que la marque blanche paie.
 */
export function estDomaineDeLaPlateforme(hote: string): boolean {
  const nom = hote.toLowerCase().replace(/:\d+$/, '')
  if (!nom || nom === 'localhost' || nom === '127.0.0.1') return true
  return /(^|\.)klaroweb\.site$/.test(nom) || /(^|\.)vercel\.app$/.test(nom)
}

/** La racine, et seulement elle : `/<identifiant>` est la vitrine d'un cabinet. */
export function estLaRacine(chemin: string): boolean {
  return chemin === '' || chemin === '/' || chemin === '/index.html'
}

/** La porte des praticiennes. */
export const CHEMIN_PORTE = '/connexion'

export function estLaPorte(chemin: string): boolean {
  return chemin === CHEMIN_PORTE || chemin === `${CHEMIN_PORTE}/`
}

/**
 * Les paramètres qu'un lien de connexion ou d'invitation dépose dans
 * l'adresse en y revenant.
 *
 * UNE INVITATION REVIENT À LA RACINE. server/invitations.ts envoie la
 * praticienne sur `PUBLIC_SITE_URL/` quand son cabinet n'a pas encore
 * d'identifiant : elle y arrive avec `#access_token=…`, sa session n'est pas
 * encore stockée — c'est le client Supabase qui va la lire dans l'adresse.
 * Lui montrer la page de vente, ce serait jeter le jeton qu'elle apporte.
 * Même chose pour un lien expiré (`#error_description=…`) : c'est la porte
 * qui sait le dire.
 *
 * Les ancres de la page (`#offres`, `#essai`) ne sont pas des paramètres : un
 * fragment sans `=` ne contient aucune de ces clés.
 */
const CLES_DE_RETOUR = ['access_token', 'refresh_token', 'error_description', 'error_code', 'code', 'token_hash']

export function retourDeConnexion(recherche: string, fragment: string): boolean {
  const lire = (brut: string) => new URLSearchParams(brut.replace(/^[?#]/, ''))
  const q = lire(recherche)
  const f = lire(fragment)
  return CLES_DE_RETOUR.some((cle) => q.has(cle) || f.has(cle))
}

/**
 * L'identifiant du projet dans l'adresse de la base : c'est lui qui nomme la
 * clé de session (`sb-<ref>-auth-token`, la convention de supabase-js).
 */
export function refDuProjet(urlDeLaBase: string | undefined | null): string | null {
  const brut = String(urlDeLaBase ?? '').trim()
  if (!brut) return null
  try {
    const premier = new URL(brut).hostname.split('.')[0]
    return premier || null
  } catch {
    return null
  }
}

/** Ce qu'on lit du stockage : de quoi le parcourir, et rien d'autre. */
export type StockageLisible = Pick<Storage, 'length' | 'key' | 'getItem'>

/**
 * Une session est-elle STOCKÉE dans ce navigateur ?
 *
 * Stockée, pas valide : on ne le saura qu'en la reprenant. Sans base
 * configurée (`ref` nul), il ne peut pas y en avoir. Un stockage qui refuse
 * d'être lu — navigation privée stricte, cookies bloqués — vaut « aucune » :
 * c'est la page de vente qui s'affiche, et le lien « Espace praticien » reste
 * à un clic.
 */
export function sessionStockee(stockage: StockageLisible | null | undefined, ref: string | null): boolean {
  if (!stockage || !ref) return false
  try {
    const valeur = stockage.getItem(`sb-${ref}-auth-token`)
    return Boolean(valeur && valeur !== 'null' && valeur !== 'undefined')
  } catch {
    return false
  }
}

/**
 * Ce qu'une adresse ouvre.
 *
 * La page de vente, UNIQUEMENT : sur le domaine de la plateforme, à sa
 * racine, sans jeton de connexion dans l'adresse, et sans session stockée.
 * Tout le reste — un domaine de cabinet, `/<identifiant>`, `/mon`,
 * `/connexion`, les pages légales — suit le chemin de toujours.
 */
export function entreeDeLAdresse(adresse: Adresse, avecSession: boolean): Entree {
  if (!estDomaineDeLaPlateforme(adresse.hote)) return 'application'
  if (!estLaRacine(adresse.chemin)) return 'application'
  if (retourDeConnexion(adresse.recherche, adresse.fragment)) return 'application'
  return avecSession ? 'application' : 'vente'
}

/** La même décision, lue dans le navigateur. Jamais d'exception : au pire, l'application. */
export function entreeDuNavigateur(urlDeLaBase: string | undefined | null): Entree {
  try {
    const { host, pathname, search, hash } = window.location
    let stockage: StockageLisible | null = null
    try {
      stockage = window.localStorage
    } catch {
      stockage = null
    }
    return entreeDeLAdresse(
      { hote: host, chemin: pathname, recherche: search, fragment: hash },
      sessionStockee(stockage, refDuProjet(urlDeLaBase)),
    )
  } catch {
    return 'application'
  }
}
