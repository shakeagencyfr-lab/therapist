/**
 * Mode maquette.
 *
 * Renvoie des sorties de démonstration bien formées, sans appeler l'API : il
 * permet de développer et de démontrer l'interface sans clé, et sans envoyer
 * la moindre donnée de séance à l'extérieur. Activé par AI_MOCK=1, ou dès
 * qu'aucune clé n'est configurée sur le serveur.
 *
 * Ces textes sont de la démonstration : ils n'ont aucune valeur clinique.
 */
import type {
  GeneratedAffirmations,
  GeneratedModule,
  GeneratedProfile,
  SessionDraft,
} from '../src/types/domain.js'
import type { ModuleContext, PatientContext } from './schemas.js'

/** Prénom du patient, tel que les messages l'emploient. */
function firstName(context: PatientContext): string {
  return context.name.split(' ')[0] ?? context.name
}

export function mockSessionDraft(context: PatientContext, categories: string[]): SessionDraft {
  const prenom = firstName(context)
  const rayon = categories[0] ?? 'Détente'
  const second = categories[1] ?? rayon
  return {
    synthese:
      "La séance revient sur la semaine écoulée et sur l'épisode de jeudi, décrit comme une rupture nette et soudaine. " +
      'Le patient repère pour la première fois le moment qui précède le passage à l\'acte, et le décrit avec ses propres images. ' +
      "L'exercice d'ancrage a été utilisé deux fois sur trois et produit un effet net quand il est fait à temps. " +
      'Le travail a porté sur ce qui se passe une fois la bascule enclenchée, plutôt que sur la manière de l\'empêcher. ' +
      'La séance se termine sur une demande claire : savoir quoi faire ensuite, sans chercher à tout retenir.',
    mots: [
      'une porte qui se referme',
      'je deviens spectatrice',
      'une pierre chaude',
      "de l'autre côté de la porte",
      'j\'ai vu que j\'attendais',
    ],
    themes: [
      "La bascule est repérée avant qu'elle ne soit maîtrisée : le délai de vingt minutes est nouveau.",
      "La figure du père revient dans la même conduite d'évitement, sans que le lien soit encore formulé.",
      "L'ancrage fonctionne quand il est fait tôt ; sa mise en route dépend du moment, pas de la technique.",
    ],
    propositions: [
      {
        titre: 'Repérer le seuil',
        pourquoi:
          'Nommer par écrit les trois signes qui précèdent la bascule, pour la reconnaître plus tôt dans la semaine.',
        type: 'Journal',
      },
      {
        titre: 'Ancrage court du soir',
        pourquoi:
          'Installer le geste au calme, hors situation, pour qu\'il reste disponible quand la tension monte.',
        type: 'Exercice',
      },
      {
        titre: 'Audio de retour au calme',
        pourquoi: 'Une écoute brève à reprendre après un épisode, pour refermer la séquence autrement.',
        type: 'Audio',
      },
      {
        titre: 'Échelle du soir',
        pourquoi: "Suivre l'évolution de la semaine sans y passer plus de dix secondes.",
        type: 'Échelle',
      },
    ],
    induction:
      'Installez-vous, et laissez votre regard se poser quelque part, sans rien chercher de particulier. ' +
      'Vous pouvez sentir l\'appui du dossier, le poids des mains, la température de l\'air sur le visage. ' +
      'Et pendant que la respiration trouve son propre rythme, vous pouvez poser une main sur le sternum, ' +
      'comme on pose une pierre chaude au creux de soi. Il y a une porte, vous la connaissez bien. ' +
      'Aujourd\'hui vous n\'avez rien à faire d\'autre que la regarder, de ce côté-ci, à votre rythme. ' +
      'La chaleur de la main reste là, disponible, et vous savez maintenant que le temps existe entre le moment ' +
      'où la porte bouge et le moment où vous décidez. Ce temps vous appartient, et il s\'allonge à chaque fois ' +
      'que vous le remarquez.',
    questions: [
      "Qu'est-ce qui se passe dans le corps, juste avant que la porte ne bouge ?",
      "Jeudi, qu'est-ce qui a rendu possible d'attendre vingt minutes, alors que c'était immédiat avant ?",
      "Si l'ancrage était déjà fait quand la tension monte, à quoi le remarqueriez-vous ?",
      'Que faisiez-vous, enfant, quand la même porte se refermait dans la maison ?',
    ],
    vigilance: [
      {
        point:
          'Le patient décrit une conduite d\'évitement installée de longue date, reprise d\'une figure familiale.',
        conduite:
          "Explorer sans interpréter, et vérifier à la séance suivante que le travail ne réactive pas de détresse entre les séances.",
      },
    ],
    categories_audio: [
      {
        categorie: rayon,
        pourquoi: "Soutenir le retour au calme après un épisode, sans exiger d'effort au moment où il est le plus coûteux.",
      },
      {
        categorie: second,
        pourquoi: 'Installer le geste d\'ancrage au quotidien, en dehors des moments de tension.',
      },
    ],
    message:
      `Bonjour ${prenom}, merci pour cette séance. Vous avez repéré quelque chose d'important : ` +
      "entre le moment où la porte bouge et celui où vous partez, il y a maintenant du temps. " +
      'Cette semaine, rien à réussir : notez simplement ce que vous voyez venir, et posez la main sur le sternum ' +
      'quand vous y pensez. On en reparle jeudi.',
  }
}

