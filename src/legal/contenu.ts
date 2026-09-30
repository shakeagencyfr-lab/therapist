/**
 * Le texte des quatre pages légales de la plateforme.
 *
 * ÉCRIT D'APRÈS LE CODE, PAS D'APRÈS UN MODÈLE DE DOCUMENT. Chaque phrase dit
 * ce que le logiciel fait réellement — où tourne la base (Supabase, Paris,
 * eu-west-3), où tourne le serveur (Vercel, Paris, cdg1, vercel.json), ce qui
 * part aux États-Unis (le texte envoyé à Anthropic, server/ai.ts), ce que
 * le navigateur envoie à son éditeur (la voix, src/services/speech.ts), quand
 * la transcription s'efface (0043), ce que le patient peut faire seul depuis
 * « Moi » (src/patient/MonCompte.tsx). Quand le code change, ce texte change
 * avec lui : legal.test.ts relit les durées et les libellés d'écran qu'il cite.
 *
 * QUI ÉDITE, ET À QUEL TITRE. L'éditrice est une entrepreneuse individuelle
 * (./identite) : les conditions de vente la nomment « le Prestataire », les
 * autres pages « l'éditrice ». Les conditions de vente sont écrites pour la
 * protéger autant que la loi le permet — plafond de responsabilité,
 * obligations de moyens, prescription d'un an, destination non médicale du
 * service — sans clause que le juge réputerait non écrite : chaque limite a
 * sa contrepartie (résiliation sans frais, préavis, restitution des données),
 * parce qu'une clause déséquilibrée tombe entière (code civil, art. 1171 ;
 * code de commerce, art. L442-1).
 *
 * RIEN N'EST REVENDIQUÉ QUE LE CODE NE FAIT PAS — et d'abord aucune
 * certification d'hébergeur de données de santé. `revendicationsInterdites`
 * le tient, pour ces pages comme pour la page de vente.
 */
import { PLANS } from '@/data/reseller'
import { DOMAINE_CABINETS } from '@/lib/domaine'
import { plural } from '@/lib/format'
import { DELAIS_INACTIVITE, DELAI_PAR_DEFAUT } from '@/lib/inactivite'
import { HEBERGEUR } from '@/lib/mentionsLegales'
import { DELAI_PURGE_JOURS } from '@/lib/seance'
import { cheminLegal, type CleLegale } from './chemins'
import {
  ADRESSE,
  CODE_APE,
  COURRIEL,
  DATE_DE_CREATION,
  EDITRICE,
  EXPLOITANTE,
  NOM_COMMERCIAL,
  SIREN,
  SIRET,
  TELEPHONE,
  TVA_INTRACOMMUNAUTAIRE,
} from './identite'
import { MISE_A_JOUR } from './version'

/* ------------------------------------------------------------------ *
 * La validation
 * ------------------------------------------------------------------ */

/**
 * Plus aucun champ à compléter ?
 *
 * VRAI DEPUIS LE 30 SEPTEMBRE 2026 — ET CELA NE VEUT DIRE QUE CELA. Les
 * documents ont été complétés ce jour-là à partir des informations fournies
 * par l'exploitante et d'une recherche juridique (textes, jurisprudence,
 * articles de praticiens). Ils n'ont pas été relus par un avocat, et cette
 * relecture reste recommandée — d'abord sur l'hébergement des données de
 * santé et le classement de l'activité (la franchise de TVA, elle, est
 * confirmée par l'exploitante le 30 septembre 2026). Le drapeau dit
 * seulement qu'il ne reste aucun « [À COMPLÉTER : …] » : l'épreuve refuse un
 * document déclaré complet qui en garde un seul, et le bandeau « Document à
 * faire valider juridiquement » s'efface avec lui.
 */
export const VALIDE_JURIDIQUEMENT = true

/**
 * La date affichée en tête des quatre pages, qui est aussi la version que
 * l'on accepte (./version). À changer à chaque révision réelle — et
 * seulement alors : elle redemande l'accord de chaque compte.
 */
export { MISE_A_JOUR }

/**
 * Un champ que le code ne peut pas connaître, écrit pour se voir.
 *
 * Plus aucune page ne s'en sert depuis le 30 septembre 2026. Le mécanisme
 * reste : une information qui manquerait un jour s'écrit ainsi, plutôt que
 * d'être inventée — sur un document juridique, une fausse précision engage.
 */
export function aCompleter(quoi: string): string {
  return `[À COMPLÉTER : ${quoi}]`
}

/** Le motif d'un champ à compléter, tel que l'écran le repère pour le surligner. */
export const MOTIF_A_COMPLETER = /\[À COMPLÉTER : [^\]]+\]/g

export interface Morceau {
  texte: string
  aCompleter: boolean
}

/**
 * Un texte coupé entre ce qui est écrit et ce qui reste à compléter.
 *
 * L'écran surligne les seconds ; un texte sans crochet revient en un seul
 * morceau. Aucun morceau vide : un <mark> sans rien dedans ne se voit pas,
 * et c'est précisément ce qu'on veut éviter.
 */
export function morceaux(texte: string): Morceau[] {
  const sortie: Morceau[] = []
  let depuis = 0
  for (const trouve of texte.matchAll(MOTIF_A_COMPLETER)) {
    const debut = trouve.index ?? 0
    if (debut > depuis) sortie.push({ texte: texte.slice(depuis, debut), aCompleter: false })
    sortie.push({ texte: trouve[0], aCompleter: true })
    depuis = debut + trouve[0].length
  }
  if (depuis < texte.length) sortie.push({ texte: texte.slice(depuis), aCompleter: false })
  return sortie
}

/* ------------------------------------------------------------------ *
 * La forme des pages
 * ------------------------------------------------------------------ */

export interface Prestataire {
  nom: string
  /** Ce qu'il fait pour le service. */
  role: string
  /** Où les données sont traitées, et d'où la société relève. */
  lieu: string
  /** Ce qui lui parvient — et ce qui ne lui parvient pas. */
  donnees: string
}

export type Bloc =
  | { type: 'paragraphe'; texte: string; lien?: { libelle: string; href: string } }
  | { type: 'liste'; elements: string[] }
  /** Des couples terme / valeur : une durée par donnée, un rôle par acteur. */
  | { type: 'lignes'; lignes: Array<{ terme: string; valeur: string }> }
  | { type: 'prestataires'; prestataires: Prestataire[] }
  /** Ce qu'il ne faut pas manquer en survolant la page. */
  | { type: 'encart'; texte: string }

export interface SectionLegale {
  /** L'ancre de la section : stable, on peut y renvoyer depuis ailleurs. */
  id: string
  titre: string
  blocs: Bloc[]
}

export interface PageLegale {
  cle: CleLegale
  chemin: string
  titre: string
  /** La description du document, pour l'onglet et les moteurs. */
  description: string
  /** Le paragraphe d'ouverture : à qui s'adresse la page, et ce qu'elle dit. */
  chapo: string
  sections: SectionLegale[]
}

/* ------------------------------------------------------------------ *
 * Ce que les pages citent du code
 * ------------------------------------------------------------------ */

/** « 7 jours » : la purge des transcriptions abandonnées (0043, src/lib/seance.ts). */
const PURGE = plural(DELAI_PURGE_JOURS, 'jour', 'jours')

/** « 15, 30 ou 60 minutes » : les délais proposés dans « Mon compte » (0, « jamais », n'est pas un délai). */
const DELAIS = (() => {
  const d = DELAIS_INACTIVITE.filter((m) => m > 0).map(String)
  return d.length > 1 ? `${d.slice(0, -1).join(', ')} ou ${d.at(-1)} minutes` : `${d[0] ?? ''} minutes`
})()

/** Les libellés d'écran que les pages citent : legal.test.ts les cherche dans le code. */
export const LIBELLES_CITES = {
  ongletPatient: 'Moi',
  exportJournal: 'Télécharger mon journal',
  suppressionCompte: 'Supprimer mon compte',
  autresAppareils: 'Déconnecter mes autres appareils',
  exportDossier: 'Télécharger le dossier (PDF)',
} as const

const L = LIBELLES_CITES

/** « Essentiel, Cabinet et Réseau » : les offres du catalogue (src/data/reseller.ts). */
const NOMS_DES_OFFRES = (() => {
  const noms = PLANS.map((p) => p.label)
  return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : (noms[0] ?? '')
})()

/**
 * L'hébergeur de la base, tel que la loi demande de le désigner (LCEN, art. 1-1).
 *
 * L'ADRESSE EST CELLE QUE LA SOCIÉTÉ DONNE ELLE-MÊME — dans ses conditions
 * d'utilisation et son accord de sous-traitance (Supabase Pte. Ltd.,
 * immatriculée à Singapour sous le n° 202005760H). AUCUN NUMÉRO N'EST
 * INVENTÉ : au 30 septembre 2026, ni son site ni ses documents juridiques
 * n'en publient ; les numéros qui circulent sur des annuaires tiers ne sont
 * pas les siens de source sûre. La phrase le dit, et donne à la place les
 * moyens de la joindre qu'elle publie : sa page de contact, et l'adresse
 * électronique que ses conditions désignent pour les questions juridiques.
 */
const HEBERGEUR_BASE =
  'Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513. La société ne publie aucun numéro de téléphone : elle se joint par courrier à cette adresse, par sa page de contact, https://supabase.com/support, et, pour les questions juridiques, par courriel à legal@supabase.io'

/**
 * Les délais que les pages promettent, écrits une fois. Les quatre pages se
 * répondent : une durée dite deux fois doit être la même deux fois.
 */
const RESTITUTION = 'trois mois'
const EFFACEMENT = 'trente jours'
const ALERTE_VIOLATION = 'quarante-huit heures'
const PREAVIS = 'trente jours'

/* ------------------------------------------------------------------ *
 * Politique de confidentialité
 * ------------------------------------------------------------------ */

