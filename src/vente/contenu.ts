/**
 * Ce que dit la page de vente — séparé de sa mise en page.
 *
 * TOUT CE QUI EST PROMIS ICI EXISTE DANS LE CODE. Chaque fonctionnalité
 * nomme le fichier qui la porte (`preuve`) ; contenu.test.ts vérifie que ces
 * fichiers existent. Une promesse sans preuve ne passe pas l'épreuve : on
 * l'écrit le jour où le code est là, pas avant.
 *
 * Ni témoignage, ni note, ni logo de client, ni chiffre d'efficacité : le
 * produit n'en a pas encore, et en inventer serait mentir à des soignantes
 * qui vont confier à ce produit ce qu'elles ont de plus sensible. Le banc de
 * rendu refuse ces mots (scripts/render-check.mts).
 */
import { PLANS } from '@/data/reseller'
import { COUT_HYPNOSE, estimationBrouillon } from '@/lib/coutIA'
import { euro } from '@/lib/format'

/**
 * La typographie française : une espace insécable avant « : ; ? ! » et à
 * l'intérieur des guillemets. Sans elle, le deux-points part seul en début
 * de ligne sur un téléphone. Appliquée à tout le texte de la page, jamais aux
 * chemins de fichiers ni aux adresses.
 */
export function typographie<T>(valeur: T, cle = ''): T {
  if (cle === 'preuve' || cle === 'chemin' || cle === 'code') return valeur
  if (typeof valeur === 'string') {
    return valeur.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0') as T
  }
  if (Array.isArray(valeur)) return valeur.map((v) => typographie(v)) as T
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, typographie(v, k)])) as T
  }
  return valeur
}

/* ------------------------------------------------------------------ *
 * Les prix
 * ------------------------------------------------------------------ */

/**
 * LA MENTION DES PRIX — à changer ici, et nulle part ailleurs.
 *
 * On ne sait pas encore si les prix de la table `plans` s'entendent hors
 * taxes ou toutes taxes comprises : la page dit « par mois » et le dit.
 */
export const MENTION_PRIX = typographie(
  'Prix indicatifs par cabinet et par mois — hors taxes ou toutes taxes comprises : à confirmer.',
)

/** La durée de l'essai, bornée en base (0049 : quatorze jours à l'ouverture). */
export const JOURS_ESSAI = 14

export interface OffreAffichee {
  code: string
  nom: string
  /** « 39 € » — l'euro entier, sans centimes quand il n'y en a pas. */
  prix: string
  patients: string
  lignes: string[]
}

function prixEntier(cents: number): string {
  const euros = cents / 100
  return Number.isInteger(euros) ? `${euros} €` : `${euros.toFixed(2).replace('.', ',')} €`
}

/**
 * Les trois offres, lues dans le catalogue du produit (src/data/reseller.ts,
 * le miroir de la table `plans`). Ce qu'une offre ouvre se lit sur ses
 * leviers — boutique, marque blanche, site — et non sur un texte recopié.
 */
export function offres(): OffreAffichee[] {
  return typographie(offresBrutes())
}

