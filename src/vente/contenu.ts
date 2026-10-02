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
import { BAREME_PAR_DEFAUT_ECRAN, CONSIGNES_PAR_SEANCE_ESTIMEES, jetonsDUneSeanceComplete } from '@/lib/jetonsIA'
import { LIENS_LEGAUX } from '@/legal/chemins'
import { COURRIEL } from '@/legal/identite'
import type { PlanCode } from '@/types/reseller'

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
 * Qui vend, qui répond — à compléter ici, et nulle part ailleurs
 * ------------------------------------------------------------------ */

/**
 * CELUI QUI PARLE SUR CETTE PAGE : KLARO, ET LUI SEUL.
 *
 * La page ne nomme que le logiciel. Qui lit les demandes d'essai, ouvre le
 * cabinet et règle l'abonnement, la visiteuse le connaît sous ce nom-là —
 * ni « l'équipe commerciale », ni « le revendeur », ni la société qui
 * l'exploite. L'identité légale de l'éditeur (raison sociale, forme,
 * SIREN, siège) a sa place dans les mentions légales (src/legal), pas ici.
 *
 * L'adresse de contact PUBLIQUE est celle des pages légales
 * (src/legal/identite.ts) : une seule boîte, au nom du service, pour les
 * questions, les données personnelles et les signalements. Vide, la page ne
 * l'afficherait pas, et `aFournirAvantLaMiseEnLigne()` le rappellerait.
 */
export const EDITEUR = {
  nom: 'Klaro',
  /** Une adresse de contact publique (pas une boîte personnelle). */
  contact: COURRIEL,
} as const

/* ------------------------------------------------------------------ *
 * Les prix
 * ------------------------------------------------------------------ */

/**
 * LA MENTION DES PRIX — à changer ici, et nulle part ailleurs.
 *
 * Les prix de la table `plans` s'entendent hors taxes, par cabinet et par
 * mois : c'est tranché (29 septembre). L'éditrice est une micro-entreprise
 * en franchise en base (confirmé le 30 septembre) : aucune TVA ne s'y ajoute,
 * et ses factures le disent (CGI, art. 293 B) — la page le dit aussi. Si la
 * franchise cessait (seuil dépassé, option), c'est cette phrase et l'article
 * « prix » des conditions de vente (src/legal/contenu.ts) qui changeraient.
 */
export const MENTION_PRIX = typographie(
  'Prix par cabinet et par mois, hors taxes. L’éditrice bénéficie de la franchise en base de TVA : aucune TVA ne s’y ajoute (TVA non applicable, art. 293 B du CGI).',
)

/** Pour les données structurées : les prix affichés ne comprennent pas la TVA. */
export const PRIX_TTC = false

/**
 * Comment on s'abonne, et s'il y a un engagement : ce que disent les
 * conditions de vente (souscription, résiliation), en une ligne sous les
 * offres.
 */
export const MODALITES = typographie(
  'Abonnement mensuel, sans engagement : résiliable à tout moment, avec effet à la fin du mois en cours. Essai de 14 jours, sans carte bancaire.',
)

/**
 * Ce qui manque encore pour mettre la page en ligne sans mentir par
 * omission. Le banc de rendu l'affiche ; la page, elle, se tait sur ce
 * qu'elle ne sait pas. Vide depuis le 30 septembre 2026.
 */
export function aFournirAvantLaMiseEnLigne(): string[] {
  const manque: string[] = []
  if (/à confirmer/.test(MENTION_PRIX)) manque.push('prix hors taxes ou toutes taxes comprises (MENTION_PRIX)')
  if (!MODALITES) manque.push('mode de paiement et engagement (MODALITES)')
  if (!EDITEUR.contact) manque.push('adresse de contact publique (EDITEUR.contact)')
  return manque
}

/* ------------------------------------------------------------------ *
 * Les jetons d'IA — ce que coûte une rédaction, dit en jetons
 * ------------------------------------------------------------------ */

/**
 * LES JETONS INCLUS CHAQUE MOIS, PAR OFFRE — lus dans le catalogue.
 *
 * `PLANS` porte la colonne `jetons_mois` des offres (0065) : la page la lit,
 * elle ne la recopie pas. Une offre sans entrée ne passe pas l'épreuve
 * (contenu.test.ts).
 */