const CONFIDENTIALITE: PageLegale = {
  cle: 'confidentialite',
  chemin: cheminLegal('confidentialite'),
  titre: 'Politique de confidentialité',
  description:
    'Ce que Klaro fait des données des cabinets et des personnes qu’ils suivent : qui en répond, où elles sont hébergées, combien de temps elles restent, et comment exercer vos droits.',
  chapo:
    'Klaro est un outil de suivi entre les séances, utilisé par des cabinets d’hypnothérapie et par les personnes qu’ils accompagnent. Cette page décrit ce que le logiciel fait réellement des données — y compris ce qui quitte l’Union européenne — et comment exercer vos droits.',
  sections: [
    {
      id: 'en-bref',
      titre: 'En bref',
      blocs: [
        {
          type: 'liste',
          elements: [
            'Les données de votre suivi sont celles de votre cabinet : c’est lui qui en répond, en tant que responsable du traitement. L’éditrice de Klaro les héberge et les traite pour son compte, selon ses instructions, en tant que sous-traitant.',
            'La base de données et le serveur de l’application fonctionnent à Paris.',
            'Pour rédiger une proposition — brouillon de note, exercice, hypnose —, le texte utile est envoyé à Anthropic, aux États-Unis : sous le compte de la plateforme ou du revendeur du cabinet, ou sous celui du cabinet s’il utilise encore sa propre clé. La voix, elle, ne parvient jamais à Klaro : c’est le navigateur qui la transcrit.',
            `La transcription d’une séance est effacée à l’envoi de la note, et d’office au bout de ${PURGE}.`,
            'Le journal reste privé tant que la personne suivie ne partage pas une page. L’équipe commerciale ne voit jamais un dossier.',
            'Aucune publicité, aucune mesure d’audience, aucune revente de données, aucun entraînement de modèle d’IA sur vos données.',
            'Aucune certification d’hébergeur de données de santé (HDS) n’est revendiquée.',
          ],
        },
      ],
    },
    {
      id: 'roles',
      titre: 'Qui répond de quoi',
      blocs: [
        { type: 'paragraphe', texte: 'Trois acteurs se partagent le service, et ils n’ont pas les mêmes responsabilités.' },
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Le cabinet',
              valeur:
                'La ou les thérapeutes qui vous suivent. Le cabinet est responsable du traitement des données de ses patients : il décide de ce qu’il note, de ce qu’il garde et de ce qu’il efface, et c’est à lui que s’adressent d’abord les demandes des personnes qu’il suit.',
            },
            {
              terme: 'L’éditrice de Klaro',
              valeur: `${EDITRICE}, ${ADRESSE} (voir les mentions légales). Pour les données des patients, l’éditrice est sous-traitante du cabinet (RGPD, article 28) — ou sous-traitante ultérieure, quand le cabinet a souscrit par un revendeur : elle les héberge, les protège et les traite uniquement pour faire fonctionner le service, selon les instructions du cabinet, et ne s’en sert à aucune autre fin. Pour les comptes professionnels, la facturation, les jetons, la sécurité de la plateforme et les demandes d’essai, elle est responsable du traitement.`,
            },
            {
              terme: 'Le revendeur',
              valeur:
                'L’entreprise qui a ouvert le cabinet et lui vend son abonnement, quand il n’a pas souscrit directement auprès de l’éditrice. Elle voit le nom du cabinet, les adresses de ses thérapeutes, l’abonnement, les jetons et des compteurs agrégés — jamais un nom de patient, une note, une transcription ni une page de journal : la base ne lui en ouvre aucun chemin. Pour les données des patients, le revendeur est sous-traitant du cabinet, et l’éditrice sa sous-traitante ultérieure ; pour sa relation commerciale avec ses clients, il est responsable de ses propres traitements. Quand les rédactions passent par sa clé, il est aussi le client d’Anthropic.',
            },
          ],
        },
        {
          type: 'encart',
          texte:
            'Vous êtes suivi ou suivie par un cabinet ? Pour toute question sur votre dossier, adressez-vous d’abord à votre thérapeute : c’est lui ou elle qui le tient. Une demande qui nous parvient directement est transmise au cabinet, que nous aidons à y répondre.',
        },
      ],
    },
    {
      id: 'donnees',
      titre: 'Les données traitées',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Klaro ne recueille que ce que ses écrans demandent et ce que ses utilisateurs y écrivent. Une partie de ces données sont des données de santé au sens du RGPD (article 9).',
        },
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Personnes suivies',
              valeur:
                'Le nom et l’adresse électronique inscrits par le cabinet ; le dossier de suivi (séances, synthèses, notes et anamnèse de la thérapeute, profil, parcours d’exercices, audios, hypnoses) ; ce que la personne écrit elle-même — son journal, ses mots à sa thérapeute, sa note du soir, ses réponses aux exercices ; ses achats dans la boutique du cabinet ; l’inscription de son téléphone aux rappels, si elle l’active.',
            },
            {
              terme: 'Séances enregistrées',
              valeur:
                'Le texte de la séance (sa transcription) et les notes prises pendant celle-ci, la date du consentement et, s’il y a lieu, celle de son retrait. Jamais le son.',
            },
            {
              terme: 'Thérapeutes et équipes',
              valeur:
                'Nom, adresse électronique, cabinet et rôle ; les réglages du cabinet (marque, site, programmes, boutique) ; les clés qu’il confie (analyse, paiement, messagerie), chiffrées par le serveur et jamais renvoyées au navigateur ; les notes d’honoraires émises ; les jetons reçus, achetés et consommés ; les retours donnés sur les propositions de l’IA et les préférences de rédaction que le cabinet choisit de faire retenir ; l’acceptation des conditions générales, avec sa date et sa version.',
            },
            {
              terme: 'Visiteurs de la page d’accueil',
              valeur:
                'Pour une demande d’essai : nom, adresse électronique, téléphone s’il est donné, cabinet, ville, nombre de patients, offre souhaitée, message, la date de l’accord donné pour être recontacté et la version des conditions générales acceptées.',
            },
            {
              terme: 'Données techniques',
              valeur:
                'Le journal des gestes — qui a fait quoi, et quand, sans jamais le contenu d’un dossier —, le compte des rédactions demandées à l’IA (leur type, leur taille et leur coût, jamais leur contenu), les traces de connexion tenues par le service d’authentification, et ce que le navigateur garde pour que l’application fonctionne (voir plus bas).',
            },
          ],
        },
      ],
    },
    {
      id: 'finalites',
      titre: 'Pourquoi, et sur quelle base',
      blocs: [
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Le suivi entre les séances',
              valeur:
                'Faire fonctionner l’espace du cabinet et celui de la personne suivie : c’est le service que le cabinet a choisi, et c’est lui qui en fixe la base légale — pour les données de santé, en règle générale le consentement explicite de la personne. L’enregistrement d’une séance, lui, ne commence jamais sans le consentement de la personne, recueilli à l’écran et horodaté.',
            },
            {
              terme: 'L’analyse du texte',
              valeur:
                'Rédiger, à la demande du cabinet, un brouillon de note, un profil, un exercice, une hypnose ou des affirmations, et les réviser quand il le demande. Rien ne part sans cette demande — un geste à l’écran, ou le renouvellement des affirmations chaque lundi quand le cabinet l’a activé. Ce qui revient est une proposition que la thérapeute relit avant de s’en servir — sauf ces affirmations renouvelées automatiquement, que le cabinet a choisi de faire publier sans relecture préalable, et qu’il peut corriger à tout moment. Ni l’éditrice ni Anthropic ne se servent de ces textes pour entraîner un modèle.',
            },
            {
              terme: 'Les retours sur l’IA',
              valeur:
                'Un pouce levé ou baissé sous une proposition, et la demande de révision qui l’accompagne : ils servent à corriger cette proposition et, si le cabinet le choisit, à retenir sa préférence pour ses rédactions suivantes. Ces préférences sont propres au cabinet, qui peut les effacer à tout moment.',
            },
            {
              terme: 'Les rappels',
              valeur:
                'Faire arriver sur le téléphone de la personne suivie les rappels que programme son cabinet, et celui du soir qu’elle a choisi. Elle les active et les coupe elle-même.',
            },
            {
              terme: 'La boutique',
              valeur:
                'Encaisser, sur le compte Stripe du cabinet, les produits qu’il propose, et livrer ce qui a été payé. Le cabinet est le vendeur, et tient ses propres obligations comptables.',
            },
            {
              terme: 'Les comptes professionnels',
              valeur:
                'Ouvrir et faire fonctionner l’espace des thérapeutes et des revendeurs, tenir le compte des jetons et facturer l’abonnement : c’est l’exécution du contrat (RGPD, article 6-1-b) ; conserver les factures, une obligation légale (article 6-1-c).',
            },
            {
              terme: 'La preuve de l’accord',
              valeur:
                'Garder la trace de l’acceptation des conditions générales — qui, quelle version, quand : c’est l’intérêt légitime de l’éditrice à pouvoir prouver le contrat (article 6-1-f).',
            },
            {
              terme: 'La sécurité',
              valeur:
                'Garder la trace des gestes sensibles, limiter les tentatives de mot de passe, écarter les robots des formulaires : c’est l’intérêt légitime de l’éditrice et des cabinets à protéger les dossiers (article 6-1-f).',
            },
            {
              terme: 'Les demandes d’essai',
              valeur:
                'Recontacter la personne qui a demandé un essai, à sa demande et avec l’accord qu’elle donne dans le formulaire (articles 6-1-a et 6-1-b).',
            },
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'Klaro ne fait ni publicité, ni profilage commercial, ni mesure d’audience, et ne vend aucune donnée. Les données des patients ne servent qu’au suivi que le cabinet a choisi.',
        },
      ],
    },
    {
      id: 'destinataires',
      titre: 'Qui y a accès',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Dans l’application, chaque cabinet ne voit que ses propres dossiers : ce cloisonnement est appliqué par la base elle-même, pas seulement par les écrans. Une personne suivie voit ses exercices, ses audios, son journal et sa courbe — mais ni les notes de sa thérapeute, ni son profil.',
        },
        {
          type: 'paragraphe',
          texte:
            'Le journal est privé : le cabinet ne lit que les pages que la personne choisit de partager. La note du soir, en revanche, lui est toujours visible.',
        },
        {
          type: 'paragraphe',
          texte: `Seuls disposent d’un accès technique à la base — un accès d’administration, nécessaire à sa maintenance : ${EXPLOITANTE} et le prestataire technique qui développe et administre la plateforme pour le compte de l’éditrice, lié par un engagement de confidentialité ; ce prestataire est un sous-traitant ultérieur, désigné comme tel dans l’accord de sous-traitance, et son identité et ses coordonnées sont communiquées à tout cabinet qui en fait la demande. Ils ne consultent pas les dossiers. Un accès exceptionnel au contenu d’un dossier n’a lieu que sur la demande écrite du cabinet — pour l’aider à résoudre un incident — ou pour répondre à une obligation légale ; il se limite au strict nécessaire et il est consigné : qui, quand, pourquoi.`,
        },
        { type: 'paragraphe', texte: 'Le service s’appuie sur les prestataires suivants.' },
        {
          type: 'prestataires',
          prestataires: [
            {
              nom: 'Supabase Pte. Ltd.',
              role: 'Base de données, fichiers (audios, logos, photos) et connexion aux comptes.',
              lieu: 'Région de Paris (eu-west-3), sur l’infrastructure d’Amazon Web Services. Société établie à Singapour.',
              donnees: 'Toutes les données de l’application.',
            },
            {
              nom: 'Vercel Inc.',
              role: 'Hébergement de l’application et de son serveur.',
              lieu: 'Serveur exécuté à Paris (cdg1) ; pages distribuées par son réseau mondial. Société établie aux États-Unis.',
              donnees:
                'Ce qui transite par le serveur le temps d’une requête. Les journaux du serveur ne contiennent aucun contenu de dossier.',
            },
            {
              nom: 'Anthropic, PBC',
              role: 'Rédaction des propositions de l’IA (brouillons de note, profil, exercices, hypnoses, affirmations, révisions demandées) : sous le compte de la plateforme ou du revendeur quand le cabinet utilise des jetons, sous le compte du cabinet quand il utilise sa propre clé.',
              lieu: 'États-Unis. Chaque rédaction est un transfert hors de l’Union européenne.',
              donnees:
                'Pour une note de séance : la transcription et les notes prises pendant la séance. Pour les autres rédactions : le nom inscrit sur la fiche, le programme, l’assiduité, les notes du soir, les exercices, les pages de journal partagées, le profil et, pour l’actualiser, la dernière synthèse avec un extrait de la transcription. Pour une révision : la proposition à reprendre, la remarque de la thérapeute et les préférences retenues par le cabinet. Jamais une page de journal privée.',
            },
            {
              nom: 'Stripe',
              role: 'Paiement des achats dans la boutique d’un cabinet, sur le compte Stripe de ce cabinet ; et, lorsqu’ils se paient en ligne, de l’abonnement, des recharges de jetons et de l’option Hypnose, sur le compte de l’éditrice ou du revendeur.',
              lieu: 'Selon le contrat que le titulaire du compte a passé avec Stripe.',
              donnees:
                'Le produit, son prix et un identifiant interne. La carte et l’adresse de paiement se saisissent chez Stripe : Klaro ne les voit jamais.',
            },
            {
              nom: 'Service d’envoi des courriels',
              role: 'Liens et codes de connexion, invitations, notes d’honoraires adressées aux patients : le service d’envoi de la plateforme, ou le serveur de messagerie du cabinet quand il en a réglé un.',
              lieu: 'Resend, Inc., société établie aux États-Unis, pour les courriels de la plateforme ; le serveur choisi par le cabinet, pour les siens.',
              donnees:
                'L’adresse électronique, le nom du cabinet et le lien ou le code ; pour une note d’honoraires, la note elle-même. Jamais le contenu d’un dossier.',
            },
            {
              nom: 'hCaptcha (Intuition Machines, Inc.)',
              role: 'Vérification anti-robot sur les formulaires de connexion et de demande d’essai, lorsqu’elle est activée.',
              lieu: 'États-Unis.',
              donnees: 'Des signaux techniques du navigateur, le temps de la vérification.',
            },
            {
              nom: 'L’agenda de réservation du cabinet',
              role: 'Prise de rendez-vous, par un lien ou dans un cadre de l’espace patient, quand le cabinet en a branché un.',
              lieu: 'Selon le prestataire choisi par le cabinet.',
              donnees:
                'Ce que la personne y saisit relève de ce prestataire et du cabinet : Klaro n’en reçoit rien.',
            },
            {
              nom: 'SerpApi, ou Google',
              role: 'Lecture de la fiche Google publique d’un cabinet, à sa demande, pour préremplir son site.',
              lieu: 'États-Unis.',
              donnees: 'Les informations publiques de l’établissement. Aucune donnée de patient.',
            },
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'Deux services, enfin, ne sont pas des prestataires de l’éditrice : ce sont ceux de l’éditeur du navigateur ou du téléphone que chacun a choisi. Ils n’interviennent que sur un geste de l’utilisateur, selon les conditions propres à cet éditeur, et l’éditrice n’a pas de contrat avec eux.',
        },
        {
          type: 'prestataires',
          prestataires: [
            {
              nom: 'La reconnaissance vocale du navigateur',
              role: 'Transcrire la voix, seulement quand on lance la dictée — dans les champs où la thérapeute écrit — ou l’enregistrement d’une séance : Google pour Chrome, Microsoft pour Edge, Apple pour Safari.',
              lieu: 'Selon l’éditeur du navigateur, souvent hors de l’Union européenne.',
              donnees:
                'Le son de la voix, que le navigateur lui envoie pour le transcrire : Klaro ne reçoit jamais le son, seulement le texte. C’est au cabinet de décider s’il dicte des contenus cliniques ; s’il n’accepte pas que la voix parte chez l’éditeur du navigateur, il ne dicte aucune donnée de santé qui permette d’identifier une personne.',
            },
            {
              nom: 'Le service de notification du téléphone',
              role: 'Acheminer les rappels, seulement sur un téléphone où l’on a autorisé les notifications : Google, Apple, Mozilla ou Microsoft, selon l’appareil.',
              lieu: 'Selon le fabricant.',
              donnees:
                'Un message chiffré pour ce seul téléphone : le service le porte sans pouvoir le lire. Un rappel qui n’a pas pu être remis dans les deux heures est abandonné.',
            },
          ],
        },
      ],
    },
    {
      id: 'transferts',
      titre: 'Hors de l’Union européenne',
      blocs: [
        { type: 'paragraphe', texte: 'Les données sont stockées à Paris. Voici ce qui peut quitter l’Union européenne :' },
        {
          type: 'liste',
          elements: [
            'le texte envoyé à Anthropic, aux États-Unis, pour chaque rédaction demandée à l’IA — c’est le seul transfert qui porte le contenu d’un dossier ;',
            'le son de la voix, quand on lance la dictée ou l’enregistrement d’une séance, chez l’éditeur du navigateur ;',
            'les rappels, chiffrés pour le seul téléphone qui les reçoit, qui transitent par le service de notification de son fabricant ;',
            'les courriels de la plateforme, envoyés par Resend, aux États-Unis ;',
            'les signaux de vérification anti-robot, quand hCaptcha est activé.',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'Par ailleurs, Vercel est une société établie aux États-Unis et Supabase à Singapour, même lorsque leurs serveurs sont à Paris : leurs équipes peuvent intervenir sur les systèmes depuis l’étranger. Ces transferts reposent sur les clauses contractuelles types de la Commission européenne, intégrées aux contrats de ces prestataires, et, lorsque le prestataire y adhère, sur le cadre de protection des données UE–États-Unis (Data Privacy Framework). Le son de la voix et les rappels, eux, relèvent des conditions de l’éditeur du navigateur ou du fabricant du téléphone, avec qui l’éditrice n’a pas de contrat.',
        },
        {
          type: 'paragraphe',
          texte: `Chez Anthropic, les requêtes relèvent des conditions commerciales de son service, qui intègrent les clauses contractuelles types. Anthropic n’entraîne pas ses modèles sur ces données. Selon ses conditions en vigueur au ${MISE_A_JOUR}, les requêtes et les réponses sont conservées au plus 30 jours — pour la plupart des modèles, pas du tout ; seul un contenu signalé par ses contrôles de sécurité peut l’être jusqu’à deux ans. Quand le cabinet utilise sa propre clé, ce sont les conditions qu’il a acceptées en la créant qui s’appliquent.`,
        },
      ],
    },
    {
      id: 'conservation',
      titre: 'Combien de temps',
      blocs: [
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Transcription d’une séance',
              valeur: `Effacée à l’envoi de la note. Si la note n’est jamais envoyée, effacée d’office ${PURGE} après la séance — une purge passe chaque nuit. Retirer son consentement avant l’envoi efface aussitôt la transcription, les notes et le brouillon de la séance ; il ne reste que la date du consentement et celle de son retrait.`,
            },
            {
              terme: 'Dossier de suivi',
              valeur:
                'Tant que le cabinet le conserve : c’est lui qui en fixe la durée, selon ses obligations. Clore un suivi referme l’espace de la personne sans rien effacer ; supprimer la fiche efface définitivement le dossier, les séances, les notes, les exercices, les audios, le journal et les hypnoses. Nous recommandons aux cabinets de ne pas garder un dossier au-delà de la durée que leur profession impose, s’il y en a une, et sinon pas plus de cinq ans après le dernier contact avec la personne.',
            },
            {
              terme: 'Notes d’honoraires',
              valeur:
                'Gardées au registre du cabinet, même après la suppression de la fiche : ce sont des pièces comptables, à conserver six ans au moins (livre des procédures fiscales, article L102 B).',
            },
            {
              terme: 'Journal de la personne suivie',
              valeur: 'Jusqu’à ce qu’elle supprime son compte, ou que le cabinet supprime sa fiche.',
            },
            {
              terme: 'Texte en cours d’écriture',
              valeur: 'Gardé dans l’onglet du navigateur seulement, et effacé à sa fermeture comme à la déconnexion.',
            },
            {
              terme: 'Compte',
              valeur: 'Jusqu’à sa suppression. Une personne suivie peut supprimer le sien à tout moment, depuis son espace.',
            },
            {
              terme: 'Acceptation des conditions',
              valeur: 'Tant que le compte existe : elle prouve l’accord donné, version par version.',
            },
            {
              terme: 'Préférences retenues pour l’IA',
              valeur: 'Jusqu’à ce que le cabinet les efface, et au plus tard avec ses autres données à la fin du contrat.',
            },
            { terme: 'Invitations', valeur: 'Valables trente jours, puis sans effet.' },
            {
              terme: 'Essais de mot de passe manqués',
              valeur:
                'Quand on change de mot de passe, les essais manqués de l’ancien sont gardés pour freiner les tentatives répétées : effacés dès le bon mot de passe, et au-delà d’un jour au passage suivant.',
            },
            {
              terme: 'Inscription aux rappels',
              valeur:
                'Retirée à la déconnexion du téléphone, à la suppression du compte, ou quand le service du navigateur la déclare expirée.',
            },
            {
              terme: 'Demandes d’essai',
              valeur:
                'Jusqu’à ce que l’équipe qui les reçoit les efface, et au plus trois ans après le dernier contact avec la personne qui a fait la demande.',
            },
            {
              terme: 'Journal des gestes',
              valeur: 'Un an au plus.',
            },
            {
              terme: 'Comptes professionnels et facturation',
              valeur:
                'Le temps du contrat ; les factures, ensuite, dix ans (code de commerce, article L123-22).',
            },
            {
              terme: 'Cabinet fermé',
              valeur: `Fermer un cabinet referme les espaces de ses patients et sa page publique, sans rien effacer : la thérapeute garde l’accès à ses dossiers pour les relire et les exporter. À la fin du contrat, les données restent exportables pendant ${RESTITUTION}, puis sont effacées dans les ${EFFACEMENT} qui suivent ; les sauvegardes les effacent à leur tour au terme de leur rotation.`,
            },
            {
              terme: 'Sauvegardes',
              valeur:
                'Celles que prévoit l’offre souscrite auprès de l’hébergeur de la base : quotidiennes quand l’offre en comporte, chacune écrasée au terme de sa rotation, de quelques jours. Aucune autre copie de la base n’est gardée : chaque cabinet conserve ses propres exports.',
            },
          ],
        },
      ],
    },
    {
      id: 'securite',
      titre: 'Sécurité',
      blocs: [
        {
          type: 'liste',
          elements: [
            'Les échanges avec l’application sont chiffrés (HTTPS).',
            'Chaque cabinet est cloisonné dans la base elle-même ; le revendeur n’a aucun chemin de lecture vers les données de santé.',
            'La connexion se fait par un lien ou un code reçu par courriel ; un mot de passe est facultatif.',
            `Côté cabinet et revendeur, la session se ferme d’elle-même sur un appareil laissé sans activité — au bout de ${DELAI_PAR_DEFAUT} minutes par défaut, réglable dans « Mon compte » : ${DELAIS}, ou jamais —, et une double authentification (le code d’une application) peut s’ajouter à la connexion.`,
            `Depuis « ${L.ongletPatient} », une personne suivie peut fermer d’un geste sa session sur tous ses autres appareils (« ${L.autresAppareils} »).`,
            'Les clés confiées par les cabinets et les revendeurs — analyse, paiement, messagerie — sont chiffrées avant d’être enregistrées et ne reviennent jamais au navigateur.',
            'Les pages de l’application refusent de s’afficher dans le cadre d’un autre site, à l’exception du champ de connexion que les cabinets posent sur le leur.',
            'Sur l’écran verrouillé, un rappel ne dit par défaut ni ce qu’il rappelle, ni qui l’envoie : il se lit en ouvrant l’espace. La personne suivie peut choisir de l’y afficher en clair.',
            'Le journal des gestes et les journaux du serveur ne contiennent jamais le contenu d’un dossier.',
            `En cas de violation de données, l’éditrice prévient l’administrateur du cabinet concerné dans les ${ALERTE_VIOLATION} après en avoir pris connaissance, à l’adresse de son compte, pour qu’il puisse la notifier à la CNIL et, s’il y a lieu, aux personnes ; elle l’aide ensuite à la documenter et à la contenir. Pour signaler un incident : ${COURRIEL}.`,
          ],
        },
        {
          type: 'encart',
          texte:
            'Aucune certification d’hébergeur de données de santé (HDS) n’est revendiquée. Ce qui précède décrit ce que fait le logiciel, ni plus ni moins.',
        },
      ],
    },
    {
      id: 'droits',
      titre: 'Vos droits, et comment les exercer',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Vous pouvez demander l’accès à vos données, leur rectification, leur effacement ou la limitation de leur traitement, vous opposer à celui-ci, en recevoir une copie dans un format réutilisable, retirer un consentement donné, et définir des directives sur leur sort après votre décès.',
        },
        { type: 'paragraphe', texte: 'Vous êtes suivi ou suivie par un cabinet :' },
        {
          type: 'liste',
          elements: [
            `Votre dossier — le consulter, le corriger, l’effacer : adressez-vous à votre thérapeute. Le cabinet peut en télécharger une copie complète — « ${L.exportDossier} » — pour vous la remettre, et supprimer votre fiche.`,
            `Votre journal : depuis « ${L.ongletPatient} », « ${L.exportJournal} » en garde une copie chez vous, à tout moment.`,
            `Fermer votre espace : depuis « ${L.ongletPatient} », « ${L.suppressionCompte} ». Votre compte est supprimé et votre journal effacé ; le dossier de suivi reste au cabinet, à qui vous pouvez en demander l’effacement.`,
            'L’enregistrement d’une séance : vous pouvez en demander l’arrêt ou l’effacement à tout moment, sans avoir à vous justifier — il suffit de le dire à votre thérapeute.',
            'Les rappels : vous les activez et les coupez vous-même, depuis votre espace ou les réglages de votre téléphone.',
          ],
        },
        {
          type: 'paragraphe',
          texte: `Vous êtes thérapeute ou membre d’un revendeur, ou vous avez demandé un essai : écrivez à ${COURRIEL}, ou par courrier à ${EDITRICE}, ${ADRESSE}.`,
        },
        {
          type: 'paragraphe',
          texte:
            'Une réponse est apportée dans un délai d’un mois, qui peut être prolongé de deux mois pour une demande complexe (RGPD, article 12).',
        },
        {
          type: 'paragraphe',
          texte:
            'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la Commission nationale de l’informatique et des libertés (CNIL) :',
          lien: { libelle: 'cnil.fr', href: 'https://www.cnil.fr' },
        },
      ],
    },
    {
      id: 'navigateur',
      titre: 'Cookies et stockage dans le navigateur',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Klaro ne dépose aucun cookie publicitaire ni de mesure d’audience. Il garde dans votre navigateur le strict nécessaire au fonctionnement du service, qui ne demande pas de consentement :',
        },
        {
          type: 'liste',
          elements: [
            'votre session de connexion, pour ne pas vous redemander votre adresse à chaque visite ;',
            'l’heure de votre dernière activité, pour la déconnexion automatique ;',
            'de petites préférences, comme une proposition que vous avez remise à plus tard ;',
            'le texte que vous êtes en train d’écrire, dans l’onglet seulement ;',
            'dans l’espace patient, un « service worker » qui ne sert qu’à afficher les rappels et ne garde aucune page en réserve.',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'Les polices de caractères sont servies par nos serveurs : aucune requête ne part chez un tiers pour les afficher. Quand la vérification anti-robot est activée, hCaptcha peut déposer ses propres traceurs techniques, le temps de la vérification.',
        },
      ],
    },
    {
      id: 'modifications',
      titre: 'Mises à jour de cette politique',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Cette politique suit le logiciel : quand il change ce qu’il fait des données, elle change avec lui, et la date en tête de page aussi. Un changement important est annoncé aux cabinets au moins ${PREAVIS} avant de s’appliquer, par courriel ou dans leur espace.`,
        },
        {
          type: 'paragraphe',
          texte: 'L’éditrice, son adresse et les hébergeurs sont indiqués dans les',
          lien: { libelle: 'mentions légales', href: cheminLegal('mentions') },
        },
      ],
    },
  ],
}

/* ------------------------------------------------------------------ *
 * Conditions générales d'utilisation
 * ------------------------------------------------------------------ */

const CGV = cheminLegal('cgv')

const CONDITIONS: PageLegale = {
  cle: 'conditions',
  chemin: cheminLegal('conditions'),
  titre: 'Conditions générales d’utilisation',
  description:
    'Les règles d’utilisation de Klaro, pour les cabinets d’hypnothérapie, les personnes qu’ils suivent et leurs revendeurs.',
  chapo:
    'Klaro relie un cabinet d’hypnothérapie et les personnes qu’il accompagne, entre les séances. Ces conditions disent ce que le service fait, ce qu’il ne fait pas, et ce que chacun s’engage à respecter en l’utilisant.',
  sections: [
    {
      id: 'objet',
      titre: 'Objet',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Les présentes conditions générales d’utilisation régissent l’utilisation de la plateforme Klaro, accessible à l’adresse ${DOMAINE_CABINETS} et aux adresses des cabinets qui l’utilisent, éditée par ${EDITRICE} (« l’éditrice »).`,
        },
        {
          type: 'paragraphe',
          texte:
            'Elles s’appliquent à toute personne qui s’y connecte : thérapeutes et membres d’un cabinet, personnes suivies, membres d’un revendeur. L’abonnement d’un cabinet — son prix, sa durée, sa résiliation, les jetons d’IA — relève des conditions générales de vente, qui comprennent en annexe l’accord de sous-traitance des données (RGPD, article 28). Quand le cabinet a souscrit par un revendeur, c’est ce revendeur qui lui vend l’abonnement, et il doit en reprendre les garanties. Voir les',
          lien: { libelle: 'conditions générales de vente', href: CGV },
        },
        {
          type: 'paragraphe',
          texte:
            'Les thérapeutes, les membres d’un cabinet et ceux d’un revendeur acceptent expressément ces conditions et les conditions générales de vente en cochant une case — dans le formulaire de demande d’essai, puis à leur première connexion et à chaque nouvelle version : l’acceptation est enregistrée avec sa date et la version acceptée. Pour une personne suivie, utiliser l’espace que son cabinet lui ouvre vaut acceptation de ces conditions ; elles restent accessibles à tout moment depuis le pied de cet espace.',
        },
      ],
    },
    {
      id: 'service',
      titre: 'Le service',
      blocs: [
        { type: 'paragraphe', texte: 'Klaro sert à prolonger un accompagnement entre les séances :' },
        {
          type: 'liste',
          elements: [
            'pour le cabinet : les fiches de suivi, la prise de notes et l’enregistrement des séances, la dictée dans les champs de saisie, les propositions rédigées par l’IA et leur révision, le parcours d’exercices, les audios, les rappels, la boutique, le site du cabinet et les notes d’honoraires ;',
            'pour la personne suivie : ses tâches du jour, ses audios, son journal, sa note du soir, ses rappels et, si le cabinet les ouvre, sa boutique et sa prise de rendez-vous.',
          ],
        },
        {
          type: 'encart',
          texte:
            'Klaro est un outil de suivi et d’aide à la rédaction, sans finalité médicale : ce n’est pas un dispositif médical. Il ne pose aucun diagnostic, ne prescrit rien, et ne remplace ni une consultation ni un avis médical. Il n’est pas surveillé en temps réel : un message écrit un soir n’est pas lu dans l’heure. En cas de détresse, appelez le 3114 (prévention du suicide, 24 h/24) ; en cas d’urgence, le 15 ou le 112.',
        },
      ],
    },
    {
      id: 'acces',
      titre: 'Accès et comptes',
      blocs: [
        {
          type: 'liste',
          elements: [
            'On n’entre que sur invitation : se connecter ne donne accès à rien si aucune fiche ni aucune invitation n’attend l’adresse utilisée.',
            'La connexion se fait par un lien ou un code envoyé par courriel ; un mot de passe peut s’y ajouter. Chacun garde ses moyens de connexion pour soi, et prévient son cabinet — ou l’éditrice — s’il soupçonne qu’un tiers y a eu accès.',
            'Un compte est personnel. Un cabinet invite chaque membre de son équipe sous sa propre adresse, jamais sous un compte partagé.',
            'L’espace d’une personne suivie se referme quand le cabinet clôt son suivi, ou quand le cabinet est fermé.',
          ],
        },
      ],
    },
    {
      id: 'cabinet',
      titre: 'Ce que le cabinet s’engage à faire',
      blocs: [
        {
          type: 'paragraphe',
          texte: 'Le cabinet est responsable des données des personnes qu’il suit. En utilisant Klaro, il s’engage à :',
        },
        {
          type: 'liste',
          elements: [
            'informer les personnes qu’il suit de l’usage de Klaro et de ses prestataires, notamment de la rédaction assistée par l’IA, de l’envoi du texte aux États-Unis qu’elle suppose, et de la transcription par le navigateur ;',
            'recueillir leur consentement explicite au traitement de leurs données de santé, et en particulier avant d’enregistrer une séance ; en garder la trace, et respecter son retrait ;',
            'ne verser au dossier que ce qui est utile au suivi, et fixer la durée de sa conservation ;',
            'répondre aux demandes des personnes sur leurs données, avec les outils prévus : la copie du dossier, la suppression d’une fiche ;',
            'relire, corriger et valider tout texte proposé par l’IA avant de s’en servir ou de le transmettre : c’est une proposition, et le cabinet reste seul responsable de ce qu’il valide, écrit ou dit — y compris des affirmations dont il choisit le renouvellement automatique, qu’il accepte alors de voir publiées sans relecture préalable et qu’il relit ensuite ;',
            'décider s’il dicte des contenus cliniques, la voix partant alors chez l’éditeur du navigateur, selon ses conditions ; s’il ne l’accepte pas, ne dicter aucune donnée de santé qui permette d’identifier une personne ;',
            'n’utiliser Klaro qu’à des fins non médicales : ni pour poser un diagnostic ou traiter une pathologie, ni pour tenir le dossier médical d’une profession de santé réglementée ;',
            'tenir à jour les mentions légales de sa propre page, et répondre de ce qu’il y publie ;',
            'respecter les conditions des services qu’il branche lui-même : son compte Stripe, son serveur de messagerie, son agenda de réservation et, s’il utilise encore sa propre clé, son compte Anthropic et sa politique d’usage.',
          ],
        },
      ],
    },
    {
      id: 'personnes-suivies',
      titre: 'Pour les personnes suivies',
      blocs: [
        {
          type: 'liste',
          elements: [
            'Votre espace est personnel : ne le partagez pas, et déconnectez-vous d’un appareil prêté.',
            'Votre journal est privé ; votre thérapeute ne lit que les pages que vous choisissez de partager. Votre note du soir, elle, lui est toujours visible.',
            'Les exercices et les audios vous sont proposés par votre thérapeute, pour votre usage personnel : ne les diffusez pas.',
            'Certains contenus de votre espace sont préparés avec l’aide d’un outil d’intelligence artificielle, sous la responsabilité de votre praticien, qui les relit ou choisit d’en publier certains automatiquement.',
            `Vous pouvez fermer votre espace à tout moment, depuis « ${L.ongletPatient} ».`,
          ],
        },
      ],
    },
    {
      id: 'analyse',
      titre: 'L’intelligence artificielle',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'À la demande du cabinet, Klaro envoie le texte d’une séance ou des éléments du dossier à Anthropic pour en tirer une proposition : note de séance, profil, exercice, hypnose, affirmations, ou la révision de l’une d’elles. La rédaction se fait avec la clé de la plateforme ou du revendeur, et se paie alors en jetons — inclus chaque mois dans l’abonnement, ou achetés en recharge ; ou, pour les cabinets qui l’utilisent encore, avec la clé que le cabinet a posée dans ses réglages, les appels étant alors payés par lui directement à Anthropic. Le revendeur choisit l’un ou l’autre mode pour l’ensemble de ses cabinets, et peut aussi le régler cabinet par cabinet.',
        },
        {
          type: 'paragraphe',
          texte:
            'Le nombre de jetons qu’une rédaction consomme s’affiche avant qu’on la lance, et n’est débité que si elle aboutit : ceux d’une rédaction interrompue reviennent d’eux-mêmes dans les dix minutes. Ce qui revient n’entre pas au dossier sans que la thérapeute l’ait relu — à l’exception des affirmations de la semaine, quand le cabinet a choisi leur renouvellement automatique ; il peut alors les corriger à tout moment.',
        },
        {
          type: 'paragraphe',
          texte:
            'Sous chaque proposition, un pouce levé ou baissé permet de dire ce qui ne va pas et de demander à l’IA de la reprendre ; la thérapeute peut faire retenir sa préférence pour les rédactions suivantes de son cabinet, et l’effacer ensuite. Les jetons, les limites de l’IA et la responsabilité de chacun sont détaillés dans les',
          lien: { libelle: 'conditions générales de vente', href: `${CGV}#ia` },
        },
      ],
    },
    {
      id: 'donnees',
      titre: 'Données personnelles',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Pour les données des personnes suivies, l’éditrice agit en sous-traitant du cabinet : elle ne les traite que pour fournir le service, selon les instructions du cabinet, et ne s’en sert à aucune autre fin. Prestataires, lieux, durées de conservation et droits sont détaillés dans la',
          lien: { libelle: 'politique de confidentialité', href: cheminLegal('confidentialite') },
        },
        {
          type: 'paragraphe',
          texte: `L’éditrice aide le cabinet à répondre aux demandes des personnes, et le prévient dans les ${ALERTE_VIOLATION} de toute violation de données qui le concerne. Leurs engagements réciproques sont ceux de l’accord de sous-traitance (RGPD, article 28), annexé aux`,
          lien: { libelle: 'conditions générales de vente', href: `${CGV}#annexe-rgpd` },
        },
      ],
    },
    {
      id: 'disponibilite',
      titre: 'Disponibilité et évolutions',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'L’éditrice fait ses meilleurs efforts pour que le service soit disponible et sûr — c’est une obligation de moyens —, sans pouvoir garantir qu’il le soit sans interruption : une maintenance, une panne d’un prestataire ou du réseau peuvent le suspendre. Une maintenance programmée est annoncée à l’avance quand c’est possible, et placée de préférence aux heures creuses. Le service évolue ; une fonctionnalité peut changer ou disparaître, et les cabinets sont prévenus de tout changement qui touche leurs données.',
        },
      ],
    },
    {
      id: 'responsabilite',
      titre: 'Responsabilité',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Chacun répond de ce qu’il écrit et publie dans Klaro. L’éditrice ne répond ni des décisions de suivi prises par un cabinet, ni des contenus qu’il valide, ni du fonctionnement des services tiers que le cabinet choisit de brancher. Envers les cabinets et les revendeurs, sa responsabilité est limitée dans les conditions des',
          lien: { libelle: 'conditions générales de vente', href: `${CGV}#responsabilite` },
        },
        {
          type: 'paragraphe',
          texte:
            'Rien dans ces conditions ne limite les droits que les personnes suivies tiennent de la loi, notamment du RGPD.',
        },
      ],
    },
    {
      id: 'propriete',
      titre: 'Propriété intellectuelle',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Le logiciel Klaro, son code, ses textes d’interface et sa marque appartiennent à l’éditrice. Le cabinet reste titulaire de ce qu’il crée — notes, exercices, audios, textes de sa page — et des propositions de l’IA qu’il obtient, dans la mesure où la loi le permet ; la personne suivie, de ce qu’elle écrit. L’éditrice ne s’en sert que pour faire fonctionner le service.',
        },
      ],
    },
    {
      id: 'fin',
      titre: 'Fin de l’utilisation',
      blocs: [
        {
          type: 'liste',
          elements: [
            `Une personne suivie peut supprimer son compte depuis « ${L.ongletPatient} » : son journal est effacé, son dossier reste au cabinet.`,
            'Un cabinet peut supprimer une fiche : tout ce qu’elle porte est effacé, sauf les notes d’honoraires, qui sont des pièces comptables.',
            `Quand un cabinet est fermé, les espaces de ses patients et sa page publique se referment ; rien n’est effacé, et la thérapeute garde l’accès à ses dossiers pour les relire et les exporter. À la fin du contrat, les données du cabinet restent exportables pendant ${RESTITUTION}, puis sont effacées dans les ${EFFACEMENT} qui suivent.`,
          ],
        },
      ],
    },
    {
      id: 'modifications',
      titre: 'Modification des conditions',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Ces conditions peuvent évoluer avec le service ; la date de leur dernière mise à jour figure en tête de page. Un changement important est annoncé au moins ${PREAVIS} avant son entrée en vigueur, par courriel ou dans l’espace ; les thérapeutes et les membres d’un revendeur sont invités à accepter la nouvelle version à leur connexion suivante, et un cabinet qui la refuse peut résilier son abonnement avant qu’elle s’applique.`,
        },
      ],
    },
    {
      id: 'droit',
      titre: 'Droit applicable',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Ces conditions sont soumises au droit français. En cas de différend, une solution amiable est d’abord recherchée pendant trente jours, par écrit à ${COURRIEL} ; à défaut, le litige est porté devant la juridiction compétente selon les règles du droit commun.`,
        },
        {
          type: 'paragraphe',
          texte: `Aucun médiateur de la consommation n’est désigné : les personnes suivies utilisent Klaro gratuitement, dans le cadre de leur relation avec leur cabinet, et l’éditrice ne vend rien aux consommateurs. Une personne suivie qui souhaite adresser une réclamation sur le service peut écrire à ${COURRIEL} ; pour un achat fait dans la boutique d’un cabinet, c’est ce cabinet, vendeur, qui répond.`,
        },
      ],
    },
  ],
}

