/* RDV Pro — contenu de la landing, version FRANÇAISE.
 * Servie sur /rdv-pro/. Accent bleu, mise en page « offre ».
 *
 * Rédigé d'après la page RDV Pro de shakeagency.io. Tous les chiffres, les
 * fonctions et les tarifs viennent de cette page — rien n'a été inventé.
 */
import type { ProductContent } from "./types";

export const rdvFr: ProductContent = {
  tagline:
    "Le logiciel de prise de rendez-vous en ligne installé et réglé par notre équipe en 48 heures.",

  /* Les canaux par lesquels un rendez-vous peut arriver. */
  channels: [
    { key: "webchat", label: "Site de réservation" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "sms", label: "SMS", soon: true },
  ],

  hero: {
    badge: "Installé en 48 h · 29 € HT/mois · installation incluse",
    titleA: "Un agenda qui",
    titleHighlight: "se remplit tout seul.",
    titleB: "",
    subhead:
      "Vos clients réservent seuls, jour et nuit. Confirmations, rappels et acomptes compris. Nous installons et réglons tout sous 48 heures — vous n'ouvrez aucun panneau de configuration.",
    primaryCta: { label: "Parler à un expert", href: "/contact/" },
    secondaryCta: { label: "Voir ce qui est inclus", href: "/#features" },
    videoId: null,
    kpis: [
      { value: "48 h", label: "installé et réglé par nous" },
      { value: "24 h/24", label: "vos clients réservent seuls", highlight: true },
      { value: "Illimités", label: "employés, services et clients" },
      { value: "29 €", label: "HT par mois" },
    ],
  },

  /* ---- le problème : les trois situations décrites sur la page ---------- */
  problem: {
    eyebrow: "Ce qu'on règle",
    heading: "Chaque appel manqué est un client perdu.",
    sub: "Un créneau vide coûte plus cher que l'abonnement du mois.",
    items: [
      {
        emoji: "telephone.png",
        title: "« Je décroche pendant le service. »",
        body: "Un client au téléphone, un client devant vous. Vous perdez les deux un peu.",
      },
      {
        emoji: "hourglass-not-done.png",
        title: "« Le client ne vient pas. »",
        body: "Pas de rappel, pas d'acompte, pas de conséquence. Un créneau vide au milieu de la journée.",
      },
      {
        emoji: "compass.png",
        title: "« Personne ne sait qui fait quoi. »",
        body: "Deux praticiens, trois agendas, un tableau papier. Les doublons finissent toujours par arriver.",
      },
    ],
  },

  /* ---- ce qu'on livre --------------------------------------------------- */
  features: {
    eyebrow: "Ce qu'on livre",
    heading: "Tout est illimité. Tout est réglé pour vous.",
    items: [
      {
        emoji: "calendar.png",
        title: "Vos clients réservent sans vous",
        body: "Un lien, un QR code sur votre comptoir, un bouton sur votre site et vos réseaux. Ils choisissent leur créneau quand ça les arrange, 24 h/24 et 7 j/7.",
      },
      {
        emoji: "handshake.png",
        title: "Toute votre équipe synchronisée",
        body: "Chaque praticien a ses horaires, ses prestations et son agenda personnel. Google Agenda et Outlook restent à jour automatiquement. Fin des doubles réservations.",
      },
      {
        emoji: "money-with-wings.png",
        title: "L'argent encaissé à la réservation",
        body: "Paiement intégral, acompte ou carte cadeau : le client s'engage au moment où il réserve. Les absences deviennent rares.",
      },
      {
        emoji: "alarm-clock.png",
        title: "Les rappels que vous n'envoyez plus",
        body: "Confirmation immédiate, rappel la veille, message de suivi après le rendez-vous, relance des clients qui ne reviennent plus. Sans limite de volume.",
      },
      {
        emoji: "globe.png",
        title: "Votre site de réservation, inclus",
        body: "Vos prestations, vos tarifs, votre équipe, vos photos et vos avis, à vos couleurs et sous votre nom. Indexable par Google : vous encaissez des rendez-vous avant même d'avoir un site.",
      },
      {
        emoji: "desktop-computer.png",
        title: "La journée de l'équipe, dans le téléphone",
        body: "Chacun voit ses rendez-vous, ses clients et ses encaissements. Bloquer une heure, décaler un client, ajouter une prestation sur place : deux touches.",
      },
      {
        emoji: "sparkles.png",
        title: "Cartes cadeau, forfaits, abonnements",
        body: "Vendez dix séances d'un coup, un abonnement mensuel ou une carte cadeau achetée en ligne : le solde se décompte tout seul, sans carnet à tenir.",
      },
      {
        emoji: "balance-scale.png",
        title: "Vos règles d'annulation, appliquées",
        body: "Délai minimum, report autorisé une seule fois, acompte non remboursable au-delà : le client déplace lui-même son rendez-vous dans le cadre que vous avez fixé.",
      },
    ],
  },

  /* ---- comment ça se met en place --------------------------------------- */
  howItWorks: {
    eyebrow: "Installé sous 48 h",
    heading: "Vous n'ouvrez aucun panneau de configuration.",
    steps: [
      {
        title: "Vous nous dites comment vous travaillez",
        body: "Vos prestations et leurs durées réelles, votre équipe, vos horaires, vos jours de fermeture, vos règles d'annulation.",
      },
      {
        title: "Notre équipe monte l'agenda",
        body: "Prestations, marges de préparation, paiements, rappels, synchronisations et site de réservation à vos couleurs. En 48 heures, sans rien à faire de votre côté.",
      },
      {
        title: "Les rendez-vous arrivent",
        body: "Lien, QR code, bouton sur votre fiche Google et sur votre site. Vous recevez les réservations, confirmées et payées.",
      },
    ],
  },

  /* ---- pour qui : les métiers listés sur le site ------------------------- */
  useCases: {
    eyebrow: "Pour qui",
    heading: "Conçu pour les métiers qui vivent sur rendez-vous.",
    items: [
      {
        emoji: "lotion-bottle.png",
        title: "Instituts de beauté et spas",
        body: "Prestations avec durées réelles, acompte à la réservation, cartes cadeau et forfaits de séances.",
      },
      {
        emoji: "artist-palette.png",
        title: "Coiffeurs et barbiers",
        body: "Un agenda par coiffeur, chaque prestation avec sa durée et son prix, l'acompte encaissé au moment du clic.",
      },
      {
        emoji: "tooth.png",
        title: "Dentistes et praticiens de santé",
        body: "Questions posées avant la séance, rappels automatiques, règles d'annulation appliquées à votre place.",
      },
      {
        emoji: "brain.png",
        title: "Thérapeutes et praticiens",
        body: "Consultations en cabinet ou à distance : le lien Google Meet ou Zoom est créé et envoyé tout seul.",
      },
      {
        emoji: "graduation-cap.png",
        title: "Coachs et formateurs",
        body: "Cours collectifs avec nombre de places, forfaits de séances qui se décomptent, planning publié en ligne.",
      },
      {
        emoji: "gear.png",
        title: "Garages et artisans",
        body: "Adresse d'intervention demandée à la réservation, temps de trajet réservé avant et après, plusieurs lieux gérés.",
      },
    ],
  },

  /* ---- la comparaison publiée sur votre page ---------------------------- */
  comparison: {
    eyebrow: "Comparer avant de choisir",
    heading: "Shake One suffit ? Voici la différence.",
    youLabel: "RDV Pro",
    themLabel: "Shake One",
    rows: [
      ["Agendas multi-praticiens et multi-sites", true, false],
      ["Employés illimités, agendas synchronisés", true, false],
      ["Acompte, solde, forfaits et cartes cadeau", true, "partial"],
      ["Rappels WhatsApp et relance après la séance", true, "partial"],
      ["Règles d'annulation et créneau reproposé", true, "partial"],
      ["Web app de l'équipe, un compte par employé", true, "partial"],
      ["Mini site de réservation personnalisé", true, false],
      ["Bouton « Réserver » sur votre fiche Google", true, false],
      ["Installé et réglé sous 48 h par nos soins", true, false],
    ],
  },

  /* ---- intégrations ----------------------------------------------------- */
  integrations: {
    eyebrow: "Ce à quoi ça se branche",
    heading: "Votre agenda reste la seule source de vérité.",
    sub: "Ce que vous bloquez dans votre agenda devient indisponible en ligne, et chaque réservation y apparaît aussitôt. Les fuseaux horaires sont gérés automatiquement.",
    tools: [
      "Google Agenda",
      "Outlook",
      "Réserver avec Google",
      "Google Meet",
      "Zoom",
      "Paiement en ligne sécurisé",
    ],
  },

  /* ---- ce qui sécurise la décision -------------------------------------- */
  guarantee: {
    eyebrow: "Ce que comprend l'abonnement",
    heading: "Un rendez-vous récupéré par mois, et c'est rentabilisé.",
    points: [
      {
        emoji: "rocket.png",
        title: "Installation et formation comprises",
        body: "Nous installons, réglons et formons votre équipe. L'installation est facturée une seule fois, 150 € HT.",
      },
      {
        emoji: "handshake.png",
        title: "Support humain par WhatsApp",
        body: "Une vraie personne au bout, sans surcoût et sans file d'attente.",
      },
      {
        emoji: "key.png",
        title: "Tout est illimité",
        body: "Employés, services, clients, réservations et rappels e-mail. Pas de palier caché quand votre activité grandit.",
      },
      {
        emoji: "money-with-wings.png",
        title: "Deux mois offerts à l'année",
        body: "290 € HT par an au lieu de douze mensualités. Vous choisissez au moment de souscrire.",
      },
    ],
  },

  /* ---- tarifs ----------------------------------------------------------- */
  pricing: {
    eyebrow: "Tarif",
    heading: "29 € HT par mois, tout compris.",
    subheading:
      "Un seul abonnement, sans palier ni option cachée. Deux mois offerts si vous réglez à l'année.",
    note: "+ 150 € HT d'installation et de paramétrage, facturés une seule fois. Tarifs hors taxes.",
    tiers: [
      {
        name: "RDV Pro",
        price: "29 €",
        cadence: "HT/mois",
        blurb:
          "Ou 290 € HT par an, deux mois offerts. Installation et réglages par notre équipe.",
        features: [
          "Employés, services et clients illimités",
          "Réservation en ligne 24 h/24 et paiement sécurisé",
          "Rappels e-mail automatiques, SMS en option",
          "Cartes cadeau, forfaits et abonnements",
          "Google Agenda, Google Meet et Zoom",
          "Mini site de réservation à vos couleurs",
          "Bouton « Réserver » sur votre fiche Google",
          "Installation, réglages et formation par notre équipe",
          "Support humain par WhatsApp, sans surcoût",
        ],
        cta: { label: "Réserver mon appel", href: "/contact/" },
        featured: true,
      },
    ],
  },

  /* ---- questions, toutes tirées des faits énoncés sur la page ----------- */
  faq: {
    heading: "Vos questions, nos réponses.",
    items: [
      [
        "Combien de temps pour être opérationnel ?",
        "48 heures. Notre équipe installe et règle l'agenda d'après votre façon de travailler : prestations, durées, équipe, paiements, rappels et règles d'annulation. Vous n'ouvrez aucun panneau de configuration.",
      ],
      [
        "Faut-il déjà avoir un site web ?",
        "Non. RDV Pro génère votre propre site de réservation, à vos couleurs et sous votre nom, avec vos prestations, vos photos, votre équipe et vos tarifs. Il est indexable par Google, donc vous pouvez recevoir des rendez-vous avant même d'avoir un site.",
      ],
      [
        "Comment éviter les rendez-vous non honorés ?",
        "En encaissant avant la venue : paiement intégral, acompte ou carte cadeau, au choix par prestation. S'ajoutent la confirmation immédiate, le rappel la veille, le rappel du matin même, et une liste d'attente qui repropose le créneau en cas d'annulation.",
      ],
      [
        "Et si nous sommes plusieurs praticiens ?",
        "Chacun a ses prestations, ses horaires, ses jours de congé et son agenda personnel, synchronisé avec Google Agenda ou Outlook. Les employés, les lieux et les prestations sont illimités, et les doubles réservations deviennent impossibles.",
      ],
      [
        "Les consultations à distance sont-elles gérées ?",
        "Oui. Le lien Google Meet ou Zoom est généré au moment de la réservation, envoyé aux deux parties dans la confirmation, puis rappelé avant l'heure.",
      ],
      [
        "Quelle différence avec l'agenda inclus dans Shake One ?",
        "Le module de Shake One convient à un agenda simple : un seul employé, des créneaux simples, un rappel par e-mail. RDV Pro tient un cabinet, un salon ou une équipe entière : multi-praticiens, multi-sites, acomptes et forfaits, web app de l'équipe, mini site de réservation et bouton sur votre fiche Google. Si vous hésitez, commencez par Shake One et basculez plus tard : votre contenu et vos clients vous suivent.",
      ],
    ],
  },

  /* ---- sections non affichées par la mise en page « offre » -------------- */
  conversation: {
    eyebrow: "",
    heading: "",
    sub: "",
    bullets: [],
  },
  trust: {
    eyebrow: "",
    heading: "",
    items: [],
  },
  testimonials: {
    eyebrow: "Ils nous font confiance",
    heading: "Des entreprises comme la vôtre, déjà équipées.",
    // Volontairement vide : la section se masque toute seule. Vos références
    // sont publiées sur le site, mais sans citation attribuée — n'ajoutez ici
    // que des témoignages que vous êtes autorisé à publier.
    items: [],
  },

  finalCta: {
    headline: "Raccrochez le téléphone. Ils réservent en ligne.",
    subhead:
      "Agenda installé et réglé sous 48 heures par notre équipe. 29 € HT par mois, tout compris.",
    ctaLabel: "Réserver mon appel découverte",
    ctaHref: "/contact/",
    trustLine: [
      "Installé sous 48 h",
      "Tout illimité",
      "Support humain par WhatsApp",
    ],
  },
};

export default rdvFr;
