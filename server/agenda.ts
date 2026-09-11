/**
 * Ce que le code d'intégration d'un agenda ne dit pas : où vit le formulaire.
 *
 * Le bloc que BookRDV donne à ses clientes porte un domaine nu dans
 * `data-url` et les paramètres du rendez-vous dans `data-query` :
 *
 *   data-url="https://son-cabinet.bookrdv.com"
 *   data-query="&t=s&uuid=5d2561e0-…"
 *
 * Recoller les deux donne la RACINE du domaine. Or, chez cet agenda, la
 * racine sert le site de réservation — accueil, logo, bouton « Prendre
 * rendez-vous » — et le formulaire vit sous un chemin. Encadrer la racine,
 * c'est donc montrer le site entier à la patiente, ce qui est exactement ce
 * qu'on voulait éviter en intégrant un widget.
 *
 * BookRDV n'est pas un moteur : c'est une marque blanche française de Trafft
 * (trafft.com), dont le code d'intégration est identique au caractère près —
 * même classe `embedded-booking`, mêmes attributs `data-*`, même `embed.js`
 * servi par le domaine du locataire. Chez Trafft, deux chemins portent le
 * formulaire, et on les essaie dans cet ordre :
 *
 *   /booking-embedded  le formulaire nu, celui qu'on veut dans un cadre ;
 *   /booking           la page de réservation, avec l'habillage de l'agenda.
 *
 * ON NE DEVINE PAS : ON DEMANDE.
 * Un chemin faux serait pire que le défaut qu'on corrige — la racine, au
 * moins, s'affiche. Avant d'écrire quoi que ce soit, le serveur interroge
 * donc l'agenda et ne retient qu'une adresse qu'il a lui-même confirmée. S'il
 * ne répond pas, ou s'il dit non, on garde l'adresse déduite du code collé :
 * l'écran des intégrations en montre l'aperçu et offre de recommencer.
 *
 * Le script du tiers n'est jamais exécuté, ni ici ni ailleurs : on ne lit
 * même pas le corps de sa réponse, seulement l'en-tête.
 */

/** Ce que le serveur retient d'un code d'intégration. */
export interface ChoixAgenda {
  /** L'adresse à encadrer chez la patiente. */
  cadre: string
  /** L'adresse à ouvrir en grand, hors du cadre. */
  page: string
  /** Vraie quand l'agenda a confirmé lui-même que cette adresse existe. */
  verifie: boolean
}

/** Le formulaire nu — sans l'habillage du site de réservation. */
const NU = '/booking-embedded'
/** La page de réservation, avec la barre du cabinet : bonne hors du cadre. */
const HABILLE = '/booking'
/**
 * Le témoin.
 *
 * Beaucoup de sites rendent la même page à tous les chemins et répondent 200
 * partout. Chez un agenda pareil, « /booking-embedded répond » ne prouve
 * rien, et on enregistrerait une adresse inexistante — un défaut PIRE que
 * celui qu'on corrige, parce qu'il ne s'affiche même pas. On demande donc
 * aussi un chemin qui ne peut pas exister : s'il répond lui aussi, les
 * réponses de cet agenda ne valent rien et on ne conclut pas.
 */
const TEMOIN = '/klaro-verification-adresse-qui-nexiste-pas'

/**
 * La signature d'un agenda Trafft.
 *
 * `t` dit le type de réservation, `uuid` désigne la prestation. Les deux
 * ensemble ne se rencontrent pas ailleurs, et c'est ce qui nous autorise à
 * proposer les chemins de Trafft plutôt que ceux d'un agenda inconnu. Sans
 * cette signature, on ne touche à rien : inventer un chemin chez un agenda
 * qu'on ne connaît pas, c'est fabriquer une page absente.
 */
export function signatureTrafft(url: URL): boolean {
  return url.searchParams.has('t') && url.searchParams.has('uuid')
}

/** L'adresse ne désigne-t-elle que le domaine, sans page ? */
export function racineNue(url: URL): boolean {
  return url.pathname === '' || url.pathname === '/'
}

/**
 * Une adresse qu'on s'autorise à interroger depuis le serveur.
 *
 * Le domaine vient de la thérapeute : c'est elle qui colle le code. Le
 * serveur, lui, tourne chez l'hébergeur et voit des adresses qu'un
 * navigateur ne voit pas. On refuse donc tout ce qui ne ressemble pas à un
 * agenda sur l'Internet public — une adresse IP nue, une machine locale, un
 * nom de réseau interne, un port choisi à la main, des identifiants glissés
 * dans l'adresse — et on ne suit aucune redirection, qui remettrait ce choix
 * entre les mains du serveur d'en face.
 */