/* ------------------------------------------------------------------ *
 * Conditions générales de vente, et l'accord de sous-traitance
 * ------------------------------------------------------------------ */

/**
 * L'ordre des articles, qui fait leur numéro.
 *
 * Les renvois d'un article à l'autre (« l'article 7 ») se calculent sur cet
 * ordre : insérer un article ne laisse aucun renvoi pointer à côté.
 */
const ARTICLES_CGV = [
  'parties',
  'objet',
  'acceptation',
  'souscription',
  'resiliation',
  'prix',
  'retard',
  'jetons',
  'option-hypnose',
  'revendeurs',
  'obligations-client',
  'ia',
  'disponibilite',
  'securite',
  'donnees',
  'propriete',
  'responsabilite',
  'force-majeure',
  'prescription',
  'confidentialite',
  'dispositions',
  'modifications',
  'signalement',
  'droit',
] as const

type ArticleCgv = (typeof ARTICLES_CGV)[number]

/** « l’article 7 » — le numéro d'un article, lu dans l'ordre ci-dessus. */
function article(id: ArticleCgv): string {
  return `l’article ${ARTICLES_CGV.indexOf(id) + 1}`
}

/** Un article numéroté : son numéro vient de sa place, pas d'une saisie. */
function art(id: ArticleCgv, titre: string, blocs: Bloc[]): SectionLegale {
  return { id, titre: `${ARTICLES_CGV.indexOf(id) + 1}. ${titre}`, blocs }
}

