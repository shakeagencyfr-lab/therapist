/**
 * Consignes détaillées des modules, telles que le patient les voit dans son
 * application : trois temps, un « pourquoi », parfois un quiz.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { Consigne, CustomModule, ModuleKind, PatientModule } from '@/types/domain'

/** Consignes écrites à la main, indexées par titre de module. */
export const CONSIGNES: Record<string, Consigne> = {
  "Geste d'ancrage avant le café du matin": {
    duree: '2 minutes',
    quand: 'Le matin, avant la première gorgée de café',
    steps: [
      'Debout, les deux pieds bien à plat, posez la main droite au centre du sternum.',
      "Trois respirations lentes, en laissant l'expiration durer plus longtemps que l'inspiration.",
      'Retirez la main et buvez la première gorgée en gardant la sensation de chaleur sous la main.',
    ],
    why: "Le geste doit exister avant d'être utile. On l'installe sur un moment calme et quotidien pour qu'il soit disponible le jour où la porte claque.",
    quiz: [
      {
        question: 'À quel moment de la journée ce geste est-il prévu ?',
        options: [
          "Quand l'envie de fumer arrive",
          'Le matin, avant la première gorgée de café',
          'Le soir avant de dormir',
        ],
        correct: 1,
        feedback: "On l'installe sur un moment calme et répété. C'est ce qui le rend disponible plus tard, quand la journée dérape.",
      },
      {
        question: "L'expiration doit être…",
        options: ["Plus courte que l'inspiration", 'De la même durée', "Plus longue que l'inspiration"],
        correct: 2,
        feedback: "C'est l'expiration longue qui fait le travail. L'inspiration, elle, se fait toute seule.",
      },
    ],
  },
  'Noter la situation la plus difficile de la journée': {
    duree: '3 minutes',
    quand: 'Le soir, avant de vous coucher',
    steps: [
      "Écrivez ce qui s'est passé, en une ou deux phrases, sans chercher à expliquer.",
      'Notez ce que le corps a fait à ce moment-là, avant les pensées.',
      'Notez ce que vous avez fait juste après.',
    ],
    why: "Ce n'est pas un journal intime. C'est la matière première de la prochaine séance : ce que vous notez à chaud, vous ne vous le rappellerez pas jeudi.",
  },
  'Lettre à la cigarette': {
    duree: '20 minutes, en une seule fois',
    quand: 'Quand vous avez du temps devant vous, pas le soir',
    steps: [
      "Écrivez-lui comme à quelqu'un qui a compté. Ce qu'elle vous a apporté, ce qu'elle vous a coûté.",
      'Dites-lui ce que vous avez trouvé ailleurs, ou ce que vous cherchez encore.',
      'Ne la relisez pas. Apportez-la jeudi, pliée, vous décidez sur place si vous la lisez à voix haute.',
    ],
  },
  'Cohérence cardiaque, matin et soir': {
    duree: '5 minutes, deux fois',
    quand: 'Au réveil et avant de monter vous coucher',
    steps: [
      'Assise, dos appuyé, téléphone hors de portée.',
      'Inspirez 5 secondes, expirez 5 secondes. Six respirations par minute pendant cinq minutes.',
      "Le soir, faites-le avant d'entrer dans la chambre, pas dans le lit.",
    ],
    why: "L'exercice du soir compte plus que celui du matin. C'est celui qui coupe l'alerte avant que la liste ne commence.",
    quiz: [
      {
        question: "Quel est le rythme respiratoire de l'exercice ?",
        options: [
          "5 secondes d'inspiration, 5 secondes d'expiration",
          '3 secondes, 7 secondes',
          'Le plus lent possible',
        ],
        correct: 0,
        feedback: "Six respirations par minute, ni plus lentes ni plus profondes. C'est la régularité qui compte.",
      },
      {
        question: "Où faire l'exercice du soir ?",
        options: ['Dans le lit, juste avant de dormir', "Avant d'entrer dans la chambre", 'Peu importe'],
        correct: 1,
        feedback: "Avant d'entrer dans la chambre. On sépare le retour au calme du moment de l'endormissement, sinon la chambre devient le lieu de l'effort.",
      },
    ],
  },
  'Anamnèse et objectifs de la thérapie': {
    duree: '15 minutes',
    quand: 'Avant la deuxième séance',
    steps: [
      "Répondez au questionnaire à votre rythme, il s'enregistre tout seul.",
      'Sur la dernière question, indiquez ce qui aurait changé dans six mois pour que vous soyez satisfaite.',
      'Laissez en blanc ce que vous préférez dire de vive voix.',
    ],
  },
  'Reformuler une phrase par jour': {
    duree: "Le temps d'une phrase",
    quand: 'Dans une conversation réelle, chaque jour',
    steps: [
      "Choisissez un moment où l'autre dit quelque chose qui vous pique.",
      "Avant de répondre, reformulez ce qu'il vient de dire : « si je comprends bien, tu… ».",
      'Notez ici sa réaction, en trois mots.',
    ],
    why: 'On ne travaille pas votre façon de parler mais le temps que vous prenez avant de parler.',
    quiz: [
      {
        question: 'Que faites-vous avant de répondre ?',
        options: [
          'Vous préparez votre argument',
          "Vous reformulez ce que l'autre vient de dire",
          'Vous respirez trois fois',
        ],
        correct: 1,
        feedback: "Reformuler d'abord. Cela vous donne le temps que vous cherchez, sans avoir à le demander.",
      },
      {
        question: "Que notez-vous après l'échange ?",
        options: [
          'Sa réaction, en trois mots',
          'Ce que vous auriez dû dire',
          "Rien, l'exercice est fini",
        ],
        correct: 0,
        feedback: "Trois mots sur sa réaction. C'est la matière qu'on regardera ensemble.",
      },
    ],
  },
  'Noter un échange réussi': {
    duree: '2 minutes',
    quand: 'Mercredi soir',
    steps: [
      'Un seul échange, même minuscule, même avec un commerçant.',
      "Notez ce que vous avez fait, pas ce que l'autre a fait.",
      'Relisez-le avant la prochaine séance.',
    ],
  },
  'Reprendre rendez-vous': {
    duree: '1 minute',
    quand: 'Dès que vous voyez ce module',
    steps: [
      "Ouvrez l'agenda et prenez le premier créneau qui vous convient.",
      'Si aucun créneau ne convient, écrivez-le ici : votre thérapeute vous rappelle.',
    ],
    why: "Un programme interrompu à la cinquième semaine sur six perd l'essentiel de ce qui a été construit. Reprendre maintenant coûte moins que recommencer.",
  },
  'Prendre la parole une fois par jour': {
    duree: 'Quelques secondes',
    quand: 'Chaque jour, dans un cadre au choix',
    steps: [
      'Une intervention par jour, aussi courte que vous voulez, même une question.',
      'Avant de parler, sentez vos pieds sur le sol et attendez une respiration complète.',
      'Notez ici si la voix a tremblé, oui ou non. Rien de plus.',
    ],
    why: "Ce qui compte n'est pas la qualité de l'intervention mais la répétition. On use le mur, on ne le franchit pas d'un coup.",
  },
  'Préparer la présentation du 15': {
    duree: '30 minutes',
    quand: 'Avant vendredi',
    steps: [
      "Écrivez seulement les trois idées que vous voulez qu'on retienne. Pas les diapositives.",
      'Pour chacune, une phrase que vous diriez à un ami au téléphone.',
      'Lisez ces trois phrases à voix haute, debout, une fois.',
    ],
    why: 'Nous préparons le sol, pas le texte.',
  },
  'Respiration en cohérence cardiaque': {
    duree: '5 minutes',
    quand: 'Matin et soir',
    steps: [
      'Assis, dos appuyé, les mains sur les cuisses.',
      'Inspirez 5 secondes, expirez 5 secondes, pendant cinq minutes.',
      "Notez sur l'échelle du soir ce que ça change, s'il y a quelque chose.",
    ],
  },
  'Noter les trois moments les plus calmes de la journée': {
    duree: '3 minutes',
    quand: 'Chaque soir',
    steps: [
      'Trois moments, même très courts, même banals.',
      'Pour chacun, notez où vous étiez et ce que vous faisiez.',
      "Au bout d'une semaine, regardez ce qu'ils ont en commun.",
    ],
    why: "On cherche les conditions du calme, pas les causes de l'agitation. Elles sont plus faciles à reproduire.",
  },
  'Lettre à soi-même dans six mois': {
    duree: '20 minutes',
    quand: 'Avant la prochaine séance',
    steps: [
      "Écrivez à la personne que vous serez dans six mois, comme à quelqu'un que vous connaissez bien.",
      "Dites-lui où vous en êtes aujourd'hui, sans arranger la vérité.",
      'Demandez-lui une chose.',
    ],
  },
}