function offresBrutes(): OffreAffichee[] {
  return PLANS.map((p) => {
    const lignes: string[] = []
    if (p.code !== 'essentiel') lignes.push(p.code === 'cabinet' ? "Tout l'Essentiel" : 'Tout le Cabinet')
    if (p.code === 'essentiel') {
      lignes.push('Notes de séance et consignes rédigées par l’IA, relues par vous')
      lignes.push('Espace patient à votre nom et à vos couleurs')
    }
    if (p.shop && p.code === 'essentiel') lignes.push('Boutique d’audios et de programmes')
    if (p.marqueBlanche && p.code === 'cabinet') lignes.push('Marque blanche totale : votre domaine, vos courriels')
    if (p.site && p.code === 'cabinet') lignes.push('Site vitrine nourri par votre fiche Google')
    if (p.code === 'reseau') lignes.push('Plusieurs praticiennes dans le même cabinet')
    return {
      code: p.code,
      nom: p.label,
      prix: prixEntier(p.priceCents),
      patients: p.maxPatients === null ? 'Patients actifs sans limite' : `Jusqu’à ${p.maxPatients} patients actifs`,
      lignes,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Ce que coûte l'IA — calculé par le module qui l'estime à l'écran
 * ------------------------------------------------------------------ */

/**
 * La fourchette d'une note de séance, de la séance courte (quelques minutes
 * de matière) à l'heure pleine, et l'hypnose de trente minutes. Les chiffres
 * viennent de src/lib/coutIA.ts — celui qui affiche l'estimation avant chaque
 * analyse — et bougent avec lui.
 */
export function coutsIA(): { noteMin: string; noteMax: string; hypnose: string } {
  return {
    noteMin: euro(estimationBrouillon('x'.repeat(5_000)).euros),
    noteMax: euro(estimationBrouillon('x'.repeat(60_000)).eurosMax),
    hypnose: euro(COUT_HYPNOSE),
  }
}

/* ------------------------------------------------------------------ *
 * Le parcours
 * ------------------------------------------------------------------ */

export interface Etape {
  titre: string
  texte: string
  detail: string
}

export const PARCOURS: Etape[] = typographie([
  {
    titre: 'La séance, enregistrée avec son accord',
    texte:
      'Le consentement se recueille à l’écran, en présence du patient, avant le premier mot. Votre navigateur transcrit la voix ; vous prenez vos notes à côté, horodatées d’un geste.',
    detail: 'Le patient peut demander l’arrêt ou l’effacement à tout moment.',
  },
  {
    titre: 'Une note et des consignes, relues par vous',
    texte:
      'L’IA rédige un brouillon : synthèse, mots du patient, thèmes, points de vigilance, exercices et audios proposés. Vous corrigez, retenez, écartez.',
    detail: 'Rien n’entre dans le parcours du patient avant votre validation.',
  },
  {
    titre: 'L’espace du patient, sur son téléphone',
    texte:
      'Il repart avec ses exercices du jour, vos audios, son journal et ses rappels — à votre nom et à vos couleurs. Il l’ajoute à son écran d’accueil, sans passer par un magasin d’applications.',
    detail: 'Quelques gestes par jour, pas un tableau de bord.',
  },
  {
    titre: 'Le suivi, entre deux séances',
    texte:
      'Vous voyez l’assiduité semaine après semaine, la courbe de son échelle du soir, les pages de journal qu’il choisit de partager et le mot qu’il vous laisse.',
    detail: 'Vous repérez qui décroche avant la séance suivante, pas pendant.',
  },
])

/* ------------------------------------------------------------------ *
 * Les fonctionnalités, et le fichier qui prouve chacune
 * ------------------------------------------------------------------ */

export interface Fonction {
  titre: string
  texte: string
  /** Le fichier du dépôt qui la porte — éprouvé par contenu.test.ts. */
  preuve: string
}

export interface Groupe {
  titre: string
  intro: string
  fonctions: Fonction[]
}

export const FONCTIONNALITES: Groupe[] = typographie([
  {
    titre: 'La séance et l’IA',
    intro: 'Ce qui se fait pendant et juste après la séance, avec vous aux commandes.',
    fonctions: [
      {
        titre: 'Dictaphone de séance',
        texte: 'Transcription par le navigateur, notes horodatées, mots du patient et points à reprendre marqués d’un geste.',
        preuve: 'src/views/session/RecordStep.tsx',
      },
      {
        titre: 'Brouillon de note',
        texte: 'Synthèse, thèmes, mots du patient, questions à reprendre et points de vigilance — à relire, corriger, valider.',
        preuve: 'src/views/session/DraftStep.tsx',
      },
      {
        titre: 'Consignes et exercices',
        texte: 'Rédigés à partir de la séance, modifiables avant de partir chez le patient.',
        preuve: 'src/views/therapist/ConsigneEditeur.tsx',
      },
      {
        titre: 'Profil du patient',
        texte: 'Axes, leviers et points d’attention, qui s’affinent séance après séance, avec leurs courbes.',
        preuve: 'src/views/therapist/PsychProfile.tsx',
      },
      {
        titre: 'Hypnose personnalisée de 30 minutes',
        texte: 'Un texte en quatre mouvements, écrit pour ce patient, à lire en séance ou à télécharger en PDF.',
        preuve: 'src/lib/hypnosePdf.ts',
      },
      {
        titre: 'Le dossier de la fiche',
        texte: 'Historique des séances relues, anamnèse, notes datées, et export du dossier en PDF.',
        preuve: 'src/views/therapist/ExportDossier.tsx',
      },
    ],
  },
  {
    titre: 'L’espace du patient',
    intro: 'Sur son téléphone, à votre marque. Pensé pour deux minutes par jour.',
    fonctions: [
      {
        titre: 'Installable, sans magasin',
        texte: 'Un lien suffit ; il l’ajoute à son écran d’accueil s’il le souhaite.',
        preuve: 'src/patient/Installer.tsx',
      },
      {
        titre: 'Exercices du jour et audios',
        texte: 'Ce que vous lui avez confié, et la bibliothèque d’audios de votre cabinet.',
        preuve: 'src/patient/Tache.tsx',
      },
      {
        titre: 'Journal, privé ou partagé',
        texte: 'Chaque page reste privée, sauf celles qu’il choisit de vous partager.',
        preuve: 'src/patient/Journal.tsx',
      },
      {
        titre: 'Échelle du soir',
        texte: 'Une note de 0 à 10 sur la question que vous choisissez, en quinze secondes.',
        preuve: 'src/lib/echelle.ts',
      },
      {
        titre: 'Rappels sur le téléphone',
        texte: 'Des notifications, s’il les active — sur iPhone, une fois l’espace installé.',
        preuve: 'src/patient/Rappels.tsx',
      },
      {
        titre: 'Un mot pour vous, et l’urgence à portée',
        texte: 'Il peut vous laisser un mot. L’espace dit qu’il n’est pas surveillé en temps réel, et le 3114, le 15 et le 112 sont en bas de chaque écran.',
        preuve: 'src/patient/Urgence.tsx',
      },
    ],
  },
  {
    titre: 'Le cabinet',
    intro: 'Votre marque, votre vitrine, votre boutique — et votre équipe.',
    fonctions: [
      {
        titre: 'À votre nom et à vos couleurs',
        texte: 'Logo et couleurs du cabinet sur l’espace patient, sur votre adresse klaroweb.site/votre-cabinet.',
        preuve: 'src/views/marque/MarqueView.tsx',
      },
      {
        titre: 'Marque blanche totale',
        texte: 'Votre propre domaine, et les courriels qui partent de votre adresse (offres Cabinet et Réseau).',
        preuve: 'server/domaines.ts',
      },
      {
        titre: 'Site vitrine',
        texte: 'Une page publique nourrie par votre fiche Google : présentation, horaires, photos (offres Cabinet et Réseau).',
        preuve: 'src/views/site/SiteView.tsx',
      },
      {
        titre: 'Boutique',
        texte: 'Vendez audios, séances et programmes depuis l’espace patient, encaissés sur votre compte Stripe.',
        preuve: 'server/shop.ts',
      },
      {
        titre: 'Programmes et bibliothèque audio',
        texte: 'Vos programmes, vos audios, rangés par catégorie et attribués d’un clic.',
        preuve: 'src/views/programmes/ProgrammesView.tsx',
      },
      {
        titre: 'Équipe',
        texte: 'Invitez vos consœurs dans le même cabinet ; chacune entre avec son adresse.',
        preuve: 'src/views/equipe/EquipeView.tsx',
      },
    ],
  },
])

/* ------------------------------------------------------------------ *
 * La confidentialité, telle qu'elle est
 * ------------------------------------------------------------------ */

export interface Engagement {
  titre: string
  texte: string
  preuve: string
}

export const CONFIDENTIALITE: Engagement[] = typographie([
  {
    titre: 'Base et serveur à Paris',
    texte: 'Les dossiers sont conservés dans une base hébergée à Paris, où fonctionne aussi le serveur de l’application.',
    preuve: 'vercel.json',
  },
  {
    titre: 'Le texte est analysé aux États-Unis',
    texte:
      'Pour rédiger le brouillon, la transcription et vos notes sont envoyées à Anthropic, aux États-Unis — avec la clé de votre cabinet.',
    preuve: 'server/ai.ts',
  },
  {
    titre: 'La voix ne nous parvient jamais',
    texte:
      'La transcription est faite par le navigateur : le son part chez son éditeur (Google pour Chrome, Microsoft pour Edge, Apple pour Safari). Klaro ne reçoit que le texte.',
    preuve: 'src/data/session.ts',
  },
  {
    titre: 'Rien sans le consentement du patient',
    texte: 'Il est recueilli à l’écran avant d’enregistrer. Le patient peut demander l’arrêt ou l’effacement à tout moment.',
    preuve: 'src/views/session/ConsentStep.tsx',
  },
  {
    titre: 'La transcription ne reste pas',
    texte: 'Elle est effacée à l’envoi de la note, et d’office au bout de 7 jours si la note n’est jamais validée.',
    preuve: 'supabase/migrations/0043_la_seance_se_referme.sql',
  },
  {
    titre: 'Chaque cabinet est cloisonné',
    texte:
      'Dans la base, chaque cabinet ne voit que ses dossiers. Le journal du patient reste privé tant qu’il ne partage pas une page. L’équipe commerciale ne voit que des compteurs, jamais un patient.',
    preuve: 'supabase/tests/isolation.sql',
  },
])

/** Ce que la page ne prétend pas. */
export const SANS_LABEL = typographie(
  'Aucune certification n’est revendiquée : ce que nous décrivons ici est ce que fait le logiciel, et vous pouvez nous demander comment.',
)

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

export interface Question {
  question: string
  reponse: string
}

export function questions(): Question[] {
  return typographie(questionsBrutes())
}

function questionsBrutes(): Question[] {
  const c = coutsIA()
  return [
    {
      question: 'Qui voit quoi ?',
      reponse:
        'Vous — et les praticiennes de votre équipe — voyez les dossiers de vos patients. Le patient voit ses exercices, ses audios, son journal et son échelle ; ni vos notes, ni son profil. Ses pages de journal restent privées tant qu’il ne les partage pas ; son échelle du soir, elle, vous est toujours visible. L’équipe qui gère votre abonnement ne voit que des compteurs : jamais un nom, une note ou une page de journal.',
    },
    {
      question: 'Que devient la voix ?',
      reponse:
        'Elle ne nous parvient pas. Le navigateur transcrit la parole en l’envoyant chez son éditeur (Google, Microsoft ou Apple selon le navigateur) ; Klaro ne reçoit que le texte, jamais le son. Ce texte sert à rédiger le brouillon, puis il est effacé à l’envoi de la note — ou au bout de 7 jours si la note n’est jamais validée.',
    },
    {
      question: 'Faut-il installer quelque chose ?',
      reponse:
        'Pour vous, non : un navigateur récent suffit (Chrome, Edge ou Safari pour la dictée). Pour le patient, un lien : il peut ajouter son espace à l’écran d’accueil de son téléphone, sans magasin d’applications — sur iPhone, c’est ce qui lui permet de recevoir les rappels.',
    },
    {
      question: 'Que coûte l’IA ?',
      reponse: `L’abonnement paie le logiciel ; l’analyse est payée par votre cabinet directement à Anthropic, avec sa propre clé, posée dans les réglages. Klaro ne prend rien dessus. Avant chaque analyse, l’écran vous montre ce qu’elle coûtera : de ${c.noteMin} à ${c.noteMax} environ pour une note de séance selon sa longueur, autour de ${c.hypnose} pour une hypnose de 30 minutes.`,
    },
    {
      question: 'Peut-on arrêter ?',
      reponse:
        'Oui. L’abonnement se règle avec l’équipe qui a ouvert votre cabinet : il suffit de le lui demander. Les modalités — préavis, sort des données — figurent dans les conditions. Un patient, lui, peut fermer son compte depuis son espace, à tout moment.',
    },
    {
      question: 'Comment se passe l’essai ?',
      reponse: `Vous remplissez le formulaire ci-dessous ; nous revenons vers vous pour ouvrir votre cabinet, en essai de ${JOURS_ESSAI} jours. Vous recevez alors une invitation par courriel, et vous entrez dans un cabinet vide, prêt à recevoir votre premier patient.`,
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Les pages légales
 * ------------------------------------------------------------------ */

/**
 * Les chemins des pages légales. Écrits par le chantier qui les publie ;
 * relus au moment de finir (voir NOTES) — à corriger ici s'ils changent.
 */
export const PAGES_LEGALES = [
  { chemin: '/mentions-legales', libelle: 'Mentions légales' },
  { chemin: '/conditions', libelle: 'Conditions' },
  { chemin: '/confidentialite', libelle: 'Confidentialité' },
] as const