const ARTICLES: SectionLegale[] = [
  art('parties', 'Parties et définitions', [
    {
      type: 'paragraphe',
      texte: `Les présentes conditions générales de vente (les « CGV ») sont conclues entre, d’une part, ${EDITRICE} — ${ADRESSE} ; SIREN ${SIREN}, inscrite au Registre national des entreprises —, ci-après « le Prestataire », et, d’autre part, le professionnel qui souscrit au Service pour son cabinet, ci-après « le Client ».`,
    },
    {
      type: 'lignes',
      lignes: [
        {
          terme: 'Service',
          valeur: `La plateforme Klaro, accessible à l’adresse ${DOMAINE_CABINETS} et aux adresses des cabinets qui l’utilisent : l’espace du cabinet, l’espace des personnes suivies, la page publique du cabinet, les fonctions d’intelligence artificielle, et leurs évolutions.`,
        },
        {
          terme: 'Client',
          valeur:
            'Le professionnel — thérapeute exerçant en libéral, ou la structure qui l’emploie — qui souscrit au Service pour les besoins de son activité, directement auprès du Prestataire ou par un Revendeur. Il n’agit pas en consommateur.',
        },
        {
          terme: 'Revendeur',
          valeur:
            'L’entreprise autorisée par le Prestataire à commercialiser le Service, le cas échéant sous sa propre marque, et qui vend l’abonnement au Client.',
        },
        {
          terme: 'Utilisateur',
          valeur: 'Toute personne qui accède au Service sous le compte du Client ou à son invitation : thérapeutes et membres de son équipe.',
        },
        {
          terme: 'Personne suivie',
          valeur: 'La personne accompagnée par le Client, à qui il ouvre un espace. Elle n’est pas partie au contrat.',
        },
        {
          terme: 'Jeton',
          valeur: 'Unité de compte, sans valeur monétaire, qui mesure l’usage des fonctions d’intelligence artificielle.',
        },
        { terme: 'Recharge', valeur: 'Lot de jetons acheté en plus de ceux que l’abonnement inclut.' },
        {
          terme: 'Option Hypnose',
          valeur: 'La rédaction de scripts d’hypnose personnalisés de trente minutes, incluse dans certaines offres ou achetée à part.',
        },
        {
          terme: 'Contenu généré',
          valeur:
            'Tout texte proposé par l’intelligence artificielle : note, synthèse, profil, exercice, consigne, script d’hypnose, affirmation, révision.',
        },
        {
          terme: 'Données du Client',
          valeur: 'Les données que le Client et ses Utilisateurs saisissent ou versent dans le Service, dont celles des personnes qu’il suit.',
        },
      ],
    },
  ]),

  art('objet', 'Objet et documents contractuels', [
    {
      type: 'paragraphe',
      texte:
        'Les CGV fixent les conditions auxquelles le Prestataire fournit le Service au Client, sous forme d’abonnement, à distance et en ligne. Elles constituent, avec leur annexe, le socle de la relation commerciale (code de commerce, article L441-1).',
    },
    {
      type: 'paragraphe',
      texte: 'Le contrat est formé des documents suivants ; en cas de contradiction, le premier l’emporte sur les suivants :',
    },
    {
      type: 'liste',
      elements: [
        'les conditions particulières signées, le cas échéant, par les deux parties ;',
        'les présentes CGV et leur annexe, l’accord de sous-traitance des données (article 28 du RGPD) ;',
        'l’offre choisie à la souscription : son prix, ses jetons inclus, ses options ;',
        'les conditions générales d’utilisation du Service ;',
        'la politique de confidentialité, pour son volet d’information.',
      ],
    },
    {
      type: 'paragraphe',
      texte:
        'Les conditions générales d’achat du Client, ou tout autre document qu’il émet, ne s’appliquent pas, sauf accord écrit du Prestataire.',
    },
  ]),

  art('acceptation', 'Acceptation et opposabilité', [
    {
      type: 'paragraphe',
      texte:
        'Les CGV sont mises à la disposition du Client avant toute souscription, sur une page qu’il peut consulter, enregistrer et imprimer. Il les accepte expressément en cochant, sans qu’elle soit cochée d’avance, la case « J’ai lu et j’accepte les conditions générales de vente et d’utilisation » — dans le formulaire de demande d’essai, puis à sa première connexion à son espace.',
    },
    {
      type: 'paragraphe',
      texte: `Chaque acceptation est enregistrée avec le compte qui l’a donnée, sa date et son heure, et la version acceptée, désignée par sa date de mise à jour (la présente version : ${MISE_A_JOUR}). Ces enregistrements font foi entre les parties, sauf preuve contraire. Le Client obtient sur simple demande une copie de la version qu’il a acceptée, sur un support durable.`,
    },
    {
      type: 'paragraphe',
      texte:
        'La personne qui accepte les CGV pour le compte d’un cabinet déclare avoir le pouvoir de l’engager. Chaque Utilisateur accepte en outre, à sa première connexion, les conditions générales d’utilisation.',
    },
  ]),

  art('souscription', 'Souscription, essai et durée', [
    {
      type: 'liste',
      elements: [
        `Le Client souscrit l’une des offres présentées — à la date des CGV : ${NOMS_DES_OFFRES} —, directement auprès du Prestataire ou par un Revendeur. L’offre fixe le prix mensuel, le nombre de personnes suivies actives, les fonctions ouvertes et les jetons inclus.`,
        'Un essai gratuit de quatorze jours peut être accordé à l’ouverture du cabinet, sans carte bancaire ; lorsque les rédactions se paient en jetons, il comprend une petite dotation de jetons d’essai. À son terme, si aucun abonnement ne prend le relais, aucune donnée n’est effacée : les dossiers restent accessibles et exportables, mais l’ouverture de nouvelles fiches, la boutique, le domaine et le site du cabinet se ferment jusqu’à la souscription.',
        'L’abonnement est conclu pour une durée d’un mois, renouvelée tacitement de mois en mois, sans engagement de durée.',
        'Un changement d’offre prend effet à la date convenue avec le Prestataire ou le Revendeur ; le nouveau prix s’applique à compter de la période mensuelle suivante, sauf accord contraire.',
      ],
    },
  ]),

  art('resiliation', 'Résiliation, réversibilité et changement de fournisseur', [
    {
      type: 'liste',
      elements: [
        `Le Client peut résilier à tout moment, par courriel à ${COURRIEL} ou auprès de son Revendeur. La résiliation prend effet à la fin de la période mensuelle en cours ; la période commencée reste due et n’est pas remboursée au prorata.`,
        `Le Prestataire peut résilier l’abonnement pour convenance, en respectant un préavis d’au moins ${PREAVIS}, notifié par courriel ; la résiliation prend effet à la fin de la période mensuelle au cours de laquelle le préavis expire.`,
        `En cas de manquement grave d’une partie à ses obligations, non réparé quinze jours après une mise en demeure restée sans effet, l’autre partie peut résilier le contrat de plein droit, par écrit, sans préjudice des dommages et intérêts qu’elle pourrait réclamer. Le défaut de paiement suit la procédure de ${article('retard')}.`,
        'Le Prestataire peut suspendre sans délai l’accès d’un Utilisateur qui porte atteinte à la sécurité du Service, en fait un usage illicite ou contraire aux CGV, ou met en danger les données d’autrui ; il en informe aussitôt le Client et, faute de régularisation, peut résilier dans les conditions ci-dessus.',
        'Le Prestataire peut cesser de fournir le Service en prévenant le Client au moins trois mois à l’avance. En ce cas, comme en cas de résiliation par le Prestataire pour convenance ou de résiliation par le Client pour manquement grave du Prestataire, les recharges payées et non consommées sont remboursées au prorata des jetons qui en restent, par le vendeur qui les a encaissées — le Prestataire, ou le Revendeur quand c’est lui qui les a vendues.',
      ],
    },
    {
      type: 'paragraphe',
      texte: `Réversibilité et changement de fournisseur (règlement (UE) 2023/2854 sur les données). Pendant toute la durée du contrat, le Client exporte lui-même chaque dossier en PDF. À la fin du contrat, quelle qu’en soit la cause, ses données restent accessibles en lecture et exportables pendant ${RESTITUTION} ; ce délai comprend la période de transition de trente jours prévue par ce règlement. Sur demande écrite présentée pendant ce délai, le Prestataire lui remet, sous trente jours, une copie de ses données exportables dans un format structuré, couramment utilisé et lisible par machine. Le préavis de résiliation du Client n’excède jamais deux mois, et le changement de fournisseur ne donne lieu à aucun frais. Les données sont ensuite effacées dans les conditions de l’annexe.`,
    },
  ]),

  art('prix', 'Prix, facturation et paiement', [
    {
      type: 'liste',
      elements: [
        `Les prix des offres, des recharges et de l’option Hypnose, ainsi que le barème des jetons, sont ceux affichés sur la page de présentation du Service (${DOMAINE_CABINETS}) et dans l’espace du Client au moment de la commande — ou, pour une souscription par un Revendeur, ceux que ce Revendeur communique. Ils sont exprimés en euros et hors taxes.`,
        'Le Prestataire bénéficie de la franchise en base de TVA : aucune TVA n’est facturée, et les factures portent la mention « TVA non applicable, art. 293 B du CGI ». Si ce régime venait à cesser, la TVA au taux en vigueur s’ajouterait aux prix hors taxes ; le Client en serait informé avant la facture concernée.',
        'L’abonnement se paie d’avance, pour chaque période mensuelle ; les recharges et l’option Hypnose, à la commande. Les factures sont émises par le vendeur — le Prestataire, ou le Revendeur quand c’est lui qui vend — et adressées par voie électronique. Elles sont payables à réception, par les moyens de paiement proposés.',
        'Aucun escompte n’est accordé en cas de paiement anticipé.',
        `Le Prestataire peut modifier ses prix. Toute hausse est annoncée au Client au moins ${PREAVIS} avant de s’appliquer, par courriel ou dans son espace, et ne vaut que pour les périodes qui commencent après ce délai. Le Client qui la refuse peut résilier sans frais avant qu’elle prenne effet.`,
      ],
    },
  ]),

  art('retard', 'Retard de paiement et suspension', [
    {
      type: 'paragraphe',
      texte:
        'Tout retard de paiement entraîne de plein droit, sans qu’un rappel soit nécessaire, des pénalités de retard au taux appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de dix points de pourcentage, ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40 euros (code de commerce, articles L441-10 et D441-5), sans préjudice d’une indemnisation complémentaire, sur justificatifs, lorsque les frais exposés la dépassent.',
    },
    { type: 'paragraphe', texte: 'En cas de défaut de paiement :' },
    {
      type: 'liste',
      elements: [
        'le vendeur adresse au Client une mise en demeure par courriel ;',
        'faute de régularisation dans les huit jours, l’accès au Service peut être suspendu : le Client et ses Utilisateurs gardent l’accès en lecture à leurs dossiers et la possibilité de les exporter, mais ne peuvent plus créer de contenu ni lancer de rédaction par l’IA ;',
        'pendant la suspension, rien n’est effacé ; le paiement de l’intégralité des sommes dues y met fin ;',
        'si l’impayé persiste trente jours après la mise en demeure, le contrat peut être résilié de plein droit ; les données sont alors restituées puis effacées dans les conditions de l’annexe.',
      ],
    },
  ]),

  art('jetons', 'Jetons d’intelligence artificielle', [
    {
      type: 'paragraphe',
      texte:
        'Les fonctions d’intelligence artificielle se paient en jetons — sauf pour le Client qui utilise encore sa propre clé d’accès chez Anthropic, dont il paie directement les appels.',
    },
    {
      type: 'liste',
      elements: [
        'Jetons inclus. Chaque offre comprend un nombre de jetons par mois, crédités le premier jour de chaque mois civil (heure de Paris). Ils sont valables jusqu’à la fin de ce mois, ne se cumulent pas et ne se reportent pas sur le mois suivant.',
        'Recharges. Le Client peut acheter des recharges. Leurs jetons sont valables douze mois à compter de l’achat.',
        'Ordre de consommation. Chaque rédaction puise d’abord dans les jetons inclus du mois, puis dans ceux qui accompagnent l’option Hypnose, puis dans ceux des recharges et dans les jetons offerts à titre de geste commercial, en commençant par ceux dont l’échéance est la plus proche.',
        'Débit. Chaque rédaction débite le nombre de jetons que fixe le barème, affiché avant qu’on la lance. Les jetons ne sont débités que si la rédaction aboutit : une rédaction qui échoue ne coûte rien. Ils sont réservés quand la rédaction commence ; si elle échoue, ils sont rendus aussitôt, et si elle est interrompue avant d’avoir pu les rendre, ils reviennent automatiquement dans les dix minutes. Sans jetons disponibles, les rédactions attendent le mois suivant ou une recharge ; le reste du Service continue de fonctionner.',
        `Barème. Le barème peut évoluer. Tout changement est annoncé au moins ${PREAVIS} à l’avance, par courriel ou dans l’espace du Client, et n’a jamais d’effet rétroactif : il ne touche ni les rédactions déjà faites, ni leur débit.`,
        `Nature des jetons. Les jetons n’ont aucune valeur monétaire : ils ne sont ni remboursables, ni échangeables contre de l’argent, ni cessibles à un autre cabinet, et ne s’utilisent qu’au sein du Service, auprès de nul autre que le Prestataire. Ils ne constituent ni de la monnaie électronique, ni un moyen de paiement. Les jetons non utilisés à leur date d’expiration sont perdus, sans indemnité, sous la seule réserve du remboursement des recharges payées que prévoit ${article('resiliation')} en cas d’arrêt du Service, de résiliation par le Prestataire pour convenance ou de résiliation par le Client pour manquement grave du Prestataire.`,
        'Essai. Lorsque les rédactions se paient en jetons, l’essai comprend une petite dotation de jetons, valable pendant sa seule durée.',
        'Revendeur. Lorsque le Client a souscrit par un Revendeur, le prix des recharges et, le cas échéant, le barème sont fixés par ce Revendeur, qui en répond seul envers ses clients. Ce Revendeur choisit aussi si les rédactions se paient en jetons ou par la propre clé du Client : pour l’ensemble de ses clients, ou client par client.',
      ],
    },
  ]),

  art('option-hypnose', 'Option Hypnose', [
    {
      type: 'paragraphe',
      texte:
        'L’option Hypnose permet de faire rédiger des scripts d’hypnose personnalisés de trente minutes. Elle est incluse dans certaines offres. Sinon, elle s’achète sous la forme d’un accès de trente jours, qui ne se renouvelle pas de lui-même : il prend fin à son terme, sans remboursement au prorata s’il n’a pas servi en entier. Il peut s’accompagner de jetons offerts, valables pendant sa seule durée. Chaque script débite des jetons selon le barème.',
    },
  ]),

  art('revendeurs', 'Souscription par un Revendeur', [
    {
      type: 'paragraphe',
      texte:
        'Lorsque le Client a souscrit par un Revendeur, ce Revendeur est son vendeur : il fixe le prix, émet les factures, encaisse les paiements et répond seul de ses propres conditions commerciales. Le Prestataire reste l’éditeur du Service et son fournisseur technique ; pour les données des personnes suivies, il agit comme sous-traitant ultérieur. Les stipulations des CGV relatives au Service, aux données, à l’intelligence artificielle et à la responsabilité s’appliquent à tous les Clients, quel que soit leur vendeur.',
    },
    { type: 'paragraphe', texte: 'Tout Revendeur, en plus de son contrat avec le Prestataire :' },
    {
      type: 'liste',
      elements: [
        'reprend dans ses propres conditions de vente au moins les garanties et les limites des CGV — sur les données, l’intelligence artificielle, les jetons et la responsabilité — et fait accepter à ses clients les conditions générales d’utilisation ;',
        'fait souscrire ses clients en ligne, ou leur remet, lorsque la loi l’exige, l’information et le formulaire de rétractation dus aux professionnels qui contractent hors établissement (code de la consommation, article L221-3) ;',
        'lorsque les rédactions de ses clients passent par sa propre clé d’accès, devient client d’Anthropic : il respecte ses conditions commerciales et sa politique d’usage, et répond de l’usage fait sous sa clé ;',
        'fixe ses prix et, le cas échéant, son barème de jetons, et en répond seul envers ses clients ;',
        'n’a accès à aucune donnée des personnes suivies — ni nom, ni note, ni transcription, ni journal : il ne voit que des compteurs agrégés ;',
        'garantit le Prestataire contre toute réclamation d’un de ses clients ou d’un tiers qui trouve sa cause dans ses propres engagements, ses prix, sa communication ou l’usage de sa clé, et l’indemnise des sommes qui en résultent, frais de défense compris ;',
        'ne peut engager le Prestataire au-delà des CGV, ni se présenter comme son mandataire.',
      ],
    },
    {
      type: 'paragraphe',
      texte:
        'Hors manquement grave, la relation avec un Revendeur ne peut être rompue par l’une ou l’autre partie qu’avec un préavis écrit qui tient compte de sa durée (code de commerce, article L442-1, II), et d’au moins trois mois. Les clients du Revendeur gardent alors l’accès à leurs données et la possibilité de les exporter, ou de souscrire directement auprès du Prestataire.',
    },
  ]),

  art('obligations-client', 'Obligations du Client', [
    {
      type: 'paragraphe',
      texte: 'Le Client est responsable du traitement des données des personnes qu’il suit. Il s’engage notamment à :',
    },
    {
      type: 'liste',
      elements: [
        'recueillir et documenter le consentement explicite des personnes qu’il suit au traitement de leurs données de santé (RGPD, article 9, 2, a), y compris avant tout enregistrement et toute transcription d’une séance, et respecter son retrait ;',
        'informer ces personnes de l’usage du Service, de ses prestataires et du recours à l’intelligence artificielle pour préparer certains contenus, ainsi que du transfert aux États-Unis qu’il implique ;',
        `relire, corriger et valider chaque contenu généré avant tout usage ou toute transmission, sous la seule réserve des affirmations dont il choisit le renouvellement automatique (${article('ia')}) ;`,
        'décider s’il utilise la dictée pour des contenus cliniques, dans les conditions de l’annexe ;',
        'utiliser le Service pour une finalité non médicale : ne pas s’en servir pour poser un diagnostic, prescrire, ou traiter une pathologie, ni pour tenir le dossier médical d’une profession de santé réglementée ; orienter vers un professionnel de santé la personne dont l’état le requiert ;',
        'ne verser au Service que les données utiles au suivi, en fixer la durée de conservation, et répondre aux demandes des personnes avec les outils prévus ;',
        'exporter et conserver régulièrement ses propres copies des dossiers auxquels il tient ;',
        'publier ses propres mentions légales sur sa page publique, dont il est l’éditeur, et répondre de ce qu’il y publie ;',
        'être le vendeur des produits de sa boutique : il fixe ses conditions de vente, respecte le droit de la consommation envers les personnes qui achètent, et tient sa comptabilité ; le Prestataire n’est pas partie à ces ventes ;',
        'garder confidentiels les moyens de connexion de ses Utilisateurs, n’ouvrir qu’un compte par personne, et prévenir le Prestataire sans délai de tout accès suspect ;',
        'ne pas porter atteinte au Service : ni tentative d’intrusion, ni extraction automatisée, ni revente sans accord, ni contournement des limites de son offre ou du décompte des jetons ;',
        'respecter les conditions des services tiers qu’il branche lui-même : Stripe, serveur de messagerie, agenda de réservation et, s’il en utilise une, sa propre clé Anthropic.',
      ],
    },
    {
      type: 'paragraphe',
      texte:
        'Le Client garantit le Prestataire contre toute réclamation d’une personne qu’il suit ou d’un tiers qui trouve sa cause dans un manquement à ces engagements, ou dans les contenus qu’il publie ou valide.',
    },
  ]),

  art('ia', 'Intelligence artificielle', [
    {
      type: 'paragraphe',
      texte:
        'Les contenus générés par l’intelligence artificielle — propositions de séance, notes, synthèses, profils, exercices, consignes, scripts d’hypnose, affirmations, notifications, révisions — sont des brouillons d’aide à la rédaction, susceptibles d’erreurs, d’omissions ou d’inexactitudes. Le Client s’engage à les relire, les corriger et les valider avant tout usage ou toute transmission, et il en demeure seul responsable. S’il choisit le renouvellement automatique des affirmations de la semaine, il accepte que chaque nouvelle série soit publiée dans l’espace de la personne suivie sans relecture préalable ; il la relit ensuite, peut la corriger à tout moment, et en demeure également seul responsable. Les contenus générés ne constituent ni un avis médical, ni un diagnostic, ni une prescription, et ne remplacent pas une consultation médicale.',
    },
    {
      type: 'paragraphe',
      texte:
        'Klaro n’est pas un dispositif médical : il aide un professionnel à rédiger et à organiser le suivi entre les séances, sans finalité de diagnostic, de surveillance ou de traitement. Le Client s’interdit tout usage visant à diagnostiquer ou à traiter une pathologie, et oriente les personnes qu’il suit vers un professionnel de santé lorsque c’est nécessaire.',
    },
    {
      type: 'paragraphe',
      texte:
        'Aucune garantie d’exactitude, d’exhaustivité ou d’adéquation à un besoin particulier n’est donnée sur les contenus générés. Le Service repose sur des modèles fournis par un tiers, Anthropic, PBC (États-Unis), dont la disponibilité, les performances et les conditions peuvent évoluer ; le Prestataire peut changer de modèle ou de fournisseur pour maintenir le Service, dans les conditions de l’annexe lorsque ce changement touche aux données.',
    },
    {
      type: 'paragraphe',
      texte:
        'Transparence (règlement (UE) 2024/1689 sur l’intelligence artificielle, article 50). Le Service présente aux Utilisateurs les contenus générés comme des propositions de l’IA, et indique aux personnes suivies, dans leur espace, que certains contenus y sont préparés avec l’aide d’un outil d’intelligence artificielle, sous la responsabilité de leur praticien, qui les relit ou choisit d’en publier certains automatiquement ; les documents exportés portent une indication semblable dans leurs propriétés. Le Client ne retire pas ces indications.',
    },
    {
      type: 'paragraphe',
      texte:
        'Retours sur l’IA. Sous chaque contenu généré, l’Utilisateur peut dire s’il lui convient et demander une révision, en décrivant ce qui ne va pas ; il peut faire retenir sa préférence pour les rédactions suivantes de son cabinet. Ces préférences sont propres au cabinet, ne servent qu’à ses rédactions, et s’effacent à tout moment. Une révision est une rédaction : elle débite des jetons selon le barème.',
    },
    {
      type: 'paragraphe',
      texte: 'Ni le Prestataire ni Anthropic ne se servent des Données du Client pour entraîner des modèles d’intelligence artificielle.',
    },
  ]),

  art('disponibilite', 'Disponibilité, maintenance et évolutions', [
    {
      type: 'paragraphe',
      texte:
        'Le Prestataire met en œuvre les moyens raisonnables pour que le Service soit accessible à tout moment ; il s’agit d’une obligation de moyens, et aucun niveau de disponibilité n’est garanti. Le Service peut être interrompu pour une maintenance, une mise à jour ou une mesure de sécurité, ou par la défaillance d’un hébergeur, d’un fournisseur d’intelligence artificielle ou des réseaux.',
    },
    {
      type: 'paragraphe',
      texte: `Les maintenances programmées sont annoncées à l’avance lorsque c’est possible, et placées de préférence en dehors des heures ouvrées. Le Prestataire fait évoluer le Service : une fonction peut être modifiée, remplacée ou retirée sans ouvrir droit à indemnité, dès lors que les fonctions essentielles de l’offre souscrite demeurent. Le retrait d’une fonction essentielle est annoncé ${PREAVIS} à l’avance et permet au Client de résilier sans frais.`,
    },
    {
      type: 'paragraphe',
      texte: `L’assistance est assurée par courriel, à ${COURRIEL}, les jours ouvrés, dans un délai raisonnable.`,
    },
  ]),

  art('securite', 'Sécurité et sauvegardes', [
    {
      type: 'paragraphe',
      texte:
        'Le Prestataire met en œuvre des mesures de sécurité adaptées au risque — chiffrement des échanges, cloisonnement de chaque cabinet dans la base, chiffrement des clés confiées, double authentification proposée, journal des gestes sensibles — au titre d’une obligation de moyens. Elles sont décrites dans la',
      lien: { libelle: 'politique de confidentialité', href: `${cheminLegal('confidentialite')}#securite` },
    },
    {
      type: 'paragraphe',
      texte:
        'Les sauvegardes de la base sont celles que prévoit l’offre souscrite auprès de son hébergeur ; elles servent à la continuité du Service et ne constituent pas un service d’archivage. Le Client reste responsable de conserver ses propres exports des données auxquelles il tient.',
    },
  ]),

  art('donnees', 'Données personnelles', [
    {
      type: 'paragraphe',
      texte:
        'Pour les données des personnes suivies, le Client est responsable du traitement et le Prestataire son sous-traitant — ou son sous-traitant ultérieur, lorsque le Client a souscrit par un Revendeur. Leurs obligations respectives figurent dans l’accord de sous-traitance annexé aux CGV, qui en fait partie intégrante.',
    },
    {
      type: 'paragraphe',
      texte:
        'Pour les données de ses clients professionnels — comptes, facturation, jetons, acceptation des conditions, assistance —, le Prestataire est responsable du traitement, dans les conditions de la',
      lien: { libelle: 'politique de confidentialité', href: cheminLegal('confidentialite') },
    },
    {
      type: 'encart',
      texte:
        'Aucune certification d’hébergeur de données de santé (HDS) n’est revendiquée. Informé que le Service n’en dispose pas, le Client s’interdit de l’utiliser pour une activité qui imposerait, au sens de l’article L1111-8 du code de la santé publique, un hébergement répondant à cette exigence.',
    },
  ]),

  art('propriete', 'Propriété intellectuelle', [
    {
      type: 'paragraphe',
      texte:
        'Le Service, son logiciel, ses textes, sa marque Klaro et sa documentation appartiennent au Prestataire. Le Prestataire concède au Client, pour la durée du contrat, un droit d’utilisation du Service personnel, non exclusif, non cessible et non transférable, limité aux besoins de son activité et au périmètre de son offre. Toute reproduction, adaptation, extraction ou décompilation, hors les cas que la loi autorise, est interdite.',
    },
    {
      type: 'paragraphe',
      texte:
        'Le Client reste titulaire des données et des contenus qu’il verse au Service — notes, exercices, audios, textes et images de sa page. Il concède au Prestataire, pour la seule durée du contrat, le droit de les héberger, de les reproduire et de les afficher dans la mesure nécessaire à la fourniture du Service, et garantit disposer des droits sur les contenus qu’il publie.',
    },
    {
      type: 'paragraphe',
      texte:
        'Les contenus générés à la demande du Client lui appartiennent, dans la mesure où la loi permet d’en être titulaire ; le Prestataire ne revendique aucun droit sur eux. Le Client est informé qu’un texte généré peut ressembler à d’autres textes produits par le même modèle.',
    },
  ]),

  art('responsabilite', 'Responsabilité', [
    {
      type: 'paragraphe',
      texte:
        'La responsabilité du Prestataire ne peut être engagée qu’en cas de faute prouvée, et pour les seuls dommages directs et prévisibles qui en résultent.',
    },
    {
      type: 'paragraphe',
      texte:
        'Sont exclus les dommages indirects — perte de chiffre d’affaires, de clientèle, d’image ou de chance —, ainsi que toute perte de données qui n’est pas imputable au Prestataire, le Client devant conserver ses propres exports. Le Prestataire ne répond ni des contenus que le Client publie ou valide, ni des décisions qu’il prend dans le suivi des personnes qu’il accompagne, ni du fonctionnement des services tiers qu’il choisit de brancher.',
    },
    {
      type: 'paragraphe',
      texte:
        'Sauf faute lourde ou dolosive, la responsabilité totale du Prestataire, toutes causes confondues, est plafonnée à un montant égal aux sommes hors taxes effectivement payées par le Client pour le Service — au Prestataire ou à son Revendeur — au cours des douze mois qui précèdent le fait générateur du dommage, sans pouvoir être inférieur à 500 euros.',
    },
    {
      type: 'paragraphe',
      texte:
        'Ces limites ne s’appliquent pas aux dommages corporels, ni là où la loi interdit de limiter la responsabilité. Elles ne sont pas opposables aux personnes dont les données sont traitées, qui conservent les droits qu’elles tiennent du RGPD, notamment de son article 82 : elles règlent la contribution entre le Client et le Prestataire. Le prix convenu tient compte de cette répartition des risques, qui en est un élément déterminant.',
    },
  ]),

  art('force-majeure', 'Force majeure', [
    {
      type: 'paragraphe',
      texte:
        'Aucune partie n’est responsable d’un manquement causé par un cas de force majeure au sens de l’article 1218 du code civil. Y sont assimilés, lorsqu’ils échappent au contrôle raisonnable de la partie concernée : la défaillance durable d’un hébergeur, d’un fournisseur d’intelligence artificielle ou d’un opérateur de réseau ; une cyberattaque d’ampleur survenue malgré des mesures de sécurité à l’état de l’art ; une décision d’une autorité, ou un changement de la réglementation, qui empêche de fournir le Service ; une catastrophe naturelle, un incendie, une épidémie ou un conflit.',
    },
    {
      type: 'paragraphe',
      texte:
        'La partie empêchée prévient l’autre sans délai et s’efforce de limiter l’empêchement ; les obligations sont suspendues tant qu’il dure, les sommes déjà échues restant dues. Si l’empêchement dure plus de trente jours, chaque partie peut résilier le contrat par écrit, sans indemnité ; les données restent alors restituables dans les conditions de l’annexe.',
    },
  ]),

  art('prescription', 'Prescription', [
    {
      type: 'paragraphe',
      texte:
        'Toute action du Client contre le Prestataire, quelle qu’en soit la cause, se prescrit par un an à compter du jour où le Client a connu, ou aurait dû connaître, les faits qui lui permettent de l’exercer (code civil, article 2254).',
    },
  ]),

  art('confidentialite', 'Confidentialité', [
    {
      type: 'paragraphe',
      texte:
        'Chaque partie garde confidentielles les informations non publiques qu’elle reçoit de l’autre à l’occasion du contrat — conditions particulières, informations techniques, données des cabinets — et ne s’en sert que pour l’exécuter. Cette obligation dure pendant le contrat et cinq ans après sa fin ; les données personnelles restent protégées sans limite de durée. Elle ne vise ni ce qui est public, ni ce qui était déjà connu, ni ce dont la loi ou une autorité exige la communication.',
    },
  ]),

  art('dispositions', 'Dispositions générales', [
    {
      type: 'liste',
      elements: [
        `Cession. Le Client ne peut céder le contrat sans l’accord écrit du Prestataire. Le Prestataire peut le céder à une société qu’il contrôle ou qu’il constitue pour exploiter le Service, ou à l’acquéreur de tout ou partie de son activité, en informant le Client au moins ${PREAVIS} à l’avance ; le Client qui s’y oppose peut résilier sans frais avant la date de la cession.`,
        'Sous-traitance. Le Prestataire peut confier une partie de ses prestations à des sous-traitants, dont il répond ; pour les données personnelles, l’annexe s’applique.',
        'Indépendance. Les parties agissent en professionnels indépendants ; le contrat ne crée entre elles ni mandat, ni société, ni lien de subordination.',
        'Divisibilité. Si une clause est déclarée nulle ou réputée non écrite, les autres gardent leur effet, et les parties la remplacent par une clause valable d’effet aussi proche que possible.',
        'Non-renonciation. Le fait pour une partie de ne pas se prévaloir d’un manquement de l’autre ne vaut pas renonciation à s’en prévaloir plus tard.',
        `Communications. Les notifications se font par courriel : au Prestataire, à ${COURRIEL} ; au Client, à l’adresse de son compte principal. Un courriel vaut écrit entre les parties, et les enregistrements du Service font foi de sa date, sauf preuve contraire.`,
      ],
    },
  ]),

  art('modifications', 'Modification des CGV', [
    {
      type: 'paragraphe',
      texte: `Le Prestataire peut modifier les CGV, notamment pour suivre l’évolution du Service ou de la réglementation. La nouvelle version est notifiée au Client au moins ${PREAVIS} avant son entrée en vigueur, par courriel ou dans son espace, et soumise à son acceptation à sa connexion suivante. Le Client qui la refuse peut résilier son abonnement sans frais avant son entrée en vigueur. Une modification imposée par la loi ou par une autorité peut s’appliquer dans le délai qu’elles fixent.`,
    },
  ]),

  art('signalement', 'Contenus publiés et signalements', [
    {
      type: 'paragraphe',
      texte:
        'Le Prestataire héberge les pages publiques des cabinets et les espaces qu’ils ouvrent, sans en contrôler le contenu a priori. Chaque Client est l’éditeur de sa page et répond de ce qu’il y publie.',
    },
    {
      type: 'paragraphe',
      texte: `Point de contact unique, pour les autorités comme pour les utilisateurs (règlement (UE) 2022/2065 sur les services numériques, articles 11 et 12) : ${COURRIEL}, en français ou en anglais.`,
    },
    {
      type: 'paragraphe',
      texte: `Toute personne peut signaler à cette adresse un contenu qu’elle estime illicite, en indiquant l’adresse précise de la page, le contenu en cause, les raisons pour lesquelles elle le juge illicite, et ses nom et adresse électronique, avec une déclaration de bonne foi. Le Prestataire accuse réception du signalement, l’examine avec diligence et objectivité, et informe son auteur de sa décision.`,
    },
    {
      type: 'paragraphe',
      texte:
        'Lorsqu’un contenu est manifestement illicite ou contraire aux CGV, le Prestataire peut le rendre inaccessible, ou suspendre la page qui le porte ; il en informe le Client en motivant sa décision et en indiquant les voies de recours, dont la réclamation à la même adresse. Des signalements manifestement infondés, répétés, peuvent être écartés après un avertissement.',
    },
  ]),

  art('droit', 'Droit applicable et litiges', [
    {
      type: 'paragraphe',
      texte:
        'Les CGV sont soumises au droit français. En cas de différend, les parties recherchent d’abord une solution amiable : la partie qui s’estime lésée adresse à l’autre une réclamation écrite et motivée, et les parties disposent de trente jours à compter de sa réception pour s’accorder. À défaut, le litige est porté devant la juridiction compétente selon les règles du droit commun.',
    },
    {
      type: 'paragraphe',
      texte:
        'Le Client, qui contracte en professionnel pour les besoins de son activité, ne bénéficie pas des dispositions du code de la consommation, hors celles que la loi étend expressément à certains professionnels.',
    },
  ]),
]