/** Consigne générique servie quand le module n'a pas de consigne propre. */
export const CONSIGNE_PAR_TYPE: Partial<Record<ModuleKind, Consigne>> = {
  Exercice: {
    duree: 'Quelques minutes',
    quand: 'Comme indiqué sur le module',
    steps: [
      'Trouvez un moment où vous ne serez pas interrompu.',
      "Faites l'exercice sans chercher à bien le faire.",
      'Notez ici ce que vous avez remarqué.',
    ],
  },
  Journal: {
    duree: '3 minutes',
    quand: 'Le soir',
    steps: [
      "Écrivez ce qui s'est passé, en deux phrases.",
      'Notez ce que le corps a fait avant les pensées.',
      'Choisissez si vous le partagez avec votre thérapeute.',
    ],
  },
  'Écriture': {
    duree: '20 minutes',
    quand: 'Avant la prochaine séance',
    steps: [
      "Écrivez d'un seul trait, sans vous relire.",
      'Ne cherchez pas la bonne formulation.',
      'Apportez le texte à la séance.',
    ],
  },
  Formulaire: {
    duree: '10 minutes',
    quand: 'Avant la prochaine séance',
    steps: [
      "Répondez à votre rythme, l'enregistrement est automatique.",
      'Laissez en blanc ce que vous préférez dire de vive voix.',
    ],
  },
  'Séance': {
    duree: '1 minute',
    quand: 'Dès maintenant',
    steps: ["Ouvrez l'agenda et choisissez un créneau.", 'Écrivez ici si rien ne convient.'],
  },
  'Échelle': {
    duree: '15 secondes',
    quand: 'Chaque soir',
    steps: [
      'Choisissez le chiffre qui correspond à votre journée.',
      'Ne réfléchissez pas plus de quelques secondes.',
    ],
  },
}

/**
 * Consigne d'un module : un module créé dans l'atelier prime sur la consigne de
 * référence, qui prime sur la consigne générique du type, avec repli sur celle
 * de l'exercice.
 */
export function consigneFor(
  module: PatientModule | null,
  customs: Record<string, CustomModule[]>,
): Consigne | null {
  if (!module) return null
  for (const list of Object.values(customs)) {
    const made = list.find((c) => c.titre === module.title)
    if (made) {
      return {
        duree: made.duree,
        quand: made.quand,
        steps: made.steps,
        why: made.pourquoi,
        quiz: made.quiz,
      }
    }
  }
  return CONSIGNES[module.title] ?? CONSIGNE_PAR_TYPE[module.kind] ?? CONSIGNE_PAR_TYPE.Exercice ?? null
}
