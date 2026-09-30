/**
 * Le texte des trois pages légales de la plateforme.
 *
 * ÉCRIT D'APRÈS LE CODE, PAS D'APRÈS UN MODÈLE DE DOCUMENT. Chaque phrase dit
 * ce que le logiciel fait réellement — où tourne la base (Supabase, Paris,
 * eu-west-3), où tourne le serveur (Vercel, Paris, cdg1, vercel.json), ce qui
 * part aux États-Unis (le texte analysé par Anthropic, server/ai.ts), ce que
 * le navigateur envoie à son éditeur (la voix, src/services/speech.ts), quand
 * la transcription s'efface (0043), ce que le patient peut faire seul depuis
 * « Moi » (src/patient/MonCompte.tsx). Quand le code change, ce texte change
 * avec lui : legal.test.ts relit les durées et les libellés d'écran qu'il cite.
 *
 * CE QU'ON NE PEUT PAS SAVOIR D'ICI reste écrit en clair, entre crochets :
 * « [À COMPLÉTER : …] ». La raison sociale, le SIREN, l'adresse, le directeur
 * de la publication, le contact pour les données, les garanties exactes des
 * contrats des prestataires, les durées que personne n'a encore fixées. Un
 * crochet vide de sens vaut mieux qu'une valeur plausible inventée : sur un
 * document juridique, une fausse précision engage.
 *
 * RIEN N'EST REVENDIQUÉ QUE LE CODE NE FAIT PAS — et d'abord aucune
 * certification d'hébergeur de données de santé. `revendicationsInterdites`
 * le tient, pour ces pages comme pour la page de vente.
 */
import { DOMAINE_CABINETS } from '@/lib/domaine'
import { plural } from '@/lib/format'
import { DELAIS_INACTIVITE, DELAI_PAR_DEFAUT } from '@/lib/inactivite'
import { HEBERGEUR } from '@/lib/mentionsLegales'
import { DELAI_PURGE_JOURS } from '@/lib/seance'
import { cheminLegal, type CleLegale } from './chemins'

/* ------------------------------------------------------------------ *
 * La validation
 * ------------------------------------------------------------------ */

/**
 * Les documents ont-ils été relus par un conseil juridique ?
 *
 * Tant que c'est faux, chaque page porte en tête un bandeau « Document à
 * faire valider juridiquement ». À ne passer à vrai qu'une fois la relecture
 * faite ET chaque « [À COMPLÉTER : …] » remplacé : l'épreuve refuse un
 * document déclaré validé qui en garde un seul.
 */
export const VALIDE_JURIDIQUEMENT = false

/** La date affichée en tête des trois pages. À changer à chaque révision. */
export const MISE_A_JOUR = '29 septembre 2026'