const ANNEXE: SectionLegale[] = [
  {
    id: 'annexe-rgpd',
    titre: 'Annexe — Accord de sous-traitance (article 28 du RGPD) : le traitement',
    blocs: [
      {
        type: 'paragraphe',
        texte:
          'Le présent accord fait partie des CGV. Il règle les conditions dans lesquelles le Prestataire, sous-traitant, traite des données personnelles pour le compte du Client, responsable du traitement. Lorsque le Client a souscrit par un Revendeur, le Prestataire agit comme sous-traitant ultérieur de ce Revendeur, et les engagements ci-dessous bénéficient directement au Client.',
      },
      {
        type: 'lignes',
        lignes: [
          {
            terme: 'Objet',
            valeur:
              'La fourniture du Service : hébergement, conservation, affichage, transmission et traitement des données du suivi, y compris leur envoi à un fournisseur d’intelligence artificielle pour rédiger les contenus demandés.',
          },
          {
            terme: 'Durée',
            valeur: 'La durée du contrat, puis le temps de la restitution et de l’effacement prévus ci-dessous.',
          },
          {
            terme: 'Nature des opérations',
            valeur:
              'Collecte par les écrans, enregistrement, organisation, conservation, consultation, rédaction de propositions par l’IA, transmission aux personnes suivies (espace, rappels, courriels), export, effacement.',
          },
          {
            terme: 'Finalité',
            valeur:
              'Permettre au Client de suivre les personnes qu’il accompagne entre les séances, à des fins non médicales, et exclusivement pour son compte.',
          },
          {
            terme: 'Types de données',
            valeur:
              'Identité et coordonnées des personnes suivies ; dossier de suivi (séances, transcriptions provisoires, notes, synthèses, profil, exercices, audios, hypnoses) ; ce que la personne écrit (journal, notes du soir, messages) ; achats dans la boutique ; données de connexion et d’appareil pour les rappels. Certaines sont des données de santé (RGPD, article 9).',
          },
          {
            terme: 'Personnes concernées',
            valeur: 'Les personnes suivies par le Client ; ses Utilisateurs, pour ce qui les concerne dans les dossiers.',
          },
          {
            terme: 'Obligations du Client',
            valeur:
              'Fonder chaque traitement sur une base légale — pour les données de santé, en règle générale le consentement explicite des personnes —, les informer, documenter ses instructions, répondre à leurs demandes, et ne verser au Service que les données nécessaires.',
          },
        ],
      },
      {
        type: 'paragraphe',
        texte:
          'Les instructions documentées du Client sont les CGV, ses réglages dans le Service et ses gestes à l’écran — demander une rédaction, exporter ou supprimer une fiche —, ainsi que toute instruction écrite complémentaire acceptée par le Prestataire.',
      },
    ],
  },
  {
    id: 'annexe-engagements',
    titre: 'Annexe — Engagements du Prestataire',
    blocs: [
      { type: 'paragraphe', texte: 'Le Prestataire s’engage à :' },
      {
        type: 'liste',
        elements: [
          'ne traiter les données que sur instruction documentée du Client, y compris pour les transferts hors de l’Union européenne, sauf obligation légale dont il l’informe alors, si la loi le permet ; l’avertir immédiatement si une instruction lui paraît enfreindre la réglementation ;',
          `veiller à ce que les personnes autorisées à traiter les données — ${EXPLOITANTE} et, chez le prestataire technique désigné parmi les sous-traitants ultérieurs, les personnes qui administrent la plateforme — soient tenues à la confidentialité, et n’y accèdent que dans la mesure nécessaire ;`,
          'mettre en œuvre les mesures de sécurité appropriées prévues à l’article 32 du RGPD, décrites dans la politique de confidentialité ;',
          'ne recourir à un sous-traitant ultérieur que dans les conditions ci-dessous, en lui imposant les mêmes obligations de protection des données, et répondre de lui envers le Client ;',
          'aider le Client, par des mesures techniques et organisationnelles appropriées, à répondre aux demandes d’exercice des droits des personnes — l’export d’un dossier et la suppression d’une fiche sont disponibles à l’écran — et lui transmettre sans délai toute demande reçue directement ;',
          'aider le Client à garantir la sécurité du traitement, à notifier les violations de données, et à mener une analyse d’impact et, le cas échéant, la consultation préalable de la CNIL, en lui fournissant les informations dont il dispose ;',
          'au choix du Client, lui restituer puis effacer les données au terme du contrat, dans les conditions ci-dessous ;',
          'mettre à sa disposition les informations nécessaires pour démontrer le respect de ses obligations, et permettre des audits dans les conditions ci-dessous.',
        ],
      },
      {
        type: 'paragraphe',
        texte:
          'Le Prestataire tient le registre des traitements qu’il effectue pour le compte de ses clients (RGPD, article 30, 2). S’il venait à déterminer lui-même les finalités et les moyens d’un traitement en violation du présent accord, il en serait considéré comme le responsable (article 28, 10).',
      },
    ],
  },
  {
    id: 'annexe-sous-traitants',
    titre: 'Annexe — Sous-traitants ultérieurs',
    blocs: [
      {
        type: 'paragraphe',
        texte: `Le Client autorise de manière générale le recours aux sous-traitants ultérieurs ci-dessous. Le Prestataire l’informe de tout ajout ou remplacement au moins ${PREAVIS} à l’avance, par courriel ou dans son espace ; le Client peut s’y opposer pour un motif légitime tenant à la protection des données et, faute de solution, résilier sans frais avant la date du changement.`,
      },
      {
        type: 'prestataires',
        prestataires: [
          {
            nom: 'Le prestataire technique de l’éditrice',
            role: 'Le prestataire technique qui développe et administre la plateforme pour le compte de l’éditrice, lié par un engagement de confidentialité ; son identité et ses coordonnées sont communiquées à tout cabinet qui en fait la demande.',
            lieu: 'Intervient à distance sur les systèmes des hébergeurs ci-dessous, où les données restent stockées.',
            donnees:
              'Un accès d’administration à la base, donc techniquement à toutes les données du Service, réservé à son développement et à sa maintenance. Il ne consulte pas les dossiers ; un accès au contenu d’un dossier n’a lieu que sur la demande écrite du Client ou pour répondre à une obligation légale, et il est consigné.',
          },
          {
            nom: 'Vercel Inc.',
            role: 'Hébergement de l’application et exécution du serveur.',
            lieu: 'Serveur exécuté à Paris (cdg1) ; société établie aux États-Unis.',
            donnees: 'Les données qui transitent par le serveur le temps d’une requête.',
          },
          {
            nom: 'Supabase Pte. Ltd.',
            role: 'Base de données, fichiers et connexion aux comptes.',
            lieu: 'Région de Paris (eu-west-3), sur l’infrastructure d’Amazon Web Services ; société établie à Singapour.',
            donnees: 'Toutes les données du Service.',
          },
          {
            nom: 'Anthropic, PBC',
            role: 'Rédaction des contenus générés par l’intelligence artificielle.',
            lieu: 'États-Unis ; chaque rédaction est un transfert hors de l’Union européenne, encadré par les clauses contractuelles types que ses conditions commerciales intègrent.',
            donnees: 'Les éléments du dossier nécessaires à la rédaction demandée ; jamais une page de journal privée.',
          },
          {
            nom: 'Resend, Inc.',
            role: 'Envoi des courriels de la plateforme : connexion, invitations, notes d’honoraires.',
            lieu: 'États-Unis.',
            donnees: 'L’adresse du destinataire, le nom du cabinet et le courriel, avec sa pièce jointe s’il en a une.',
          },
          {
            nom: 'Stripe',
            role: 'Paiement en ligne de l’abonnement, des recharges et de l’option Hypnose, lorsqu’ils se paient ainsi ; paiements de la boutique du cabinet, sur son propre compte.',
            lieu: 'Selon le contrat du titulaire du compte Stripe.',
            donnees: 'Le produit, son prix et un identifiant interne ; la carte se saisit chez Stripe.',
          },
          {
            nom: 'hCaptcha (Intuition Machines, Inc.)',
            role: 'Vérification anti-robot des formulaires, lorsqu’elle est activée.',
            lieu: 'États-Unis.',
            donnees: 'Des signaux techniques du navigateur, le temps de la vérification.',
          },
          {
            nom: 'SerpApi',
            role: 'Lecture de la fiche Google publique du cabinet, à sa demande.',
            lieu: 'États-Unis.',
            donnees: 'Des informations publiques ; aucune donnée de personne suivie.',
          },
        ],
      },
      {
        type: 'paragraphe',
        texte:
          'Les transferts hors de l’Union européenne vers les sous-traitants ultérieurs ci-dessus reposent sur les clauses contractuelles types de la Commission européenne et, lorsque le prestataire y adhère, sur le cadre de protection des données UE–États-Unis. Le Client qui utilise sa propre clé Anthropic contracte lui-même avec Anthropic pour ces rédactions.',
      },
      {
        type: 'paragraphe',
        texte:
          'Services du navigateur et du téléphone. La reconnaissance vocale du navigateur (Google pour Chrome, Microsoft pour Edge, Apple pour Safari) et le service de notification du téléphone (Google, Apple, Mozilla ou Microsoft, selon l’appareil) ne sont pas des sous-traitants ultérieurs du Prestataire : ce sont les services de l’éditeur du navigateur ou du téléphone que l’Utilisateur a choisi. Ils ne sont sollicités que lorsque l’Utilisateur lance la dictée ou l’enregistrement d’une séance, ou autorise les notifications, et relèvent des conditions propres à cet éditeur. Le Prestataire n’a pas de contrat avec eux, ne leur impose pas les obligations du présent accord et n’en répond pas ; il ne reçoit jamais le son, seulement le texte transcrit, et ne confie au service de notification qu’un rappel chiffré que celui-ci ne peut pas lire.',
      },
      {
        type: 'paragraphe',
        texte:
          'Il appartient au Client, responsable du traitement, de décider s’il utilise la dictée pour des contenus cliniques et d’en informer les personnes qu’il suit. S’il n’accepte pas que la voix parte chez l’éditeur du navigateur, il ne dicte aucune donnée de santé qui permette d’identifier une personne, et saisit ces contenus au clavier.',
      },
    ],
  },
  {
    id: 'annexe-violations',
    titre: 'Annexe — Violations de données',
    blocs: [
      {
        type: 'paragraphe',
        texte: `Le Prestataire notifie au Client toute violation de données personnelles qui le concerne dans les ${ALERTE_VIOLATION} après en avoir pris connaissance, par courriel à l’administrateur du cabinet. La notification décrit, dans la mesure du possible, la nature de la violation, les catégories et le nombre approximatif de personnes et d’enregistrements concernés, ses conséquences probables et les mesures prises ou envisagées ; ce qui n’est pas encore connu est transmis dès que possible. Il revient au Client, responsable du traitement, de notifier la CNIL dans les soixante-douze heures et, le cas échéant, d’informer les personnes ; le Prestataire l’y aide.`,
      },
    ],
  },
  {
    id: 'annexe-fin',
    titre: 'Annexe — Fin du contrat : restitution et effacement',
    blocs: [
      {
        type: 'paragraphe',
        texte: `À la fin du contrat, quelle qu’en soit la cause, les données du Client restent accessibles en lecture et exportables pendant ${RESTITUTION} : le Client exporte ses dossiers en PDF depuis son espace, ou demande une copie dans un format structuré et lisible par machine. Au terme de ce délai, le Prestataire efface les données dans les ${EFFACEMENT} qui suivent, sauf obligation légale de conservation ; les sauvegardes les effacent à leur tour au terme de leur rotation. Le Client peut demander par écrit un effacement anticipé, que le Prestataire lui confirme une fois réalisé. Les factures et les pièces comptables sont conservées le temps que la loi impose.`,
      },
    ],
  },
  {
    id: 'annexe-audits',
    titre: 'Annexe — Documentation et audits',
    blocs: [
      {
        type: 'paragraphe',
        texte:
          'Le Prestataire met à la disposition du Client, sur demande, la documentation nécessaire pour démontrer le respect du présent accord : description des mesures de sécurité, liste des sous-traitants ultérieurs, registre des traitements pour ce qui le concerne.',
      },
      {
        type: 'paragraphe',
        texte:
          'Le Client peut en outre faire procéder à un audit, y compris à des inspections — sur pièces, à distance ou sur place —, dans les conditions suivantes :',
      },
      {
        type: 'liste',
        elements: [
          'à ses frais ;',
          'en prévenant le Prestataire au moins trente jours à l’avance ;',
          'au plus une fois par an, sauf à la suite d’une violation de données ou à la demande d’une autorité de contrôle ;',
          'par le Client lui-même ou par un auditeur indépendant tenu à la confidentialité, qui n’est pas un concurrent du Prestataire ;',
          'pendant les heures ouvrées, sans perturber le Service, et sans accès aux données d’autres clients.',
        ],
      },
      {
        type: 'paragraphe',
        texte:
          'Le Prestataire y coopère de bonne foi. Les sous-traitants ultérieurs sont audités au travers de leurs propres rapports et attestations.',
      },
    ],
  },
  {
    id: 'annexe-hds',
    titre: 'Annexe — Hébergement des données de santé',
    blocs: [
      {
        type: 'paragraphe',
        texte:
          'Le Prestataire informe le Client que le Service n’est pas hébergé dans les conditions de l’article L1111-8 du code de la santé publique, qui visent les données de santé recueillies lors d’activités de prévention, de diagnostic, de soins ou de suivi social et médico-social : aucune certification d’hébergeur de données de santé (HDS) n’est revendiquée. Le Client, ainsi informé, déclare exercer une activité d’accompagnement non médicale qui ne relève pas de ces activités, et s’interdit d’utiliser le Service pour une activité qui en relèverait.',
      },
      {
        type: 'paragraphe',
        texte:
          'Les données sont stockées dans l’Union européenne, dans la région de Paris ; les rédactions par l’intelligence artificielle impliquent un transfert aux États-Unis, dont le Client informe les personnes qu’il suit.',
      },
    ],
  },
]