export const JETONS_PAR_MOIS = Object.fromEntries(PLANS.map((p) => [p.code, p.jetonsMois])) as Record<
  PlanCode,
  number
>

/**
 * Le barème, en jetons par rédaction — à l'ordre de grandeur, pour se
 * repérer. L'écran affiche le chiffre exact avant chaque rédaction ; il peut
 * évoluer avec un préavis de trente jours (conditions de vente, « jetons »).
 */
export const BAREME = {
  /** La note d'une séance (et la mise à jour du profil qui la suit). */
  note: BAREME_PAR_DEFAUT_ECRAN.seance,
  /** Un module d'exercice, retenu en séance ou écrit dans l'atelier : le même prix. */
  module: BAREME_PAR_DEFAUT_ECRAN.module,
  /** Les modules qu'une séance retient, au plus haut de l'ordinaire. */
  modulesParSeance: CONSIGNES_PAR_SEANCE_ESTIMEES,
  /** Une séance complète : sa note, et ses modules retenus au prix du module. */
  seance: jetonsDUneSeanceComplete(BAREME_PAR_DEFAUT_ECRAN),
  /** Une hypnose de trente minutes, en quatre mouvements. */
  hypnose: BAREME_PAR_DEFAUT_ECRAN.hypnose,
} as const

/** Les recharges, valables douze mois, consommées après les jetons du mois. */
export const RECHARGES: ReadonlyArray<{ jetons: number; prixEuros: number }> = [
  { jetons: 100, prixEuros: 12 },
  { jetons: 300, prixEuros: 30 },
  { jetons: 1000, prixEuros: 85 },
]

/** L'option Hypnose : incluse dans certaines offres, sinon un accès de trente jours. */
export const OPTION_HYPNOSE = {
  /** Les offres dont la colonne `hypnose_incluse` (0065) est vraie. */
  incluseDans: PLANS.filter((p) => p.hypnoseIncluse).map((p) => p.code) as PlanCode[],
  prixEuros: 19,
  jours: 30,
  /** Les jetons offerts avec l'accès, valables le temps de l'accès. */
  jetons: 200,
} as const

