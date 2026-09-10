/* Booster IA Pro — contenu de la landing, version FRANÇAISE.
 * Servie à la racine du site. Accent vert, voir src/products.ts. */
import type { ProductContent } from "./types";

export const iaFr: ProductContent = {
  tagline:
    "L'agent commercial IA qui répond, qualifie et prend les rendez-vous dans vos messages privés.",
  channels: [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "instagram", label: "Instagram" },
    { key: "messenger", label: "Messenger" },
    { key: "webchat", label: "Chat du site" },
    { key: "sms", label: "SMS" },
    { key: "imessage", label: "iMessage", soon: true },
    { key: "telegram", label: "Telegram", soon: true },
  ],
  hero: {
    badge: "Répond en quelques secondes. Prend le rendez-vous. Conclut.",
    titleA: "L'agent commercial IA qui",
    titleHighlight: "conclut vos ventes",
    titleB: "dans vos messages privés.",
    subhead:
      "YourBrand répond à chaque message en quelques secondes, qualifie le prospect, lève les objections, fixe le rendez-vous et relance — sur WhatsApp, Instagram, Messenger, le chat de votre site et par SMS. Jour et nuit, avec le ton de votre marque.",
    primaryCta: { label: "Démarrer l'essai gratuit", href: "/pricing/" },
    secondaryCta: { label: "Voir une démonstration", href: "/#how-it-works" },
    // L'identifiant YouTube de votre vidéo — utilisé par la mise en page "vsl".
    videoId: null,
    kpis: [
      { value: "24h/24", label: "plus aucun message manqué" },
      { value: "<30 s", label: "temps de réponse moyen", highlight: true },
      { value: "5", label: "canaux, une seule boîte" },
      { value: "15 min", label: "pour être en ligne" },
    ],
  },
  comparison: {
    eyebrow: "Ce qui change",
    heading: "Un agent commercial IA, pas un chatbot.",
    youLabel: "YourBrand",
    themLabel: "Chatbot classique",
    rows: [
      ["Conclut des ventes dans la conversation", true, false],
      ["Lève les objections", true, false],
      ["Prend les rendez-vous sans quitter le fil", true, false],
      ["Comprend images, messages vocaux et vidéos", true, false],
      ["Se souvient des échanges précédents", true, false],
      ["Progresse automatiquement", true, false],
      ["Répond avec le ton de votre marque", true, "partial"],
      ["Tous les canaux dans une seule boîte", true, false],
    ],
  },
  howItWorks: {
    eyebrow: "En ligne en 15 minutes",
    heading: "Trois étapes vers un commercial disponible 24h/24.",
    steps: [
      {
        title: "Connectez vos canaux",
        body: "Reliez WhatsApp, Instagram, Messenger, le chat de votre site et vos SMS. Toutes les conversations arrivent au même endroit.",
      },
      {
        title: "Formez-le à votre activité",
        body: "Collez l'adresse de votre site ou déposez votre FAQ. L'IA apprend votre offre, vos tarifs et votre ton en quelques minutes — sans scénario à écrire.",
      },
      {
        title: "Il se met à vendre",
        body: "Il répond en quelques secondes, qualifie chaque prospect, répond aux questions, fixe le rendez-vous et relance pour que rien ne se perde.",
      },
    ],
  },
  features: {
    eyebrow: "Ce qu'il fait",
    heading: "Tout ce que fait un bon commercial. Immédiatement.",
    items: [
      {
        emoji: "speech-balloon.png",
        title: "Il vend",
        body: "Il qualifie, lève les objections et fait avancer la conversation vers un rendez-vous ou une vente — pas de simples réponses toutes faites.",
      },
      {
        emoji: "calendar.png",
        title: "Il prend les rendez-vous",
        body: "Il propose des créneaux, confirme et inscrit le rendez-vous dans votre agenda, directement dans la conversation.",
      },
      {
        emoji: "eyes.png",
        title: "Il comprend tout",
        body: "Il lit les images, écoute les messages vocaux et regarde les vidéos : vos clients écrivent comme ils en ont l'habitude.",
      },
      {
        emoji: "brain.png",
        title: "Il se souvient",
        body: "Il retrouve chaque échange passé avec un client, si bien que chaque réponse reste personnelle et reprend là où vous en étiez.",
      },
      {
        emoji: "chart-increasing.png",
        title: "Il s'améliore",
        body: "Il apprend de chaque conversation et affine ses réponses avec le temps — tout seul.",
      },
      {
        emoji: "megaphone.png",
        title: "Il mène vos campagnes",
        body: "Il contacte, réactive les prospects froids et relance à grande échelle, puis rend la main à l'IA dès qu'une réponse arrive.",
      },
      {
        emoji: "link.png",
        title: "Il se connecte à vos outils",
        body: "Il se relie à votre CRM, votre agenda et vos outils via des webhooks et des intégrations.",
      },
      {
        emoji: "globe.png",
        title: "Il parle votre langue",
        body: "Il répond avec votre ton et dans la langue de votre client, sur tous les canaux.",
      },
    ],
  },
  problem: {
    eyebrow: "Le problème",
    heading: "Chaque réponse tardive est une vente perdue.",
    sub: "Vos prospects sont déjà dans vos messages privés — reste à savoir si quelqu'un répond pendant qu'ils sont encore intéressés.",
    items: [
      {
        emoji: "hourglass-not-done.png",
        title: "Tout se joue en quelques minutes",
        body: "Un message auquel on répond en quelques secondes entretient l'envie d'acheter. Celui auquel on répond le lendemain tombe dans une conversation déjà refroidie.",
      },
      {
        emoji: "money-with-wings.png",
        title: "Un message manqué, un client perdu",
        body: "Chaque message sans réponse est un client qui était prêt à discuter — et qui écrit probablement déjà à votre concurrent.",
      },
      {
        emoji: "snowflake.png",
        title: "Vous ne pouvez pas être là 24h/24",
        body: "Les soirées, les week-ends et les jours fériés sont précisément les moments où l'on navigue et où l'on écrit — et précisément ceux où personne ne répond.",
      },
    ],
  },
  conversation: {
    eyebrow: "Voyez-le à l'œuvre",
    heading: "Du premier message à la vente conclue, sans intervention.",
    sub: "Voilà à quoi ressemble une vraie conversation : qualifier le prospect, répondre aux questions, lever l'objection, réserver le créneau, confirmer. Aucune intervention humaine.",
    bullets: [
      "Répond en quelques secondes, avec le ton de votre marque",
      "Lève les objections et fixe le rendez-vous sans quitter la conversation",
      "Vous passe la main dès que vous voulez reprendre",
    ],
  },
  guarantee: {
    eyebrow: "Démarrage sans risque",
    heading: "Essayez sans rien engager.",
    points: [
      {
        emoji: "rocket.png",
        title: "Commencez gratuitement",
        body: "Installez-le, connectez un canal et regardez-le traiter de vraies conversations avant de payer quoi que ce soit.",
      },
      {
        emoji: "alarm-clock.png",
        title: "En ligne en 15 minutes",
        body: "Ni développeur ni scénario à écrire — collez l'adresse de votre site et l'IA apprend votre offre, vos tarifs et votre ton.",
      },
      {
        emoji: "handshake.png",
        title: "Vous gardez la main",
        body: "Intervenez dans n'importe quelle conversation, corrigez l'IA ou désactivez-la au cas par cas. C'est votre boîte de réception, l'IA ne fait que la traiter.",
      },
      {
        emoji: "key.png",
        title: "Vos données restent les vôtres",
        body: "Exportez vos contacts et vos conversations quand vous le souhaitez. Sans enfermement.",
      },
    ],
  },
  trust: {
    eyebrow: "Sécurité et confidentialité",
    heading: "Les données de vos clients, traitées comme il se doit.",
    items: [
      {
        emoji: "globe.png",
        title: "Hébergement européen",
        body: "Le service et les données de vos clients tournent sur des serveurs sécurisés situés dans l'Union européenne.",
      },
      {
        emoji: "key.png",
        title: "Chiffrement",
        body: "Les données sont chiffrées en transit ; les identifiants et les jetons d'intégration le sont au repos.",
      },
      {
        emoji: "balance-scale.png",
        title: "Conforme au RGPD",
        body: "Des durées de conservation claires, les clauses contractuelles types de l'UE pour les transferts et une liste de sous-traitants transparente.",
      },
      {
        emoji: "shield.png",
        title: "Vous décidez",
        body: "Supprimez ou exportez les données d'un contact dès qu'un client le demande — les outils sont intégrés.",
      },
    ],
  },
  useCases: {
    eyebrow: "Pour qui",
    heading: "Conçu pour les activités qui vivent dans la messagerie.",
    items: [
      {
        emoji: "lotion-bottle.png",
        title: "Beauté et bien-être",
        body: "Salons, spas et studios : répondez aux questions sur les soins, réservez le créneau et encaissez l'acompte — pendant que vous êtes avec un client.",
      },
      {
        emoji: "tooth.png",
        title: "Cabinets et cliniques",
        body: "Qualifiez les nouveaux patients, répondez aux questions de tarifs et remplissez l'agenda sans que l'accueil touche un seul message.",
      },
      {
        emoji: "graduation-cap.png",
        title: "Coachs et consultants",
        body: "Transformez les « comment ça marche ? » en appels de découverte réservés, avec des relances qui ne laissent aucun prospect refroidir.",
      },
      {
        emoji: "house.png",
        title: "Immobilier",
        body: "Répondez à chaque demande en quelques secondes, qualifiez l'acheteur et fixez la visite avant que la concurrence n'ait répondu.",
      },
      {
        emoji: "shopping-cart.png",
        title: "E-commerce",
        body: "Répondez aux questions produit, récupérez les paniers abandonnés et recommandez le bon article — sur les canaux que vos clients utilisent déjà.",
      },
      {
        emoji: "briefcase.png",
        title: "Agences et prestataires",
        body: "Qualifiez les demandes entrantes, fixez les rendez-vous stratégiques et gardez vos prospects au chaud sur toutes les conversations clients.",
      },
    ],
  },
  integrations: {
    eyebrow: "Il s'intègre à votre organisation",
    heading: "Tous vos canaux dans une seule boîte — et vos outils avec.",
    sub: "Les conversations arrivent de tous les canaux connectés, et l'IA travaille avec les outils sur lesquels vous faites déjà tourner votre activité.",
    tools: [
      "Google Agenda",
      "Webhooks et API",
      "Votre CRM",
      "Liens de paiement",
      "Fonctions sur mesure",
    ],
  },
  testimonials: {
    eyebrow: "Ils nous font confiance",
    heading: "Ce que disent nos clients.",
    // ⚠️ VOLONTAIREMENT VIDE. N'ajoutez que des témoignages que vous êtes
    // autorisé à publier. Tant que ce tableau est vide, la section est masquée.
    items: [],
  },
  pricing: {
    eyebrow: "Tarifs",
    heading: "Des tarifs simples, qui suivent votre croissance.",
    subheading:
      "Commencez gratuitement. Passez à l'offre supérieure quand l'IA rapporte plus qu'elle ne coûte.",
    note: "Toutes les offres incluent l'ensemble des canaux et 14 jours d'essai gratuit. Résiliable à tout moment.",
    tiers: [
      {
        name: "Découverte",
        price: "27 €",
        cadence: "/mois",
        blurb: "Pour les indépendants et les petites équipes qui se lancent.",
        features: [
          "1 canal",
          "Réponses IA 24h/24",
          "Capture et étiquetage des prospects",
          "Assistance par e-mail",
        ],
        cta: { label: "Essai gratuit", href: "/pricing/" },
      },
      {
        name: "Croissance",
        price: "97 €",
        cadence: "/mois",
        blurb: "Pour les entreprises présentes sur plusieurs canaux.",
        features: [
          "Tous les canaux",
          "Prise de rendez-vous",
          "Campagnes et relances",
          "Intégrations",
          "Assistance prioritaire",
        ],
        cta: { label: "Essai gratuit", href: "/pricing/" },
        featured: true,
      },
      {
        name: "Pro",
        price: "297 €",
        cadence: "/mois",
        blurb:
          "Pour les équipes qui veulent la puissance et leur propre clé d'IA.",
        features: [
          "Tout ce que contient Croissance",
          "Volumes plus élevés",
          "Votre propre clé d'IA",
          "Automatisations avancées",
          "Accompagnement dédié",
        ],
        cta: { label: "Parlons-en", href: "/contact/" },
      },
    ],
  },
  faq: {
    heading: "Vos questions, nos réponses.",
    items: [
      [
        "Quels canaux sont couverts ?",
        "WhatsApp (API Business et WhatsApp Web), les messages privés Instagram, Facebook Messenger, le chat de votre site et les SMS — le tout dans une seule boîte de réception. iMessage et Telegram arrivent bientôt.",
      ],
      [
        "Combien de temps prend l'installation ?",
        "Une quinzaine de minutes. Vous connectez vos canaux, collez l'adresse de votre site ou votre FAQ, et l'IA est prête à répondre.",
      ],
      [
        "Est-ce que ça fait robotique ?",
        "Non. Il répond avec le ton de votre marque, dans la langue de votre client, et vous réglez son style. La plupart des clients n'y voient que du feu.",
      ],
      [
        "Que se passe-t-il s'il ne sait pas répondre ?",
        "Il vous passe la conversation avec tout le contexte, pour que rien ne passe entre les mailles.",
      ],
      [
        "Fonctionne-t-il dans ma langue ?",
        "Oui. Il comprend et répond automatiquement dans des dizaines de langues, en s'adaptant à celle de votre client.",
      ],
      [
        "Mes données sont-elles en sécurité ?",
        "Vos conversations vous appartiennent. Consultez notre politique de confidentialité pour le détail du stockage et du traitement.",
      ],
    ],
  },
  finalCta: {
    headline: "Ne perdez plus de ventes dans vos messages privés.",
    subhead:
      "Activez votre agent commercial IA et laissez-le qualifier, réserver et conclure — 24h/24, sur tous vos canaux, en 15 minutes.",
    ctaLabel: "Démarrer l'essai gratuit",
    ctaHref: "/pricing/",
    trustLine: [
      "14 jours d'essai gratuit",
      "Sans carte bancaire",
      "Installé en 15 min",
    ],
  },
};

export default iaFr;