const CONDITIONS_DE_VENTE: PageLegale = {
  cle: 'cgv',
  chemin: CGV,
  titre: 'Conditions générales de vente',
  description: `Les conditions auxquelles ${NOM_COMMERCIAL} fournit Klaro aux cabinets : abonnement, prix, jetons d’IA, données, responsabilité, et l’accord de sous-traitance des données.`,
  chapo: `Ces conditions forment le contrat entre l’éditrice de Klaro, ${EDITRICE}, et chaque cabinet qui s’y abonne, directement ou par un revendeur. Elles s’adressent à des professionnels ; elles sont complétées par les conditions générales d’utilisation, la politique de confidentialité et, en annexe, l’accord de sous-traitance des données.`,
  sections: [...ARTICLES, ...ANNEXE],
}

/* ------------------------------------------------------------------ *
 * Mentions légales
 * ------------------------------------------------------------------ */

const MENTIONS: PageLegale = {
  cle: 'mentions',
  chemin: cheminLegal('mentions'),
  titre: 'Mentions légales',
  description: 'Qui édite Klaro, qui l’héberge, et comment joindre l’éditrice.',
  chapo:
    'Les informations que la loi pour la confiance dans l’économie numérique (loi n° 2004-575 du 21 juin 2004, article 1-1) demande à tout service en ligne : qui l’édite, qui en répond, et qui l’héberge.',
  sections: [
    {
      id: 'editeur',
      titre: 'Éditrice',
      blocs: [
        {
          type: 'lignes',
          lignes: [
            { terme: 'Dénomination', valeur: EDITRICE },
            { terme: 'Nom commercial', valeur: NOM_COMMERCIAL },
            {
              terme: 'Forme juridique',
              valeur: 'Entreprise individuelle (EI), sous le régime de la micro-entreprise ; sans capital social.',
            },
            { terme: 'Siège et établissement', valeur: ADRESSE },
            {
              terme: 'Immatriculation',
              valeur: `SIREN ${SIREN} ; SIRET du siège ${SIRET} ; inscrite au Registre national des entreprises (RNE).`,
            },
            { terme: 'Code APE', valeur: CODE_APE },
            { terme: 'TVA intracommunautaire', valeur: TVA_INTRACOMMUNAUTAIRE },
            { terme: 'Création', valeur: `Entreprise créée le ${DATE_DE_CREATION}.` },
            { terme: 'Téléphone', valeur: TELEPHONE },
            { terme: 'Courriel', valeur: COURRIEL },
            { terme: 'Adresse du service', valeur: DOMAINE_CABINETS },
          ],
        },
      ],
    },
    {
      id: 'publication',
      titre: 'Direction de la publication',
      blocs: [
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Direction de la publication',
              valeur: `L’exploitante de ${NOM_COMMERCIAL}.`,
            },
          ],
        },
      ],
    },
    {
      id: 'hebergement',
      titre: 'Hébergement',
      blocs: [
        {
          type: 'paragraphe',
          texte: 'Le service est hébergé par deux prestataires, qui font tourner l’application et stockent ses données à Paris.',
        },
        {
          type: 'lignes',
          lignes: [
            {
              terme: 'Application et serveur',
              valeur: `${HEBERGEUR}. Serveur exécuté dans la région de Paris (cdg1).`,
            },
            {
              terme: 'Base de données, fichiers et connexion',
              valeur: `${HEBERGEUR_BASE}. Données stockées dans la région de Paris (eu-west-3), sur l’infrastructure d’Amazon Web Services.`,
            },
          ],
        },
      ],
    },
    {
      id: 'donnees',
      titre: 'Données personnelles',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Contact pour les données personnelles : ${EDITRICE}, à ${COURRIEL}, ou par courrier à l’adresse du siège.`,
        },
        {
          type: 'paragraphe',
          texte: 'Ce que Klaro fait des données, et comment exercer vos droits, est décrit dans la',
          lien: { libelle: 'politique de confidentialité', href: cheminLegal('confidentialite') },
        },
      ],
    },
    {
      id: 'cabinets',
      titre: 'Les pages des cabinets',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Chaque cabinet publie, à son adresse (${DOMAINE_CABINETS}/son-identifiant, ou son propre domaine), une page dont il est l’éditeur : ses propres mentions légales figurent en bas de cette page. L’éditrice de Klaro n’en est que l’hébergeur technique.`,
        },
        {
          type: 'paragraphe',
          texte: `Pour signaler un contenu manifestement illicite publié sur la page d’un cabinet ou dans un espace de la plateforme : ${COURRIEL}, en indiquant l’adresse de la page, le contenu en cause et pourquoi il vous paraît illicite. Cette adresse est aussi le point de contact unique prévu par le règlement européen sur les services numériques. La procédure est décrite dans les`,
          lien: { libelle: 'conditions générales de vente', href: `${CGV}#signalement` },
        },
      ],
    },
    {
      id: 'propriete',
      titre: 'Propriété intellectuelle',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'La marque Klaro, le logiciel et les textes de ce site appartiennent à l’éditrice ; leur reproduction sans accord est interdite. Les polices de caractères employées, dont Newsreader et Public Sans, sont distribuées sous licence SIL Open Font License.',
        },
      ],
    },
  ],
}