/** « 2 000 » : les milliers séparés d'une espace insécable, comme on les écrit. */
export function nombre(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Combien de séances complètes tiennent dans un mois de jetons — arrondi par défaut. */
function seancesParMois(jetons: number): number {
  return Math.floor(jetons / BAREME.seance)
}

/** « 100 jetons 12 €, 300 jetons 30 € et 1 000 jetons 85 € » */
function recharges(): string {
  const r = RECHARGES.map((x) => `${nombre(x.jetons)} jetons ${x.prixEuros} €`)
  return r.length > 1 ? `${r.slice(0, -1).join(', ')} et ${r.at(-1)}` : (r[0] ?? '')
}

/** Les offres qui incluent l'option Hypnose, par leur nom. */
function offresAvecHypnose(): string {
  return PLANS.filter((p) => OPTION_HYPNOSE.incluseDans.includes(p.code))
    .map((p) => p.label)
    .join(' et ')
}

/**
 * L'encart sous les offres : ce qu'il faut savoir des jetons avant de
 * choisir. Il remplace celui qui demandait d'ouvrir un compte chez Anthropic
 * et d'y coller une clé : les rédactions passent désormais par la clé de la
 * plateforme, et se paient en jetons.
 */
export function encartJetons(): { titre: string; texte: string } {
  return typographie({
    titre: 'Les jetons d’IA, inclus chaque mois',
    texte: `Chaque rédaction de l’IA consomme des jetons, affichés avant de lancer : la note d’une séance ${BAREME.note}, chaque module ${BAREME.module} — en séance comme dans l’atelier —, soit environ ${BAREME.seance} pour une séance complète avec ${BAREME.modulesParSeance} modules ; une hypnose de 30 minutes ${BAREME.hypnose}. Rien n’est débité si la rédaction échoue. Chaque offre en inclut chaque mois ; au-delà, des recharges valables douze mois : ${recharges()} HT. L’option Hypnose est incluse dans ${offresAvecHypnose()} ; sinon, ${OPTION_HYPNOSE.prixEuros} € HT pour ${OPTION_HYPNOSE.jours} jours, avec ${OPTION_HYPNOSE.jetons} jetons.`,
  })
}

/** La durée de l'essai, bornée en base (0049 : quatorze jours à l'ouverture). */
export const JOURS_ESSAI = 14

/** Un repère du haut de page : un fait court, et sa précision. */
export interface Fait {
  valeur: string
  texte: string
  /** La section qui le détaille, quand il en faut une. */
  ancre?: string
}

/**
 * Les quatre repères sous la promesse. Chacun est dit en entier plus bas :
 * l'essai sous les offres, la relecture dans la note, le lien dans le
 * parcours, l'hébergement et l'analyse dans la confidentialité — qu'on
 * nomme ici tous les deux, pour ne pas laisser croire que tout reste à Paris.
 */
export const FAITS: Fait[] = typographie([
  { valeur: `${JOURS_ESSAI} jours d’essai`, texte: 'sans carte bancaire' },
  { valeur: 'Note relue par vous', texte: 'rien ne part chez le patient avant' },
  { valeur: 'Aucune application', texte: 'votre patient ouvre un lien' },
  { valeur: 'Dossiers à Paris', texte: 'analyse aux États-Unis : dit en clair', ancre: 'confidentialite' },
])

export interface OffreAffichee {
  code: string
  nom: string
  /** « 39 € » — l'euro entier, sans centimes quand il n'y en a pas. */
  prix: string
  patients: string
  lignes: string[]
  /**
   * Ce qui la distingue, en un fait — jamais « la plus choisie », qu'on ne
   * sait pas. Vide : pas de repère.
   */
  repere: string
}

function prixEntier(cents: number): string {
  const euros = cents / 100
  return Number.isInteger(euros) ? `${euros} €` : `${euros.toFixed(2).replace('.', ',')} €`
}

/**
 * Les trois offres, lues dans le catalogue du produit (src/data/reseller.ts,
 * le miroir de la table `plans`). Ce qu'une offre ouvre se lit sur ses
 * leviers — boutique, marque blanche, site — et non sur un texte recopié.
 *
 * L'ÉQUIPE N'EST PAS UN LEVIER. Un abonnement décide quatre choses (fiches,
 * boutique, marque blanche, site : server/droits.ts) ; l'écran Équipe n'a
 * aucune garde d'offre. Elle est donc dite « incluse dans toutes les
 * offres », et Réseau se distingue par ce qu'il ouvre vraiment : des
 * patients actifs sans limite. Le texte du catalogue (« Plusieurs
 * praticiennes par cabinet ») n'est pas repris.
 */
export function offres(): OffreAffichee[] {
  return typographie(offresBrutes())
}

function offresBrutes(): OffreAffichee[] {
  return PLANS.map((p) => {
    const lignes: string[] = []
    if (p.code === 'cabinet') lignes.push('Tout l’Essentiel')
    if (p.code === 'reseau') lignes.push('Tout le Cabinet')
    // Les jetons du mois, et ce qu'ils représentent : c'est ce qui se compare.
    const jetons = JETONS_PAR_MOIS[p.code]
    lignes.push(`${nombre(jetons)} jetons d’IA par mois, soit environ ${seancesParMois(jetons)} séances complètes`)
    if (OPTION_HYPNOSE.incluseDans.includes(p.code)) lignes.push('Option Hypnose incluse : scripts de 30 minutes')
    if (p.code === 'essentiel') {
      lignes.push('Notes de séance et consignes rédigées par l’IA, relues par vous')
      lignes.push('Espace patient à votre nom et à vos couleurs')
      if (p.shop) lignes.push('Boutique d’audios et de programmes')
    }
    if (p.code === 'cabinet') {
      if (p.marqueBlanche) lignes.push('Marque blanche totale : votre domaine, vos courriels')
      if (p.site) lignes.push('Site vitrine nourri par votre fiche Google')
    }
    if (p.code === 'reseau') lignes.push('Pour les cabinets qui suivent plus de 80 patients à la fois')
    const repere = p.code === 'cabinet' && p.marqueBlanche && p.site ? 'Votre domaine et votre site inclus' : ''
    return {
      code: p.code,
      nom: p.label,
      prix: prixEntier(p.priceCents),
      patients: p.maxPatients === null ? 'Patients actifs sans limite' : `Jusqu’à ${p.maxPatients} patients actifs`,
      lignes,
      repere,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Le parcours
 * ------------------------------------------------------------------ */

export interface Etape {
  /** Le pictogramme de l'étape (PageDeVente, dessiné en SVG sur place). */
  icone: 'micro' | 'note' | 'telephone' | 'courbe'
  titre: string
  texte: string
  detail: string
  /** L'aperçu vivant de l'étape, plus bas ou plus haut dans la page. */
  voir?: { ancre: string; libelle: string }
}

export const PARCOURS: Etape[] = typographie([
  {
    icone: 'micro',
    titre: 'La séance, enregistrée avec accord',
    texte:
      'Le consentement se recueille à l’écran, avant le premier mot. Le navigateur transcrit la voix ; vous notez à côté, et marquez d’un geste un mot à retenir ou un point à reprendre.',
    detail: 'Arrêt ou effacement, à la demande de la personne suivie.',
  },
  {
    icone: 'note',
    titre: 'Une note et des consignes, rédigées pour vous',
    texte:
      'L’IA propose un brouillon : synthèse, mots de la séance, fil rouge, points de vigilance, exercices et audios. Vous corrigez, retenez, écartez.',
    detail: 'Rien ne part chez votre patient avant votre validation.',
    voir: { ancre: 'note', libelle: 'Voir un brouillon' },
  },
  {
    icone: 'telephone',
    titre: 'Un espace sur son téléphone',
    texte:
      'Vos patients repartent avec leurs exercices du jour, vos audios, leur journal et leurs rappels, à votre nom et à vos couleurs. Un lien suffit.',
    detail: 'Quelques gestes par jour, pas un tableau de bord.',
    voir: { ancre: 'apercu', libelle: 'Voir l’espace patient' },
  },
  {
    icone: 'courbe',
    titre: 'Le suivi, entre deux séances',
    texte:
      'L’assiduité des sept derniers jours, la courbe de l’échelle du soir, les pages de journal partagées avec vous et les mots qu’on vous laisse.',
    detail: 'Vous voyez qui décroche, avant la séance suivante.',
    voir: { ancre: 'suivi', libelle: 'Voir le suivi' },
  },
])

/* ------------------------------------------------------------------ *
 * La note de séance — le cœur du produit, montré
 * ------------------------------------------------------------------ */

/**
 * Ce que la section « Après la séance » dit à côté du brouillon de
 * démonstration. Les jetons y sont dits en clair : ce qu'une séance
 * consomme, qu'on le voit avant de lancer, et ce qui se passe quand il n'y
 * en a plus — la première question d'une thérapeute qui essaie.
 */
export function pointsDeLaNote(): string[] {
  return typographie([
    'Rédigé à partir de la transcription et de vos notes, quand vous lancez la rédaction. Vous corrigez, décochez, validez : rien ne part chez votre patient avant.',
    `Chaque rédaction se paie en jetons, inclus chaque mois dans votre offre : ${BAREME.note} pour la note, ${BAREME.module} par module retenu — environ ${BAREME.seance} pour une séance complète. L’écran affiche le nombre avant de lancer, et rien n’est débité si la rédaction échoue.`,
    'Sans jetons disponibles, l’espace patient et le suivi fonctionnent, mais aucune note n’est rédigée — jusqu’au mois suivant, ou jusqu’à une recharge.',
  ])
}

/* ------------------------------------------------------------------ *
 * Les fonctionnalités, et le fichier qui prouve chacune
 * ------------------------------------------------------------------ */

export interface Fonction {
  titre: string
  texte: string
  /** Le fichier du dépôt qui la porte — éprouvé par contenu.test.ts. */
  preuve: string
}

/** Ce qui se cite d'une ligne, sous « Et aussi » — avec sa preuve, comme le reste. */
export interface Mention {
  texte: string
  preuve: string
}

export interface Groupe {
  titre: string
  intro: string
  /** Trois, pas plus : le parcours a déjà dit le reste. */
  fonctions: Fonction[]
  aussi: Mention[]
}

export const FONCTIONNALITES: Groupe[] = typographie([
  {
    titre: 'La séance et l’IA',
    intro: 'Pendant et juste après la séance, avec vous aux commandes.',
    fonctions: [
      {
        titre: 'Brouillon de note',
        texte: 'Synthèse, mots de la séance, questions à reprendre et points de vigilance — à relire, corriger, valider.',
        preuve: 'src/views/session/DraftStep.tsx',
      },
      {
        titre: 'Consignes et exercices',
        texte: 'Rédigés à partir de la séance, modifiables avant de partir chez votre patient.',
        preuve: 'src/views/therapist/ConsigneEditeur.tsx',
      },
      {
        titre: 'Hypnose personnalisée de 30 minutes',
        texte: 'Un texte en quatre mouvements, écrit pour cette personne, à lire en séance ou à télécharger en PDF.',
        preuve: 'src/lib/hypnosePdf.ts',
      },
    ],
    aussi: [
      { texte: 'dictaphone de séance', preuve: 'src/views/session/RecordStep.tsx' },
      { texte: 'profil qui s’affine séance après séance', preuve: 'src/views/therapist/PsychProfile.tsx' },
      { texte: 'dossier exportable en PDF', preuve: 'src/views/therapist/ExportDossier.tsx' },
    ],
  },
  {
    titre: 'L’espace patient',
    intro: 'Sur son téléphone, à votre marque. Pensé pour deux minutes par jour.',
    fonctions: [
      {
        titre: 'Exercices du jour et audios',
        texte: 'Ce que vous avez confié, et la bibliothèque d’audios de votre cabinet.',
        preuve: 'src/patient/Tache.tsx',
      },
      {
        titre: 'Journal, privé ou partagé',
        texte: 'Chaque page reste privée, sauf celles que votre patient choisit de vous montrer.',
        preuve: 'src/patient/Journal.tsx',
      },
      {
        titre: 'Un mot pour vous, et l’urgence à portée',
        texte: 'L’espace dit qu’il n’est pas surveillé en temps réel ; le 3114, le 15 et le 112 sont en bas de chaque écran.',
        preuve: 'src/patient/Urgence.tsx',
      },
    ],
    aussi: [
      { texte: 'échelle du soir de 0 à 10', preuve: 'src/lib/echelle.ts' },
      { texte: 'rappels sur le téléphone (sur iPhone, une fois l’espace ajouté à l’écran d’accueil)', preuve: 'src/patient/Rappels.tsx' },
      { texte: 'aucune application à télécharger', preuve: 'src/patient/Installer.tsx' },
    ],
  },
  {
    titre: 'Le cabinet',
    intro: 'Votre marque, votre boutique, votre équipe.',
    fonctions: [
      {
        titre: 'À votre nom et à vos couleurs',
        texte: 'Logo et couleurs du cabinet sur l’espace patient, à votre adresse klaroweb.site/votre-cabinet.',
        preuve: 'src/views/marque/MarqueView.tsx',
      },
      {
        titre: 'Boutique',
        texte: 'Audios, séances et programmes vendus depuis l’espace patient, encaissés sur votre compte Stripe.',
        preuve: 'server/shop.ts',
      },
      {
        titre: 'Équipe, dans toutes les offres',
        texte: 'Invitez vos collègues dans le même cabinet ; chacune et chacun entre avec son adresse.',
        preuve: 'src/views/equipe/EquipeView.tsx',
      },
    ],
    aussi: [
      { texte: 'programmes et bibliothèque audio', preuve: 'src/views/programmes/ProgrammesView.tsx' },
      { texte: 'votre propre domaine et vos courriels (Cabinet et Réseau)', preuve: 'server/domaines.ts' },
      { texte: 'site vitrine nourri par votre fiche Google (Cabinet et Réseau)', preuve: 'src/views/site/SiteView.tsx' },
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
      'Pour rédiger le brouillon, la transcription et vos notes sont envoyées à Anthropic, aux États-Unis. Ni Klaro ni Anthropic ne s’en servent pour entraîner un modèle.',
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
    texte: `Dans la base, chaque cabinet ne voit que ses dossiers. Le journal reste privé tant que votre patient ne partage pas une page. Côté ${EDITEUR.nom}, l’espace qui ouvre votre cabinet ne montre que des compteurs, jamais un patient.`,
    preuve: 'supabase/tests/isolation.sql',
  },
])

/**
 * Les autres services par lesquels passe une donnée, dits sans en oublier :
 * « voici où vont les données de séance » ne couvre ni la boutique, ni les
 * rappels, ni les courriels.
 */
export const AUTRES_PRESTATAIRES = typographie(
  'Autres prestataires : Stripe, pour les paiements de la boutique, sur le compte Stripe de votre cabinet ; les services de notification des fabricants (Apple, Google, Mozilla, Microsoft), qui portent les rappels chiffrés sans pouvoir les lire ; un service de messagerie pour les courriels de connexion et d’invitation — Resend, ou le vôtre avec la marque blanche ; votre outil de rendez-vous, si vous en reliez un ; et hCaptcha, quand la vérification anti-robot est activée à l’entrée.',
)

/** Ce que la page ne prétend pas. */
export const SANS_LABEL = typographie(
  'Aucune certification n’est revendiquée : ce que nous décrivons ici est ce que fait le logiciel, et vous pouvez nous demander comment.',
)

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

export interface Question {
  /** L'ancre de la question : un lien y mène, et l'ouvre (PageDeVente). */
  id: string
  question: string
  reponse: string
}

/** L'ancre de « Que coûte l'IA ? », vers laquelle les offres renvoient. */
export const ANCRE_COUT_IA = 'cout-ia'

export function questions(): Question[] {
  return typographie(questionsBrutes())
}

/** « 300 pour Essentiel, 800 pour Cabinet et 2 000 pour Réseau » */
function jetonsDesOffres(): string {
  const parOffre = PLANS.map((p) => `${nombre(JETONS_PAR_MOIS[p.code])} pour ${p.label}`)
  return parOffre.length > 1 ? `${parOffre.slice(0, -1).join(', ')} et ${parOffre.at(-1)}` : (parOffre[0] ?? '')
}

function questionsBrutes(): Question[] {
  return [
    {
      id: 'essai-deroulement',
      question: 'Comment se passe l’essai ?',
      reponse: `Vous remplissez le formulaire en bas de page. ${EDITEUR.nom} vous recontacte, ouvre votre cabinet en essai de ${JOURS_ESSAI} jours, sans carte bancaire, et vous envoie une invitation par courriel. L’essai comprend des jetons pour essayer les rédactions de l’IA : aucun compte à ouvrir ailleurs, aucune clé à coller.`,
    },
    {
      id: ANCRE_COUT_IA,
      question: 'Que coûte l’IA ?',
      reponse: `Elle se paie en jetons, et chaque offre en inclut chaque mois, crédités le 1er : ${jetonsDesOffres()}. La note d’une séance en consomme ${BAREME.note}, chaque module ${BAREME.module} — retenu en séance ou écrit dans l’atelier, le même prix —, soit environ ${BAREME.seance} pour une séance complète avec ${BAREME.modulesParSeance} modules ; une hypnose de 30 minutes ${BAREME.hypnose}. Le nombre s’affiche avant de lancer, et rien n’est débité si la rédaction échoue. Les jetons du mois ne se reportent pas ; au-delà, des recharges valables douze mois : ${recharges()} HT, consommées après ceux du mois. L’option Hypnose est incluse dans ${offresAvecHypnose()} ; sinon, ${OPTION_HYPNOSE.prixEuros} € HT pour ${OPTION_HYPNOSE.jours} jours, avec ${OPTION_HYPNOSE.jetons} jetons. Les rédactions passent par Anthropic, sous le compte de ${EDITEUR.nom} : vous n’avez aucune clé à fournir.`,
    },
    {
      id: 'apres-essai',
      question: `Et après les ${JOURS_ESSAI} jours ?`,
      reponse:
        'Si l’abonnement ne prend pas le relais, rien n’est effacé : vos dossiers restent accessibles, et vos patients gardent leur espace. Vous ne pouvez plus ouvrir de fiche, et la boutique, votre domaine et votre site se ferment, jusqu’à ce que l’abonnement reprenne.',
    },
    {
      id: 'qui-voit-quoi',
      question: 'Qui voit quoi ?',
      reponse: `Vous, et les collègues de votre équipe, voyez les dossiers de vos patients. Votre patient voit ses exercices, ses audios, son journal et son échelle ; ni vos notes, ni son profil. Ses pages de journal restent privées tant qu’il ne les partage pas ; son échelle du soir, elle, vous est toujours visible. Côté ${EDITEUR.nom}, l’espace qui ouvre votre cabinet ne montre que des compteurs : jamais un nom, une note ou une page de journal.`,
    },
    {
      id: 'responsable',
      question: 'Qui est responsable des données ?',
      reponse:
        'Vous êtes responsable du traitement des dossiers de vos patients ; Klaro les traite pour votre compte, comme sous-traitant, selon l’accord annexé à nos conditions générales de vente. Pour la rédaction, Anthropic intervient comme sous-traitant ultérieur, sous le compte de Klaro, et ne se sert pas de ces textes pour entraîner ses modèles.',
    },
    {
      id: 'hds',
      question: 'Les données sont-elles hébergées selon la norme HDS ?',
      reponse:
        'Non. Klaro n’est pas certifié HDS (hébergement de données de santé), et ne le prétend pas. La base et le serveur sont à Paris ; l’analyse du texte se fait aux États-Unis. Si votre cadre d’exercice l’exige, Klaro ne remplit pas cette condition aujourd’hui : parlez-en avec nous avant de commencer.',
    },
    {
      id: 'installer',
      question: 'Faut-il installer quelque chose ?',
      reponse:
        'Pour vous, non : un navigateur récent suffit (Chrome, Edge ou Safari pour la dictée). Pour votre patient, un lien : il peut ajouter son espace à l’écran d’accueil de son téléphone, sans magasin d’applications — sur iPhone, c’est ce qui permet de recevoir les rappels.',
    },
    {
      id: 'recuperer',
      question: 'Puis-je récupérer mes dossiers ?',
      reponse:
        'Oui, fiche par fiche : l’export fabrique un PDF avec l’identité et le programme, la synthèse de chaque séance envoyée, le profil, les notes du soir, les pages de journal partagées, votre anamnèse et vos notes de suivi. Chaque export laisse une trace — qui, quel dossier, quand — sans son contenu. À la fin de l’abonnement, vous pouvez aussi demander une copie de vos données dans un format structuré.',
    },
    {
      id: 'arreter',
      question: 'Peut-on arrêter ?',
      reponse: `Oui, à tout moment : l’abonnement est mensuel et sans engagement, et la résiliation prend effet à la fin du mois en cours. Vous le demandez à ${EDITEUR.nom}, qui a ouvert votre cabinet. Vos dossiers restent accessibles et exportables pendant trois mois, et chaque fiche s’exporte en PDF. Votre patient, lui, peut fermer son compte depuis son espace, à tout moment.`,
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Après la demande
 * ------------------------------------------------------------------ */

/** Ce qui se passe une fois la demande envoyée — dit avant, pas après. */
export const ENSUITE: Array<{ titre: string; texte: string }> = typographie([
  {
    titre: `${EDITEUR.nom} vous recontacte`,
    texte: 'Par courriel ou par téléphone, pour comprendre votre pratique et répondre à vos questions.',
  },
  {
    titre: 'Votre cabinet s’ouvre',
    texte:
      'Une invitation arrive par courriel. Vous acceptez les conditions à votre première connexion ; les jetons d’essai sont déjà là pour vos premières notes.',
  },
  {
    titre: 'Votre premier patient',
    texte: 'Vous ouvrez sa fiche, recueillez son accord en séance, puis lui donnez accès à son espace.',
  },
])

/* ------------------------------------------------------------------ *
 * Les pages légales
 * ------------------------------------------------------------------ */

/**
 * Les pages légales, lues dans la liste de celui qui les publie
 * (src/legal/chemins.ts) : `/confidentialite`, `/cgu`, `/cgv`, `/mentions`.
 * Quatre mots que la base refuse déjà comme identifiant de cabinet (0037) —
 * aucune adresse de cabinet ne peut les prendre, et aucune réservation n'est
 * à ajouter. reserves.test.ts le vérifie pour chacun. La page de vente
 * s'adresse à des professionnels : elle montre aussi les conditions de vente.
 */
export const PAGES_LEGALES: ReadonlyArray<{ chemin: string; libelle: string }> = LIENS_LEGAUX.map((l) => ({
  chemin: l.chemin,
  libelle: l.libelle,
}))

/** Le chemin de la politique de confidentialité — le formulaire y renvoie. */
export const CHEMIN_CONFIDENTIALITE =
  LIENS_LEGAUX.find((l) => l.cle === 'confidentialite')?.chemin ?? '/confidentialite'

/** Les deux documents que la case du formulaire fait accepter. */
export const CHEMIN_CGV = LIENS_LEGAUX.find((l) => l.cle === 'cgv')?.chemin ?? '/cgv'
export const CHEMIN_CGU = LIENS_LEGAUX.find((l) => l.cle === 'conditions')?.chemin ?? '/cgu'
