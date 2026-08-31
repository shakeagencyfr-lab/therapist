/**
 * Fiches patients de démonstration : cinq dossiers complets (profil, parcours,
 * audios, journal).
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { Patient, PatientId } from '@/types/domain'

export const PATIENTS: Record<PatientId, Patient> = {
  camille: {
    name: 'Camille R.',
    initials: 'CR',
    program: 'Programme Liberté',
    subtitle: 'Liberté · semaine 3 / 6',
    weekLabel: 'Semaine 3 sur 6',
    nextSession: 'Prochaine séance jeudi 14 h',
    adherence: 86,
    listens: 12,
    sessions: 3,
    totalSessions: 6,
    scaleLabel: 'Envie de fumer',
    scaleQuestion: "Où en est l'envie de fumer ?",
    scaleDelta: '8 → 3 en trois semaines',
    scale: [8, 8, 7, 7, 6, 6, 4, 5, 4, 3, 3],
    profile: {
      updated: 'Mis à jour après la séance du 4 septembre',
      portrait: "Fonctionne au contrat clair : ce qui est nommé et daté est fait. L'envie de fumer s'est déplacée du manque physique vers un réflexe de soulagement après les tensions relationnelles. Bonne réceptivité aux inductions courtes ; l'attention décroche autour de la dixième minute sur les imageries longues.",
      axes: [
        {
          label: 'Besoin de contrôle',
          value: 78,
          note: 'Se détend dès que le déroulé est annoncé',
        },
        { label: 'Réceptivité hypnotique', value: 62, note: 'Voie kinesthésique, peu visuelle' },
        { label: "Tolérance à l'émotion forte", value: 45, note: 'Coupe court quand ça monte' },
        { label: 'Autonomie entre séances', value: 84, note: 'Fait les exercices sans relance' },
        { label: 'Appui sur le corps', value: 58, note: "L'ancrage marche mieux que le récit" },
      ],
      levers: [
        {
          title: "Annoncer le déroulé avant l'induction",
          body: 'Deux phrases sur les étapes et la durée suffisent à faire baisser la vigilance.',
        },
        {
          title: 'Rester sous quinze minutes',
          body: "Au-delà, elle décroche et repart avec le sentiment d'avoir mal fait.",
        },
        {
          title: 'Travailler le déclencheur relationnel',
          body: "L'envie revient après un appel ou un conflit, pas après les repas. Cibler là.",
        },
        {
          title: 'Faire nommer la réussite à voix haute',
          body: "Elle minimise ses avancées. Les vingt minutes tenues valent d'être redites.",
        },
      ],
      care: [
        'Éviter la régression en enfance avant la séance 5 : la tolérance émotionnelle reste moyenne.',
        'Ne pas commenter les rechutes en chiffres, elle les vit comme une rupture de contrat.',
      ],
    },
    modules: [
      {
        title: "Écoute de l'induction « Ancrage du souffle »",
        meta: 'Lundi · 14 min',
        kind: 'Audio',
        done: true,
      },
      {
        title: "Geste d'ancrage avant le café du matin",
        meta: 'Tous les jours · 2 min',
        kind: 'Exercice',
        done: true,
      },
      {
        title: 'Noter la situation la plus difficile de la journée',
        meta: 'Mardi soir',
        kind: 'Journal',
        done: true,
      },
      { title: "Auto-évaluation de l'envie", meta: 'Chaque soir', kind: 'Échelle', done: true },
      {
        title: "Écoute de l'induction « Le lieu sûr »",
        meta: 'Jeudi · 18 min',
        kind: 'Audio',
        done: false,
      },
      {
        title: 'Lettre à la cigarette',
        meta: 'Avant la prochaine séance',
        kind: 'Écriture',
        done: false,
      },
    ],
    audios: [
      {
        title: 'Ancrage du souffle',
        meta: 'Écouté 6 fois · dernière écoute hier',
        duration: '14:00',
      },
      { title: 'Le lieu sûr', meta: 'Jamais écouté · envoyé jeudi', duration: '18:20' },
      { title: 'Réveil en douceur', meta: 'Écouté 4 fois', duration: '07:45' },
    ],
    journal: [
      {
        date: 'Lundi 7 sept.',
        trigger: 'Après un appel difficile',
        text: "J'ai tenu vingt minutes avant de craquer. C'est la première fois que j'attends aussi longtemps.",
      },
      {
        date: 'Samedi 5 sept.',
        trigger: 'Soirée entre amis',
        text: "L'ancrage a fonctionné deux fois sur trois. La troisième, je n'y ai simplement pas pensé.",
      },
    ],
  },
  nadia: {
    name: 'Nadia B.',
    initials: 'NB',
    program: 'Programme Équilibre',
    subtitle: 'Équilibre · semaine 1 / 8',
    weekLabel: 'Semaine 1 sur 8',
    nextSession: 'Prochaine séance mardi 11 h',
    adherence: 100,
    listens: 4,
    sessions: 1,
    totalSessions: 8,
    scaleLabel: 'Niveau de stress',
    scaleQuestion: 'Où en est votre niveau de stress ?',
    scaleDelta: '9 → 7, début de programme',
    scale: [9, 9, 8, 9, 8, 7, 7],
    profile: {
      updated: "Première esquisse, après la séance d'anamnèse",
      portrait: "Une seule séance : tout est encore à confirmer. L'anticipation domine, le corps se tend avant l'événement plutôt que pendant. Exécution des consignes irréprochable, au point que l'assiduité peut devenir une performance de plus à réussir.",
      axes: [
        { label: 'Anticipation anxieuse', value: 82, note: 'Le stress précède la situation' },
        { label: 'Besoin de bien faire', value: 88, note: '100 % des modules dès la semaine 1' },
        { label: 'Réceptivité hypnotique', value: 50, note: 'Une seule induction, non évaluée' },
        {
          label: 'Accès aux émotions',
          value: 40,
          note: 'Décrit des sensations, pas des affects',
        },
        { label: 'Appui sur le corps', value: 66, note: 'La cohérence cardiaque prend bien' },
      ],
      levers: [
        {
          title: "Dédramatiser l'assiduité",
          body: "Dire explicitement qu'un module sauté n'est pas un échec, sinon le programme devient une source de stress de plus.",
        },
        {
          title: 'Passer par la sensation',
          body: "Elle nomme le serrement avant l'émotion. Partir du corps donne accès au reste.",
        },
        {
          title: 'Tester deux inductions différentes',
          body: 'Rien ne permet encore de savoir ce qui fonctionne le mieux. La séance 2 sert à ça.',
        },
      ],
      care: [
        'Profil établi sur une séance : à traiter comme une hypothèse de travail.',
        'Surveiller le transfert de performance sur la thérapie elle-même.',
      ],
    },
    modules: [
      {
        title: 'Anamnèse et objectifs de la thérapie',
        meta: 'À remplir avant la séance 2',
        kind: 'Formulaire',
        done: true,
      },
      {
        title: 'Cohérence cardiaque, matin et soir',
        meta: 'Tous les jours · 5 min',
        kind: 'Exercice',
        done: true,
      },
      {
        title: "Écoute de l'induction « Relâchement »",
        meta: 'Mercredi · 21 min',
        kind: 'Audio',
        done: true,
      },
      { title: 'Auto-évaluation du stress', meta: 'Chaque soir', kind: 'Échelle', done: true },
    ],
    audios: [
      { title: 'Relâchement', meta: 'Écouté 3 fois', duration: '21:10' },
      { title: 'Respiration guidée du soir', meta: 'Écouté 1 fois', duration: '09:30' },
    ],
    journal: [
      {
        date: 'Dimanche 6 sept.',
        trigger: 'Réunion de lundi',
        text: "J'anticipe déjà la semaine. Le corps se serre avant même que rien ne soit arrivé.",
      },
    ],
  },
  julien: {
    name: 'Julien M.',
    initials: 'JM',
    program: 'Programme Harmonie',
    subtitle: 'Harmonie · semaine 5 / 6',
    weekLabel: 'Semaine 5 sur 6',
    nextSession: 'Aucune séance planifiée',
    adherence: 41,
    listens: 2,
    sessions: 4,
    totalSessions: 6,
    scaleLabel: 'Qualité des échanges',
    scaleQuestion: "Comment étaient vos échanges aujourd'hui ?",
    scaleDelta: 'Stagnation depuis 10 jours',
    scale: [4, 5, 5, 6, 6, 5, 5, 5, 5],
    profile: {
      updated: 'Mis à jour après la séance du 21 août',
      portrait: "Évitement du conflit ancien et bien installé, appris tôt en famille. Les séances sont vécues comme utiles, l'entre-séances comme une charge supplémentaire. Le décrochage actuel ne signale pas un désaccord thérapeutique mais une difficulté à s'accorder du temps sans justification extérieure.",
      axes: [
        { label: 'Évitement du conflit', value: 86, note: 'Se retire avant le désaccord' },
        { label: 'Engagement entre séances', value: 32, note: '41 % des modules, en baisse' },
        { label: 'Réceptivité hypnotique', value: 71, note: 'Entre vite, ressort apaisé' },
        {
          label: "Capacité d'auto-observation",
          value: 64,
          note: 'Nouvelle : il repère sur le moment',
        },
        { label: "Demande d'aide explicite", value: 25, note: 'Ne relance jamais de lui-même' },
      ],
      levers: [
        {
          title: 'Un seul exercice, daté',
          body: "Cinq modules ouverts le figent. Un exercice avec un jour précis passe mieux qu'une consigne quotidienne.",
        },
        {
          title: 'Reprendre le repas de famille',
          body: 'Il a remarqué son silence sur le moment : premier signe de recul, à nommer comme un acquis.',
        },
        {
          title: "Proposer la date, ne pas l'attendre",
          body: 'Il ne redemandera pas de rendez-vous. Poser la date en fin de séance.',
        },
        {
          title: 'Autoriser le désaccord en séance',
          body: "L'espace thérapeutique est le seul endroit où il peut s'entraîner à ne pas être d'accord.",
        },
      ],
      care: [
        "Le silence entre les séances n'est pas un refus : ne pas lire le décrochage comme une fin de suivi.",
        'Éviter les relances multiples, elles réactivent la peur de décevoir.',
      ],
    },
    modules: [
      {
        title: "Écoute de l'induction « Dialogue intérieur »",
        meta: 'Lundi · 16 min',
        kind: 'Audio',
        done: true,
      },
      {
        title: 'Reformuler une phrase par jour',
        meta: 'Tous les jours',
        kind: 'Exercice',
        done: false,
      },
      { title: 'Noter un échange réussi', meta: 'Mercredi', kind: 'Journal', done: false },
      {
        title: 'Auto-évaluation des échanges',
        meta: 'Chaque soir',
        kind: 'Échelle',
        done: false,
      },
      {
        title: 'Reprendre rendez-vous',
        meta: 'Relance envoyée vendredi',
        kind: 'Séance',
        done: false,
      },
    ],
    audios: [
      {
        title: 'Dialogue intérieur',
        meta: 'Écouté 2 fois · dernière écoute il y a 9 jours',
        duration: '16:40',
      },
    ],
    journal: [
      {
        date: 'Jeudi 27 août',
        trigger: 'Repas de famille',
        text: "Je n'ai rien dit. Encore. Mais je l'ai remarqué sur le moment, ce qui est nouveau.",
      },
    ],
  },
  sofia: {
    name: 'Sofia T.',
    initials: 'ST',
    program: 'Programme Compétences',
    subtitle: 'Compétences · semaine 2 / 4',
    weekLabel: 'Semaine 2 sur 4',
    nextSession: 'Prochaine séance vendredi 17 h',
    adherence: 72,
    listens: 7,
    sessions: 2,
    totalSessions: 4,
    scaleLabel: 'Confiance avant prise de parole',
    scaleQuestion: 'Quelle confiance avant de prendre la parole ?',
    scaleDelta: '3 → 6 en deux semaines',
    scale: [3, 3, 4, 4, 5, 5, 6],
    profile: {
      updated: 'Mis à jour après la séance du 30 août',
      portrait: "Progression rapide, portée par une exigence de soi qui est à la fois le moteur et le risque. La confiance monte tant que les tentatives réussissent ; un seul épisode raté peut faire retomber la courbe d'un coup. Imagerie mentale très nette : la visualisation donne plus que l'analyse.",
      axes: [
        { label: 'Exigence envers soi', value: 84, note: 'Juge sévèrement ses tentatives' },
        { label: 'Réceptivité hypnotique', value: 79, note: 'Imagerie visuelle rapide' },
        { label: 'Confiance situationnelle', value: 55, note: "Variable selon l'audience" },
        { label: 'Autonomie entre séances', value: 70, note: 'Constante, sans relance' },
        { label: "Tolérance à l'échec", value: 38, note: 'Point de fragilité principal' },
      ],
      levers: [
        {
          title: "Préparer l'échec pendant que ça monte",
          body: 'Installer maintenant une réponse à la prise de parole ratée, tant que la courbe est favorable.',
        },
        {
          title: 'Continuer par la visualisation',
          body: "La scène réussie produit plus de résultats que l'exploration de ce qui bloque.",
        },
        {
          title: "Élargir l'audience par paliers",
          body: 'Onze personnes ont été tenues. La marche suivante se pose, elle ne se saute pas.',
        },
      ],
      care: [
        'Éviter de poser la présentation du 15 comme un test : elle en ferait un verdict.',
        "Profil établi sur deux séances : la tolérance à l'échec reste à vérifier en situation.",
      ],
    },
    modules: [
      {
        title: 'Visualisation de la scène réussie',
        meta: 'Lundi · 12 min',
        kind: 'Audio',
        done: true,
      },
      {
        title: 'Prendre la parole une fois par jour',
        meta: 'Tous les jours',
        kind: 'Exercice',
        done: true,
      },
      {
        title: 'Auto-évaluation de la confiance',
        meta: 'Chaque soir',
        kind: 'Échelle',
        done: true,
      },
      {
        title: 'Préparer la présentation du 15',
        meta: 'Avant vendredi',
        kind: 'Écriture',
        done: false,
      },
    ],
    audios: [
      { title: 'La scène réussie', meta: 'Écouté 5 fois', duration: '12:05' },
      { title: 'Ancrage de la voix', meta: 'Écouté 2 fois', duration: '08:15' },
    ],
    journal: [
      {
        date: 'Vendredi 4 sept.',
        trigger: "Point d'équipe",
        text: "J'ai posé une question devant onze personnes. Les mains tremblaient, la voix non.",
      },
    ],
  },
  marc: {
    name: 'Marc D.',
    initials: 'MD',
    program: 'Programme Équilibre',
    subtitle: 'Équilibre · terminé, suivi libre',
    weekLabel: 'Programme terminé',
    nextSession: 'Séance de consolidation en octobre',
    adherence: 94,
    listens: 21,
    sessions: 8,
    totalSessions: 8,
    scaleLabel: 'Niveau de stress',
    scaleQuestion: 'Où en est votre niveau de stress ?',
    scaleDelta: '8 → 2, maintenu',
    scale: [8, 7, 6, 5, 4, 4, 3, 2, 2, 2],
    profile: {
      updated: 'Profil consolidé en fin de programme',
      portrait: "Programme terminé, acquis stables depuis trois semaines. Il a intégré ses outils et les utilise sans consigne. Le risque n'est plus le stress lui-même mais l'arrêt complet du suivi : il considère volontiers qu'un problème résolu ne revient pas.",
      axes: [
        { label: 'Autonomie', value: 92, note: 'Écoute libre, sans rappel' },
        { label: 'Réceptivité hypnotique', value: 80, note: 'Auto-hypnose acquise' },
        { label: 'Stabilité émotionnelle', value: 78, note: 'Trois semaines sans épisode' },
        { label: 'Lecture des signaux faibles', value: 60, note: 'Repère tard la montée' },
        { label: "Recours spontané à l'aide", value: 45, note: 'Attend que ce soit sévère' },
      ],
      levers: [
        {
          title: 'Espacer sans fermer',
          body: 'Une séance de consolidation par trimestre maintient le lien sans réinstaller la dépendance.',
        },
        {
          title: 'Travailler les signaux précoces',
          body: 'Il agit quand le stress est déjà à 6. Lister avec lui les signes à 3.',
        },
        {
          title: "Garder l'audio court accessible",
          body: "C'est son outil de secours : vérifier qu'il est toujours sur le téléphone.",
        },
      ],
      care: ['Ne pas clore le suivi sans point de reprise daté.'],
    },
    modules: [
      {
        title: 'Écoute libre de la bibliothèque',
        meta: 'Quand le besoin se présente',
        kind: 'Audio',
        done: true,
      },
      {
        title: 'Auto-évaluation hebdomadaire',
        meta: 'Chaque dimanche',
        kind: 'Échelle',
        done: true,
      },
    ],
    audios: [
      { title: 'Relâchement', meta: 'Écouté 12 fois', duration: '21:10' },
      { title: 'Retour au calme, version courte', meta: 'Écouté 9 fois', duration: '05:50' },
    ],
    journal: [
      {
        date: 'Mardi 1 sept.',
        trigger: 'Aucun déclencheur',
        text: "Trois semaines sans épisode. Je garde l'audio court dans le téléphone, au cas où.",
      },
    ],
  },
}

/** Ordre d'affichage dans la barre latérale. */
export const PATIENT_ORDER: PatientId[] = ['camille', 'nadia', 'julien', 'sofia', 'marc']