export function adresseSondable(brut: string): boolean {
  let url: URL
  try {
    url = new URL(brut)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // « https://interne@evil.tld » : ce que lit un humain n'est pas ce que
  // joint le serveur. On refuse la forme plutôt que de l'arbitrer.
  if (url.username || url.password) return false
  // Un port explicite ne sert pas un agenda ; il sert à balayer un réseau.
  if (url.port) return false
  /* Le point final. « nas.local. » et « nas.local » désignent la même
     machine pour un résolveur, mais pas pour une comparaison de texte : sans
     cette normalisation, le point final traverse tous les refus qui suivent. */
  const hote = url.hostname.toLowerCase().replace(/\.+$/, '')
  // Une adresse IP écrite telle quelle, en v4 comme en v6, ou en entier.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) return false
  if (/^0x/.test(hote) || /^\d+$/.test(hote)) return false
  if (hote.startsWith('[') || hote.includes(':')) return false
  if (!hote.includes('.')) return false
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp|private|svc|consul)$/.test(hote)) {
    return false
  }
  return true
}

/** Ce qu'une adresse répond : son code, et où elle renvoie s'il y a lieu. */
export interface Reponse {
  code: number
  /** L'en-tête Location d'une redirection, tel quel. */
  vers: string | null
}

/** Interroge une adresse — ou rend rien, quand elle se tait. */
export type Sondeur = (url: string) => Promise<Reponse | null>

/**
 * Le sondeur réel : une requête, un en-tête, rien d'autre.
 *
 * Le corps de la réponse n'est jamais lu — il est annulé aussitôt. Ce qui
 * nous intéresse tient dans le code d'état.
 */
export const sonderParReseau: Sondeur = async (url) => {
  if (!adresseSondable(url)) return null
  try {
    const reponse = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(5_000),
    })
    void reponse.body?.cancel()
    return { code: reponse.status, vers: reponse.headers.get('location') }
  } catch {
    return null
  }
}

/**
 * Cette page existe-t-elle ?
 *
 * Un 200 le dit. Une redirection ne le dit que si elle PROLONGE le chemin
 * demandé — « /booking-embedded » vers « /booking-embedded/fr ». Tout autre
 * renvoi est un « non » déguisé, et c'est ainsi qu'un agenda traite les
 * chemins qu'il ne connaît pas : vers l'accueil, vers /404, vers /login.
 * Les tenir pour des oui ferait enregistrer une adresse qui ne montre pas le
 * formulaire — le défaut même qu'on corrige.
 */
export function pageExiste(demandee: string, reponse: Reponse | null): boolean {
  if (!reponse) return false
  if (reponse.code === 200) return true
  if (reponse.code < 300 || reponse.code >= 400) return false
  if (!reponse.vers) return false
  let depart: URL
  let cible: URL
  try {
    depart = new URL(demandee)
    cible = new URL(reponse.vers, demandee)
  } catch {
    return false
  }
  if (cible.origin !== depart.origin) return false
  const chemin = depart.pathname.replace(/\/+$/, '')
  if (!chemin) return false
  return cible.pathname === chemin || cible.pathname.startsWith(`${chemin}/`)
}

/** Le même domaine et les mêmes paramètres, à un chemin près. */
function auChemin(url: URL, chemin: string): string {
  const copie = new URL(url.toString())
  copie.pathname = chemin
  return copie.toString()
}

/**
 * L'adresse du formulaire, établie auprès de l'agenda lui-même.
 *
 * Les trois adresses sont interrogées de front : une seule attente, pas
 * trois. Ce qui revient décide — et ce qui ne revient pas laisse l'adresse
 * déduite du code collé, telle quelle.
 */
export async function adresseDuFormulaire(
  brut: string,
  sonder: Sondeur = sonderParReseau,
): Promise<ChoixAgenda> {
  const inchange = { cadre: brut, page: brut, verifie: false }

  let url: URL
  try {
    url = new URL(brut)
  } catch {
    return inchange
  }

  // Une adresse qui désigne déjà une page est celle que la thérapeute a
  // voulue : on ne la corrige pas. Un agenda qu'on ne reconnaît pas non plus.
  if (!racineNue(url) || !signatureTrafft(url)) return inchange

  const nu = auChemin(url, NU)
  const habille = auChemin(url, HABILLE)
  const temoin = auChemin(url, TEMOIN)
  const [rNu, rHabille, rTemoin] = await Promise.all([sonder(nu), sonder(habille), sonder(temoin)])

  // L'agenda dit oui à tout : ses réponses ne prouvent rien.
  if (pageExiste(temoin, rTemoin)) return inchange

  const vraiNu = pageExiste(nu, rNu)
  const vraiHabille = pageExiste(habille, rHabille)
  const cadre = vraiNu ? nu : vraiHabille ? habille : null
  if (!cadre) return inchange

  // Hors du cadre, on ouvre la page habillée quand elle existe : elle porte
  // le nom du cabinet et sa barre de navigation. Sinon, ce qu'on a.
  return { cadre, page: vraiHabille ? habille : cadre, verifie: true }
}