/** Un champ que le code ne peut pas connaître, écrit pour se voir. */
function aCompleter(quoi: string): string {
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
 * Ce que les trois pages citent du code
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
/**
 * L'éditrice : une entrepreneuse individuelle. Depuis le 15 mai 2022, une EI
 * se désigne par le nom de la personne suivi de « entrepreneur individuel »
 * ou « EI » (code de commerce, art. R526-26 et suivants) : le nom commercial
 * seul ne suffit pas.
 */
const RAISON_SOCIALE = 'LO HYPNOSE — Laetitia OLLIVIER, entrepreneur individuel (EI)'
/** L'adresse de contact publique : questions, données, signalements. */
const CONTACT = 'contact@klaroweb.site'
/** L'établissement de l'éditrice. */
const ADRESSE_EDITRICE = '2 avenue Saint-Augustin, 06200 Nice, France'

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
            'Les données de votre suivi sont celles de votre cabinet : c’est lui qui en répond, en tant que responsable du traitement. Klaro les héberge et les traite pour son compte, selon ses instructions, en tant que sous-traitant.',
            'La base de données et le serveur de l’application fonctionnent à Paris.',
            'Pour rédiger un brouillon de note, le texte d’une séance est envoyé à Anthropic, aux États-Unis, avec la clé du cabinet. La voix, elle, ne parvient jamais à Klaro : c’est le navigateur qui la transcrit.',
            `La transcription d’une séance est effacée à l’envoi de la note, et d’office au bout de ${PURGE}.`,
            'Le journal reste privé tant que la personne suivie ne partage pas une page. L’équipe commerciale ne voit jamais un dossier.',
            'Aucune publicité, aucune mesure d’audience, aucune revente de données.',
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
              terme: 'L’éditeur de Klaro',
              valeur: `${RAISON_SOCIALE}. Pour les données des patients, l’éditeur est sous-traitant du cabinet (RGPD, article 28) : il les héberge, les protège et les traite uniquement pour faire fonctionner le service, selon les instructions du cabinet, et ne s’en sert à aucune autre fin. Pour les comptes professionnels, la sécurité de la plateforme et les demandes d’essai, il est responsable du traitement.`,
            },
            {
              terme: 'Le revendeur',
              valeur: `L’équipe qui a ouvert le cabinet et gère son abonnement. Elle voit le nom du cabinet, les adresses de ses thérapeutes, l’abonnement et des compteurs agrégés — jamais un nom de patient, une note, une transcription ni une page de journal : la base ne lui en ouvre aucun chemin. ${aCompleter('identité du revendeur, et sa qualité au regard du RGPD pour les comptes professionnels')}`,
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
                'Nom, adresse électronique, cabinet et rôle ; les réglages du cabinet (marque, site, programmes, boutique) ; les clés qu’il confie (analyse, paiement, messagerie), chiffrées par le serveur et jamais renvoyées au navigateur ; les notes d’honoraires émises.',
            },
            {
              terme: 'Visiteurs de la page d’accueil',
              valeur:
                'Pour une demande d’essai : nom, adresse électronique, téléphone s’il est donné, cabinet, ville, nombre de patients, offre souhaitée, message, et la date de l’accord donné pour être recontacté.',
            },
            {
              terme: 'Données techniques',
              valeur:
                'Le journal des gestes — qui a fait quoi, et quand, sans jamais le contenu d’un dossier —, les traces de connexion tenues par le service d’authentification, et ce que le navigateur garde pour que l’application fonctionne (voir plus bas).',
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
                'Faire fonctionner l’espace du cabinet et celui de la personne suivie : c’est le service que le cabinet a choisi, et c’est lui qui en fixe la base légale. L’enregistrement d’une séance, lui, ne commence jamais sans le consentement de la personne, recueilli à l’écran et horodaté.',
            },
            {
              terme: 'L’analyse du texte',
              valeur:
                'Rédiger, à la demande du cabinet, un brouillon de note, un profil, un exercice, une hypnose ou des affirmations. Rien ne part sans cette demande — un geste à l’écran, ou le renouvellement des affirmations chaque lundi quand le cabinet l’a activé. Ce qui revient est une proposition que la thérapeute relit avant de s’en servir.',
            },
            {
              terme: 'Les rappels',
              valeur:
                'Faire arriver sur le téléphone de la personne suivie les rappels que programme son cabinet, et celui du soir qu’elle a choisi. Elle les active et les coupe elle-même.',
            },
            {
              terme: 'La boutique',
              valeur:
                'Encaisser, sur le compte Stripe du cabinet, les produits qu’il propose, et livrer ce qui a été payé. Le cabinet tient ses propres obligations comptables.',
            },
            {
              terme: 'Les comptes professionnels',
              valeur:
                'Ouvrir et faire fonctionner l’espace des thérapeutes et des revendeurs : c’est l’exécution du contrat d’abonnement (RGPD, article 6-1-b).',
            },
            {
              terme: 'La sécurité',
              valeur:
                'Garder la trace des gestes sensibles, limiter les tentatives de mot de passe, écarter les robots des formulaires : c’est l’intérêt légitime de l’éditeur et des cabinets à protéger les dossiers (article 6-1-f).',
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
          texte: `Les personnes qui administrent la plateforme disposent d’un accès technique à la base, nécessaire à sa maintenance. Elles ne consultent pas les dossiers, hors demande du cabinet ou obligation légale. ${aCompleter('personnes habilitées et procédure d’accès exceptionnel')}`,
        },
        { type: 'paragraphe', texte: 'Le service s’appuie sur les prestataires suivants.' },
        {
          type: 'prestataires',
          prestataires: [
            {
              nom: 'Supabase, Inc.',
              role: 'Base de données, fichiers (audios, logos, photos) et connexion aux comptes.',
              lieu: 'Région de Paris (eu-west-3), sur l’infrastructure d’Amazon Web Services. Société établie aux États-Unis.',
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
              role: 'Analyse du texte (brouillons de note, profil, exercices, hypnoses, affirmations), avec la clé et sous le compte du cabinet.',
              lieu: 'États-Unis.',
              donnees:
                'Pour une note de séance : la transcription et les notes prises pendant la séance. Pour les autres analyses : le nom inscrit sur la fiche, le programme, l’assiduité, les notes du soir, les exercices, les pages de journal partagées, le profil et, pour l’actualiser, la dernière synthèse avec un extrait de la transcription. Jamais une page de journal privée.',
            },
            {
              nom: 'L’éditeur de votre navigateur',
              role: 'Reconnaissance vocale, quand on dicte un texte ou qu’on enregistre une séance : Google pour Chrome, Microsoft pour Edge, Apple pour Safari.',
              lieu: 'Selon l’éditeur, souvent hors de l’Union européenne.',
              donnees: 'Le son de la voix, que le navigateur lui envoie pour le transcrire. Klaro ne reçoit que le texte.',
            },
            {
              nom: 'Services de notification des navigateurs',
              role: 'Acheminement des rappels jusqu’au téléphone : Google, Apple, Mozilla ou Microsoft, selon l’appareil.',
              lieu: 'Selon le fabricant.',
              donnees:
                'Un message chiffré pour ce seul téléphone : le service le porte sans pouvoir le lire. Un rappel qui n’a pas pu être remis dans les deux heures est abandonné.',
            },
            {
              nom: 'Stripe',
              role: 'Paiement des achats dans la boutique d’un cabinet, sur le compte Stripe de ce cabinet.',
              lieu: 'Selon le contrat que le cabinet a passé avec Stripe.',
              donnees:
                'Le produit, son prix et un identifiant interne de la fiche. La carte et l’adresse de paiement se saisissent chez Stripe : Klaro ne les voit jamais.',
            },
            {
              nom: 'Service d’envoi des courriels',
              role: 'Liens et codes de connexion, invitations : le service d’envoi de Supabase, ou le serveur de messagerie du cabinet quand il en a réglé un.',
              lieu: `Selon le service. ${aCompleter('prestataire d’envoi configuré pour la plateforme, s’il y en a un')}`,
              donnees: 'L’adresse électronique, le nom du cabinet et le lien ou le code. Jamais le contenu d’un dossier.',
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
            'le texte envoyé pour analyse à Anthropic, aux États-Unis — c’est le seul transfert qui porte le contenu d’un dossier ;',
            'le son de la voix, quand on dicte, chez l’éditeur du navigateur ;',
            'les rappels, chiffrés pour le seul téléphone qui les reçoit, qui transitent par le service de notification de son fabricant ;',
            'les courriels de connexion et d’invitation, selon le service d’envoi ;',
            'les signaux de vérification anti-robot, quand hCaptcha est activé.',
          ],
        },
        {
          type: 'paragraphe',
          texte: `Par ailleurs, Supabase et Vercel sont des sociétés établies aux États-Unis, même lorsque leurs serveurs sont à Paris. Ces transferts reposent sur les garanties prévues par les contrats de ces prestataires : clauses contractuelles types de la Commission européenne, ou adhésion au cadre de protection des données UE–États-Unis. ${aCompleter('garantie retenue pour chaque prestataire, vérifiée dans son contrat en vigueur')}`,
        },
        {
          type: 'paragraphe',
          texte: `L’analyse se fait sous le compte Anthropic du cabinet, selon les conditions qu’il a acceptées en créant sa clé. ${aCompleter('durée de conservation des requêtes chez Anthropic, d’après ses conditions en vigueur')}`,
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
              valeur: `Tant que le cabinet le conserve : c’est lui qui en fixe la durée, selon ses obligations. Clore un suivi referme l’espace de la personne sans rien effacer ; supprimer la fiche efface définitivement le dossier, les séances, les notes, les exercices, les audios, le journal et les hypnoses. ${aCompleter('durée de conservation recommandée aux cabinets après la fin d’un suivi')}`,
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
              valeur: `Jusqu’à ce que l’équipe qui les reçoit les efface. ${aCompleter('durée maximale de conservation d’une demande restée sans suite')}`,
            },
            {
              terme: 'Journal des gestes',
              valeur: aCompleter('durée de conservation — aucune purge n’est programmée à ce jour'),
            },
            {
              terme: 'Cabinet fermé',
              valeur: `Fermer un cabinet referme les espaces de ses patients et sa page publique, sans rien effacer : la thérapeute garde l’accès à ses dossiers pour les relire et les exporter. ${aCompleter('délai de restitution, puis d’effacement, après la fin du contrat')}`,
            },
            { terme: 'Sauvegardes', valeur: aCompleter('fréquence et durée de conservation des sauvegardes de la base') },
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
            'Les clés confiées par les cabinets — analyse, paiement, messagerie — sont chiffrées avant d’être enregistrées et ne reviennent jamais au navigateur.',
            'Les pages de l’application refusent de s’afficher dans le cadre d’un autre site, à l’exception du champ de connexion que les cabinets posent sur le leur.',
            'Sur l’écran verrouillé, un rappel ne dit par défaut ni ce qu’il rappelle, ni qui l’envoie : il se lit en ouvrant l’espace. La personne suivie peut choisir de l’y afficher en clair.',
            'Le journal des gestes et les journaux du serveur ne contiennent jamais le contenu d’un dossier.',
            `En cas de violation de données, l’éditeur prévient sans délai excessif les cabinets concernés, pour qu’ils puissent la notifier à la CNIL et, s’il y a lieu, aux personnes. ${aCompleter('délai d’alerte et contact dédié')}`,
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
          texte: `Vous êtes thérapeute ou membre d’un revendeur, ou vous avez demandé un essai : écrivez à ${CONTACT}.`,
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
          texte: `Cette politique suit le logiciel : quand il change ce qu’il fait des données, elle change avec lui, et la date en tête de page aussi. ${aCompleter('modalité d’information des cabinets en cas de changement important')}`,
        },
        {
          type: 'paragraphe',
          texte: 'L’éditeur, son adresse et les hébergeurs sont indiqués dans les',
          lien: { libelle: 'mentions légales', href: cheminLegal('mentions') },
        },
      ],
    },
  ],
}

