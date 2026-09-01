/**
 * Captation de séance : points de consentement, transcriptions d'exemple et
 * raccourcis de prise de notes.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */

/**
 * Points lus au patient avant d'enregistrer. Le consentement est bloquant.
 *
 * Ils se lisent à voix haute devant la personne : le troisième la nomme, il
 * prend donc son prénom plutôt qu'un exemple.
 */
export function consentPoints(prenom: string): string[] {
  return [
    "La séance est transcrite en texte. L'enregistrement sonore est détruit dès la transcription terminée, il n'est stocké nulle part.",
    "La note produite est un brouillon. Elle n'entre au dossier qu'après relecture et validation de la thérapeute.",
    `${prenom} peut demander la suppression de la transcription à tout moment, sans justification, depuis son espace.`,
    'Les données sont hébergées en France chez un hébergeur agréé données de santé. Aucun transfert hors Union européenne.',
  ]
}

/** Une transcription de démonstration, pour essayer la génération du brouillon. */
export interface TranscriptSample {
  label: string
  meta: string
  text: string
}

export const TRANSCRIPT_SAMPLES: TranscriptSample[] = [
  {
    label: 'Tabac, rechute',
    meta: 'Séance 4 · 12 min de transcription',
    text: "Thérapeute : comment ça s'est passé depuis la dernière fois ?\n\nCamille : mieux, mais il y a eu jeudi. J'ai eu un appel de ma mère, et vingt minutes après j'étais dehors avec une cigarette. Je savais exactement ce que je faisais. C'est comme si une porte se refermait dans ma tête et que je devenais spectatrice.\n\nThérapeute : spectatrice. Vous pouvez m'en dire plus sur cette porte ?\n\nCamille : c'est ça depuis toujours. Quand ça devient trop, il y a une porte qui claque et je ne suis plus là. Avant c'était le sport, maintenant c'est la cigarette. Mon père faisait pareil, il partait au garage pendant des heures et personne n'osait aller le chercher.\n\nThérapeute : et l'ancrage du souffle, vous l'avez utilisé ?\n\nCamille : deux fois sur trois. Ça marche, c'est ça qui est fou. Quand je pose la main sur le sternum, il y a quelque chose qui se pose. Comme une pierre chaude. Mais jeudi je n'y ai même pas pensé, j'étais déjà de l'autre côté de la porte.\n\nThérapeute : vous avez tenu vingt minutes. Avant, c'était combien ?\n\nCamille : zéro. C'était immédiat, le téléphone raccroché et j'étais déjà en train de chercher le paquet. Là j'ai attendu, et surtout j'ai vu que j'attendais.\n\nThérapeute : qu'est-ce qui change, de voir que vous attendez ?\n\nCamille : je ne sais pas. Ça fait moins honte. Avant je me trouvais faible, là je me suis dit tiens, il y a quelqu'un aux commandes, même si elle perd à la fin.\n\nThérapeute : elle perd à la fin, ou elle apprend le terrain ?\n\nCamille : dit comme ça. Mais le lendemain j'ai fumé trois cigarettes, pas une. Comme si j'avais rouvert un robinet.\n\nThérapeute : le robinet, la porte, la pierre chaude. Vous avez beaucoup d'images très physiques.\n\nCamille : j'ai toujours pensé comme ça. Les mots me viennent après.\n\nThérapeute : qu'est-ce qui vous ferait du bien cette semaine ?\n\nCamille : savoir quoi faire quand la porte claque. Pas l'empêcher, je crois que je n'y arriverai pas. Juste savoir quoi faire une fois derrière. Parce que derrière, aujourd'hui, il n'y a rien. Il y a le vide et une cigarette dedans.",
  },
  {
    label: 'Épuisement professionnel',
    meta: 'Séance 2 · 14 min de transcription',
    text: "Thérapeute : où en êtes-vous cette semaine ?\n\nNadia : j'ai réussi à dormir. Trois nuits sur sept, mais j'ai dormi. Le reste du temps je me réveille à quatre heures et je fais la liste.\n\nThérapeute : la liste ?\n\nNadia : tout ce que je n'ai pas fait la veille et tout ce qui m'attend. Ça défile, je ne peux pas l'arrêter. Mon corps est en alerte alors qu'il n'y a personne dans la chambre.\n\nThérapeute : et dans la journée ?\n\nNadia : dans la journée je fonctionne. C'est le mot que tout le monde emploie autour de moi, tu fonctionnes. Je réponds à deux cents mails, j'anime les réunions, et le soir je n'arrive plus à décider quoi manger. Il n'y a plus de place pour une décision de plus.\n\nThérapeute : qu'est-ce qui se passe dans le corps, à ce moment de la journée ?\n\nNadia : les épaules montent. Une plaque de béton entre les omoplates. Et une sorte de bourdonnement, comme un frigo qui tourne en permanence.\n\nThérapeute : depuis quand le frigo tourne ?\n\nNadia : depuis la réorganisation, il y a un an et demi. J'ai pris le poste de deux personnes. Je n'ai jamais dit non, et maintenant c'est trop tard pour le dire, ce serait admettre que je n'y arrive pas.\n\nThérapeute : dire non, ce serait admettre quoi exactement ?\n\nNadia : que je ne suis pas à la hauteur. Ma mère répétait qu'on ne se plaint pas, qu'on fait. Elle a travaillé jusqu'à l'épuisement, littéralement, elle a fini à l'hôpital.\n\nThérapeute : vous avez ce mot en tête pour vous-même, l'hôpital ?\n\nNadia : parfois je me dis que ce serait une solution. Pas de me faire du mal, non, ne vous inquiétez pas. Juste être arrêtée par quelque chose d'extérieur, pour ne pas avoir à choisir. Mon médecin m'a proposé un arrêt en juin, j'ai refusé.\n\nThérapeute : la cohérence cardiaque, vous l'avez pratiquée ?\n\nNadia : le matin oui, presque tous les jours. Le soir jamais, je suis déjà dans le lit avec le téléphone. Le matin ça me fait du bien cinq minutes, et après le frigo redémarre.\n\nThérapeute : qu'est-ce que vous aimeriez pouvoir faire dans un mois, concrètement ?\n\nNadia : fermer mon ordinateur à dix-neuf heures sans avoir la boule au ventre. Et arriver à dire une phrase à mon chef. Une seule, mais qui tient debout.",
  },
  {
    label: 'Deuil',
    meta: 'Première séance · 13 min de transcription',
    text: "Thérapeute : qu'est-ce qui vous amène ?\n\nÉlise : mon frère est mort en février. Accident de voiture. Depuis, je vis à côté. Tout le monde me dit que c'est normal après six mois, mais moi je sens bien que quelque chose est resté bloqué.\n\nThérapeute : bloqué où, si vous devez le situer ?\n\nÉlise : dans la gorge. Il y a une porte fermée dans la gorge. Je peux parler de lui, vous voyez bien, je vous en parle, mais les larmes ne sortent pas. Je n'ai pas pleuré depuis l'enterrement.\n\nThérapeute : qu'est-ce qui se passerait, si les larmes sortaient ?\n\nÉlise : je ne pourrais plus m'arrêter. Et je dois tenir, il y a mes parents. Ma mère ne se lève plus certains jours. Si je m'effondre, il n'y a plus personne debout dans cette famille.\n\nThérapeute : vous êtes debout pour trois personnes.\n\nÉlise : quatre avec ses enfants. Je vais les chercher à l'école le mercredi. Ils me demandent des choses sur lui et je réponds avec une voix qui n'est pas la mienne.\n\nThérapeute : et pour vous, quand est-ce que vous avez un moment ?\n\nÉlise : dans la voiture. Je fais des détours pour rentrer plus tard. Je mets la radio très fort et je conduis. C'est le seul endroit où je respire.\n\nThérapeute : vous dormez ?\n\nÉlise : mal. Je me couche à deux heures pour être assez fatiguée pour ne pas rêver. Quand je rêve, il est vivant et il ne sait pas qu'il est mort, et je dois le lui dire. Je me réveille en ayant l'impression de l'avoir tué.\n\nThérapeute : c'est une charge très lourde à porter dans un rêve.\n\nÉlise : je bois un verre ou deux avant de me coucher, ça aide. Avant je ne buvais jamais.\n\nThérapeute : depuis combien de temps, les deux verres ?\n\nÉlise : trois mois. Ça monte un peu, je vais être honnête. Certains soirs c'est trois.\n\nThérapeute : qu'est-ce que vous attendez de nos séances ?\n\nÉlise : je ne veux pas l'oublier, ce n'est pas ça. Je voudrais pouvoir penser à lui sans que la porte se ferme. Et arrêter de faire des détours en voiture pour avoir le droit d'être triste vingt minutes.",
  },
  {
    label: "Insomnie et anxiété d'anticipation",
    meta: 'Séance 3 · 11 min de transcription',
    text: "Thérapeute : la semaine dernière vous m'avez parlé du compte à rebours. Il est toujours là ?\n\nMarc : il commence vers vingt-et-une heures. Je regarde l'heure et je calcule combien il me reste avant de devoir dormir. Plus je calcule, moins je dors. C'est parfaitement absurde et je le sais.\n\nThérapeute : le savoir ne suffit pas.\n\nMarc : non. C'est comme un tribunal. Je monte me coucher et le procès commence. On rejuge la journée, on annonce le programme de demain, et on décide que je ne suis pas prêt.\n\nThérapeute : qui préside ?\n\nMarc : une voix qui ressemble à celle de mon ancien patron. Très calme, très raisonnable, et impitoyable. Elle ne crie jamais, c'est ça qui est terrible.\n\nThérapeute : et le corps, pendant le procès ?\n\nMarc : le ventre se ferme. Une main qui serre juste au-dessus du nombril. Et j'ai chaud aux jambes, ce qui est bizarre.\n\nThérapeute : vous avez écouté l'audio de relâchement ?\n\nMarc : douze fois. Ça m'endort une fois sur trois, ce qui est déjà énorme par rapport à avant. Le problème c'est le réveil de trois heures. Là il n'y a plus d'audio, plus de méthode, il y a juste moi et le plafond.\n\nThérapeute : qu'est-ce que vous faites, à trois heures ?\n\nMarc : je résiste. Je m'interdis de regarder l'heure, je m'interdis de me lever, je m'interdis de penser. Ça fait trois interdictions et évidemment ça ne marche pas.\n\nThérapeute : et si à trois heures il n'y avait rien à interdire ?\n\nMarc : ça voudrait dire accepter d'être réveillé. J'ai l'impression que si j'accepte, je capitule.\n\nThérapeute : capituler, c'est un mot de guerre.\n\nMarc : toute ma vie est un mot de guerre. Tenir, encaisser, ne pas lâcher. Mon grand-père était militaire, ça a laissé du vocabulaire dans la famille.\n\nThérapeute : qu'est-ce qui serait une victoire acceptable, cette semaine ?\n\nMarc : ne pas avoir peur du soir. Franchement, si je pouvais monter l'escalier sans que le ventre se ferme, je signerais tout de suite. Le sommeil viendrait après, je crois.",
  },
  {
    label: 'Confiance et prise de parole',
    meta: 'Séance 2 · 10 min de transcription',
    text: "Thérapeute : vous m'avez écrit que quelque chose s'était passé mardi.\n\nSofia : j'ai posé une question en réunion. Devant onze personnes. Ça paraît ridicule de venir en parler à une thérapeute.\n\nThérapeute : ça ne me paraît pas ridicule. Racontez-moi.\n\nSofia : j'avais préparé la phrase. Je l'ai répétée dans ma tête pendant quarante minutes en attendant le bon moment. Et quand je l'ai dite, les mains tremblaient mais la voix non. C'est la première fois que la voix ne tremble pas.\n\nThérapeute : qu'est-ce qui s'est passé après ?\n\nSofia : rien. C'est ça le plus étrange. Mon chef a répondu, on est passé au point suivant. Personne n'a remarqué que je venais de traverser un mur.\n\nThérapeute : un mur. C'est votre mot depuis le début.\n\nSofia : il est là depuis l'école. À l'oral du bac j'ai eu un blanc de deux minutes, l'examinatrice a soupiré, et depuis j'ai la certitude que si je parle, il y aura ce soupir.\n\nThérapeute : le soupir de qui, aujourd'hui ?\n\nSofia : de tout le monde. De moi surtout. J'entends le soupir avant même d'ouvrir la bouche.\n\nThérapeute : la visualisation de la scène réussie, vous l'avez travaillée ?\n\nSofia : cinq fois. Ce qui aide, ce n'est pas de me voir réussir. C'est le détail du sol. Vous m'avez fait sentir mes pieds sur le sol, et maintenant en réunion je pense au sol. Ça m'ancre littéralement.\n\nThérapeute : le sol tient. Le mur, lui, bouge ?\n\nSofia : il est plus fin. Il n'a pas disparu, mais il est plus fin.\n\nThérapeute : la présentation du quinze, où en êtes-vous ?\n\nSofia : je n'ai pas commencé. Vingt minutes devant quarante personnes, dont deux membres du comité de direction. Quand j'y pense, je change de sujet dans ma tête.\n\nThérapeute : et si nous préparions ces vingt minutes comme vous avez préparé la phrase de mardi ?\n\nSofia : la phrase, je l'avais répétée quarante minutes pour dire douze mots. Là il en faudrait combien.\n\nThérapeute : nous n'allons pas répéter des mots. Nous allons préparer le sol.",
  },
]

/** Boutons d'horodatage sous la zone de notes (libellé du bouton). */
export const NOTE_TAGS: string[] = ['Horodater', 'Mot du patient', 'À reprendre', 'Vigilance', 'Module à donner']

/** Préfixe inséré dans la note après l'horodatage, par libellé de bouton. */
export const NOTE_TAG_PREFIXES: Record<string, string> = {
  Horodater: '',
  'Mot du patient': 'mot du patient : ',
  'À reprendre': 'à reprendre : ',
  Vigilance: 'vigilance : ',
  'Module à donner': 'module à donner : ',
}