/** Les quatre pages, par clé. */
export const PAGES_LEGALES: Record<CleLegale, PageLegale> = {
  confidentialite: CONFIDENTIALITE,
  conditions: CONDITIONS,
  cgv: CONDITIONS_DE_VENTE,
  mentions: MENTIONS,
}

/* ------------------------------------------------------------------ *
 * Lire une page comme un texte
 * ------------------------------------------------------------------ */

/** Tout ce qu'une page affiche, bloc par bloc — pour les épreuves et le banc. */
export function textesDe(page: PageLegale): string[] {
  const textes = [page.titre, page.description, page.chapo]
  for (const section of page.sections) {
    textes.push(section.titre)
    for (const bloc of section.blocs) {
      switch (bloc.type) {
        case 'paragraphe':
          textes.push(bloc.texte, bloc.lien?.libelle ?? '')
          break
        case 'encart':
          textes.push(bloc.texte)
          break
        case 'liste':
          textes.push(...bloc.elements)
          break
        case 'lignes':
          for (const l of bloc.lignes) textes.push(l.terme, l.valeur)
          break
        case 'prestataires':
          for (const p of bloc.prestataires) textes.push(p.nom, p.role, p.lieu, p.donnees)
          break
      }
    }
  }
  return textes.filter(Boolean)
}