/* ------------------------------------------------------------------ *
 * Conditions d'utilisation
 * ------------------------------------------------------------------ */

const CONDITIONS: PageLegale = {
  cle: 'conditions',
  chemin: cheminLegal('conditions'),
  titre: 'Conditions d’utilisation',
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
          texte: `Les présentes conditions régissent l’utilisation de la plateforme Klaro, accessible à l’adresse ${DOMAINE_CABINETS} et aux adresses des cabinets qui l’utilisent, éditée par ${RAISON_SOCIALE}.`,
        },
        {
          type: 'paragraphe',
          texte: `Elles s’appliquent à toute personne qui s’y connecte : thérapeutes et membres d’un cabinet, personnes suivies, membres d’un revendeur. L’abonnement d’un cabinet — son prix, sa durée, sa résiliation — relève d’un contrat distinct, passé avec le revendeur qui l’a ouvert. ${aCompleter('référence au contrat d’abonnement et à l’accord de sous-traitance (RGPD, article 28)')}`,
        },
        {
          type: 'paragraphe',
          texte: aCompleter(
            'modalité d’acceptation de ces conditions — par exemple une case à cocher à la première connexion, ou un renvoi dans le contrat d’abonnement',
          ),
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
            'pour le cabinet : les fiches de suivi, la prise de notes et l’enregistrement des séances, l’analyse du texte, le parcours d’exercices, les audios, les rappels, la boutique, le site du cabinet et les notes d’honoraires ;',
            'pour la personne suivie : ses tâches du jour, ses audios, son journal, sa note du soir, ses rappels et, si le cabinet les ouvre, sa boutique et sa prise de rendez-vous.',
          ],
        },
        {
          type: 'encart',
          texte:
            'Klaro est un outil de suivi. Il ne pose aucun diagnostic, ne prescrit rien, et ne remplace ni une consultation ni un avis médical. Il n’est pas surveillé en temps réel : un message écrit un soir n’est pas lu dans l’heure. En cas de détresse, appelez le 3114 (prévention du suicide, 24 h/24) ; en cas d’urgence, le 15 ou le 112.',
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
            'La connexion se fait par un lien ou un code envoyé par courriel ; un mot de passe peut s’y ajouter. Chacun garde ses moyens de connexion pour soi, et prévient son cabinet — ou l’éditeur — s’il soupçonne qu’un tiers y a eu accès.',
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
            'informer les personnes qu’il suit de l’usage de Klaro et de ses prestataires, notamment de l’analyse du texte aux États-Unis et de la transcription par le navigateur ;',
            'recueillir leur consentement avant d’enregistrer une séance, et respecter son retrait ;',
            'ne verser au dossier que ce qui est utile au suivi, et fixer la durée de sa conservation ;',
            'répondre aux demandes des personnes sur leurs données, avec les outils prévus : la copie du dossier, la suppression d’une fiche ;',
            'relire tout texte produit par l’analyse avant de s’en servir : c’est une proposition, et le cabinet reste seul responsable de ce qu’il valide, écrit ou dit ;',
            'tenir à jour les mentions légales de sa propre page, et répondre de ce qu’il y publie ;',
            'respecter les conditions des services qu’il branche lui-même : son compte Anthropic, son compte Stripe, son serveur de messagerie, son agenda de réservation.',
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
            `Vous pouvez fermer votre espace à tout moment, depuis « ${L.ongletPatient} ».`,
          ],
        },
      ],
    },
    {
      id: 'analyse',
      titre: 'L’analyse automatique du texte',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'À la demande du cabinet, Klaro envoie le texte d’une séance ou des éléments du dossier à Anthropic pour en tirer une proposition : note de séance, profil, exercice, hypnose, affirmations. L’analyse n’est possible qu’avec la clé que le cabinet a posée dans ses réglages : il paie ses appels directement à Anthropic, selon les conditions de celle-ci, et Klaro ne prélève rien dessus.',
        },
        {
          type: 'paragraphe',
          texte:
            'Avant chaque analyse de séance, l’écran indique ce qu’elle coûtera. Ce qui revient n’entre pas au dossier sans que la thérapeute l’ait relu — à l’exception des affirmations de la semaine, quand le cabinet a choisi leur renouvellement automatique ; il peut alors les corriger à tout moment.',
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
            'Pour les données des personnes suivies, l’éditeur agit en sous-traitant du cabinet : il ne les traite que pour fournir le service, selon les instructions du cabinet, et ne s’en sert à aucune autre fin. Prestataires, lieux, durées de conservation et droits sont détaillés dans la',
          lien: { libelle: 'politique de confidentialité', href: cheminLegal('confidentialite') },
        },
        {
          type: 'paragraphe',
          texte: `L’éditeur aide le cabinet à répondre aux demandes des personnes, et le prévient sans délai excessif de toute violation de données qui le concerne. ${aCompleter('accord de sous-traitance à signer avec chaque cabinet (RGPD, article 28)')}`,
        },
      ],
    },
    {
      id: 'disponibilite',
      titre: 'Disponibilité et évolutions',
      blocs: [
        {
          type: 'paragraphe',
          texte: `L’éditeur fait ses meilleurs efforts pour que le service soit disponible et sûr, sans pouvoir garantir qu’il le soit sans interruption : une maintenance, une panne d’un prestataire ou du réseau peuvent le suspendre. Le service évolue ; une fonctionnalité peut changer ou disparaître, et les cabinets sont prévenus de tout changement qui touche leurs données. ${aCompleter('engagement de disponibilité et délai de prévenance, s’il y en a')}`,
        },
      ],
    },
    {
      id: 'responsabilite',
      titre: 'Responsabilité',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Chacun répond de ce qu’il écrit et publie dans Klaro. L’éditeur ne répond ni des décisions de suivi prises par un cabinet, ni du fonctionnement des services tiers que le cabinet choisit de brancher. ${aCompleter('clauses de limitation de responsabilité, à rédiger par un conseil juridique')}`,
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
            'Le logiciel Klaro, son code, ses textes d’interface et sa marque appartiennent à l’éditeur. Le cabinet reste titulaire de ce qu’il crée — notes, exercices, audios, textes de sa page — et la personne suivie, de ce qu’elle écrit. L’éditeur ne s’en sert que pour faire fonctionner le service.',
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
            `Quand un cabinet est fermé, les espaces de ses patients et sa page publique se referment ; rien n’est effacé, et la thérapeute garde l’accès à ses dossiers pour les relire et les exporter. ${aCompleter('délai de restitution, puis d’effacement des données, après la fin du contrat')}`,
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
          texte: `Ces conditions peuvent évoluer avec le service ; la date de leur dernière mise à jour figure en tête de page. ${aCompleter('modalité d’information des utilisateurs avant l’entrée en vigueur d’un changement')}`,
        },
      ],
    },
    {
      id: 'droit',
      titre: 'Droit applicable',
      blocs: [
        {
          type: 'paragraphe',
          texte: `Ces conditions sont soumises au droit français. En cas de différend, une solution amiable est d’abord recherchée. ${aCompleter('juridiction compétente, et médiateur de la consommation pour les personnes suivies')}`,
        },
      ],
    },
  ],
}

/* ------------------------------------------------------------------ *
 * Mentions légales
 * ------------------------------------------------------------------ */

const MENTIONS: PageLegale = {
  cle: 'mentions',
  chemin: cheminLegal('mentions'),
  titre: 'Mentions légales',
  description: 'Qui édite Klaro, qui l’héberge, et comment joindre l’éditeur.',
  chapo:
    'Les informations que la loi pour la confiance dans l’économie numérique (loi n° 2004-575 du 21 juin 2004) demande à tout service en ligne : qui l’édite, qui en répond, et qui l’héberge.',
  sections: [
    {
      id: 'editeur',
      titre: 'Éditeur',
      blocs: [
        {
          type: 'lignes',
          lignes: [
            { terme: 'Dénomination', valeur: RAISON_SOCIALE },
            {
              terme: 'Forme juridique',
              valeur: 'Entreprise individuelle (EI), sous le régime de la micro-entreprise — sans capital social.',
            },
            { terme: 'Établissement', valeur: ADRESSE_EDITRICE },
            {
              terme: 'Immatriculation',
              valeur: 'SIREN 532 308 228 — SIRET 532 308 228 00024 — inscrite au Registre national des entreprises (RNE) — code APE 86.90F.',
            },
            {
              terme: 'TVA intracommunautaire',
              valeur: 'FR19532308228 — franchise en base : TVA non applicable, art. 293 B du CGI.',
            },
            { terme: 'Téléphone', valeur: '+33 6 20 71 96 30' },
            { terme: 'Courriel', valeur: CONTACT },
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
              terme: 'Directrice de la publication',
              valeur: 'Laetitia OLLIVIER, exploitante de LO HYPNOSE.',
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
              valeur: `${HEBERGEUR} — téléphone : +1 951 383 6898. Serveur exécuté dans la région de Paris (cdg1).`,
            },
            {
              terme: 'Base de données, fichiers et connexion',
              valeur: 'Supabase Pte. Ltd., 970 Toa Payoh North #07-04, Singapour 318992 — contact : https://supabase.com/support. Données stockées dans la région de Paris (eu-west-3), sur l’infrastructure d’Amazon Web Services.',
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
          texte: `Contact pour les données personnelles : ${RAISON_SOCIALE}, ${ADRESSE_EDITRICE} — ${CONTACT}.`,
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
          texte: `Chaque cabinet publie, à son adresse (${DOMAINE_CABINETS}/son-identifiant, ou son propre domaine), une page dont il est l’éditeur : ses propres mentions légales figurent en bas de cette page. Klaro n’en est que l’hébergeur technique.`,
        },
        {
          type: 'paragraphe',
          texte: `Pour signaler un contenu manifestement illicite publié sur la page d’un cabinet : ${CONTACT}, en précisant l’adresse de la page et le contenu en cause.`,
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
            'La marque Klaro, le logiciel et les textes de ce site appartiennent à l’éditeur ; leur reproduction sans accord est interdite. Les polices de caractères employées, dont Newsreader et Public Sans, sont distribuées sous licence SIL Open Font License.',
        },
      ],
    },
  ],
}

/** Les trois pages, par clé. */
export const PAGES_LEGALES: Record<CleLegale, PageLegale> = {
  confidentialite: CONFIDENTIALITE,
  conditions: CONDITIONS,
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