export function mockGeneratedModule({ intent, type, quiz }: ModuleContext): GeneratedModule {
  return {
    titre: type === 'Audio' ? 'écoute du soir, trois minutes' : 'trois respirations posées',
    duree: '3 minutes',
    quand: 'Le soir, juste avant de vous coucher, téléphone posé.',
    steps: [
      'Asseyez-vous et posez les deux pieds bien à plat. Laissez votre regard se poser devant vous, sans le fixer.',
      'Respirez trois fois en comptant : quatre temps pour inspirer, six temps pour souffler. Une main sur le ventre suit le mouvement.',
      'Avant de vous lever, notez en une phrase ce que vous avez remarqué dans le corps. Une phrase suffit.',
    ],
    pourquoi:
      "Cet exercice ne cherche pas à vous détendre à tout prix. Il vous donne un repère régulier, court, que le corps finit par reconnaître. " +
      "C'est cette régularité, plus que la durée, qui rend le geste disponible quand vous en avez besoin. " +
      `(Maquette de démonstration, écrite à partir de votre intention : « ${intent} ».)`,
    quiz: quiz
      ? [
          {
            question: 'À quel moment de la journée cet exercice est-il prévu ?',
            options: ['Au réveil', 'Le soir avant de vous coucher', "Pendant une réunion"],
            correct: 1,
            feedback:
              'Le soir, avant le coucher : le calme du moment aide le corps à associer le geste au repos.',
          },
          {
            question: 'Que faites-vous avant de vous lever ?',
            options: [
              'Vous notez en une phrase ce que vous avez remarqué',
              'Vous recommencez trois fois',
              'Vous évaluez votre niveau de stress sur dix',
            ],
            correct: 0,
            feedback:
              'Une phrase, pas davantage : elle sert de trace, et rend le geste plus facile à retrouver le lendemain.',
          },
        ]
      : [],
  }
}

export function mockGeneratedAffirmations(context: PatientContext): GeneratedAffirmations {
  const prenom = firstName(context)
  return {
    affirmations: [
      'Je respire calmement et mon corps suit ce rythme, ici, maintenant.',
      'Ma main sur le sternum ramène une chaleur que je reconnais.',
      'Je choisis mes gestes, et je sais le moment où je les choisis.',
      `Je suis ${prenom}, et je tiens debout, tranquillement, dans ma journée.`,
    ],
  }
}

export function mockGeneratedProfile(context: PatientContext): GeneratedProfile {
  const current = context.profile?.axes ?? []
  const axes = current.length
    ? current.map((axis, i) => ({
        label: axis.label,
        // On fait bouger légèrement les valeurs pour que la bande d'incertitude
        // se resserre visiblement après une actualisation de démonstration.
        value: Math.max(0, Math.min(100, axis.value + (i % 2 === 0 ? 4 : -3))),
        note: axis.note,
      }))
    : [
        { label: 'Conscience du déclencheur', value: 62, note: 'repère le seuil, pas encore le geste' },
        { label: 'Régulation par le corps', value: 54, note: "l'ancrage prend quand il est fait tôt" },
        { label: 'Tolérance à la tension', value: 41, note: 'vingt minutes tenues jeudi' },
        { label: 'Appui sur l\'entourage', value: 35, note: 'demande peu, encaisse seule' },
        { label: 'Engagement dans le travail', value: 73, note: 'modules faits, journal tenu' },
      ]
  return {
    portrait:
      `${firstName(context)} décrit une bascule ancienne, brutale, qu'elle repère désormais avant qu'elle ne l'emporte. ` +
      "Les matériaux de la semaine montrent un délai qui s'installe entre la montée et le geste, et un ancrage corporel " +
      'qui produit un effet quand il est engagé tôt. Ce qui reste incertain : la place de la figure paternelle dans ' +
      'cette conduite, évoquée une fois et non reprise.',
    axes,
    levers: [
      {
        title: 'Travailler l\'après plutôt que l\'empêchement',
        body: "La demande est explicite : savoir quoi faire une fois la bascule enclenchée. Construire cette séquence-là plutôt que la prévention.",
      },
      {
        title: 'Ancrer le geste hors situation',
        body: 'Installer la main sur le sternum au calme, tous les soirs, pour que le corps le retrouve sans y penser.',
      },
      {
        title: 'Nommer le délai comme un acquis',
        body: 'Vingt minutes là où il n\'y en avait aucune : le dire en séance donne un repère mesurable à la suite du travail.',
      },
    ],
    care: [
      'Vérifier à la prochaine séance que le travail sur la bascule ne réactive pas de tension entre les séances.',
    ],
    resume:
      'Profil de démonstration : le délai avant la bascule est désormais explicite, la régulation corporelle progresse.',
  }
}