/** Les champs qu'il reste à compléter dans une page, dans l'ordre de lecture. */
export function champsACompleter(page: PageLegale): string[] {
  return textesDe(page).flatMap((t) => t.match(MOTIF_A_COMPLETER) ?? [])
}

/**
 * Ce qu'aucune page légale ne dira jamais.
 *
 * Une certification qu'on n'a pas, une conformité affirmée comme un tampon,
 * le nom d'un modèle d'analyse. DIRE qu'aucune certification n'est
 * revendiquée reste permis — c'est même attendu : ces motifs visent
 * l'affirmation, pas la négation.
 */
export const REVENDICATIONS_INTERDITES: RegExp[] = [
  /HDS\s+certifi/i,
  /certifi(?:é|ée|és|ées|cation)\s+HDS/i,
  /(?:hébergeur|hébergement)\s+(?:de\s+données\s+de\s+santé\s+)?(?:agréé|certifié)/i,
  /(?:certifié|agréé)\s+(?:pour\s+les\s+)?données\s+de\s+santé/i,
  /conforme\s+(?:au\s+)?RGPD/i,
  /\b(?:claude|opus|sonnet|haiku|gpt)\b/i,
]

/** Les revendications interdites trouvées dans un texte — vide quand il est propre. */
export function revendicationsInterdites(texte: string): string[] {
  return REVENDICATIONS_INTERDITES.filter((m) => m.test(texte)).map(String)
}
