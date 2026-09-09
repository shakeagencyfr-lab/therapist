/* =============================================================================
 *  ui.ts — les libellés d'interface codés en dur dans les composants
 * =============================================================================
 *
 *  Tout ce qui n'est pas du contenu de marque (celui-là vit dans
 *  brand.config.ts pour le français et content/en.ts pour l'anglais) mais
 *  qui apparaît quand même à l'écran : étiquettes de la maquette d'inbox,
 *  badges, libellés d'accessibilité.
 *
 *  Usage dans un composant :  const ui = useUi();  puis  {ui.soon}
 * ========================================================================== */

export interface UiStrings {
  /* Navigation */
  openMenu: string;
  closeMenu: string;
  langLabel: string;
  langSwitchTo: string;

  /* Divers */
  soon: string;
  partial: string;
  mostPopular: string;
  watchDemo: string;
  getStarted: string;
  support: string;
  helpCentre: string;
  allSystemsOperational: string;

  /* Maquette de boîte de réception */
  inbox: string;
  lead: string;
  handOff: string;
  aiInsight: string;
  live: string;
  activeCount: string;
  aiHandling: string;

  /* Menu Design (aperçu des thèmes) */
  design: string;
  homeLayout: string;
  previewNote: string;
  themesTapToPreview: string;
  layoutsTapToPreview: string;

  /* Titres et descriptions des sous-pages (le nom de marque est ajouté au rendu) */
  pricingTitle: string;
  pricingMeta: string;
  contactTitle: string;
  contactMeta: string;

  /* Page Tarifs */
  pricingWhatYouGet: string;
  pricingEverything: string;
  pricingSub: string;
  pricingIncludedBadge: string;
  pricingOutOfBox: string;
  pricingScalesEyebrow: string;
  pricingPayForWhat: string;
  pricingIncluded: Array<{ t: string; b: string }>;
  pricingScale: Array<{ t: string; b: string }>;

  /* Page Contact */
  contactEyebrow: string;
  contactH1A: string;
  contactH1Highlight: string;
  contactEmailCta: (email: string) => string;
  contactIntro: string;
  contactWhatsAppCta: string;
  contactPickChannel: string;
  contactThreeWays: string;
  contactWaTitle: string;
  contactWaBody: string;
  contactWaCta: string;
  contactEmailTitle: string;
  /** Reçoit l'adresse e-mail d'assistance. */
  contactEmailBody: (email: string) => string;
  contactDocsTitle: string;
  contactDocsBody: string;
  contactDocsCta: string;
  contactExpectEyebrow: string;
  contactExpectHeading: string;
  contactExpectItems: (email: string) => Array<{ h: string; b: string }>;
  contactCompanyEyebrow: string;
  contactWhoHeading: string;
  contactLegalName: string;
  contactJurisdiction: string;
  contactEmailLabel: string;
  contactDoneReading: string;
  contactDoneHighlight: string;
  contactDoneBody: string;
  contactOpenDemo: string;

  /* Démonstrations animées (étapes « Comment ça marche ») */
  demoDetected: string[];
  demoGenerate: string;
  demoGenerating: string;
  demoWebChat: string;
  demoStatus: string;
  demoActiveInbox: string;
  demoFlow: Array<{ lead: string; reply: string }>;

  /* Bouton WhatsApp flottant */
  waChatLabel: string;
  waAriaLabel: string;

  /* Gabarit des pages légales */
  legalKicker: string;
  legalLastUpdated: string;
  legalToc: string;
  legalOnThisPage: string;
  legalQuestions: string;
  legalReachUs: string;
  legalWithinTwoDays: string;
  legalEmailUs: string;

  /* Page 404 */
  notFoundTitle: string;
  notFoundBody: string;
  notFoundHome: string;
  notFoundContact: string;
}

export const UI: Record<"fr" | "en", UiStrings> = {
  fr: {
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    langLabel: "Langue",
    langSwitchTo: "Voir cette page en anglais",

    soon: "bientôt",
    partial: "Partiel",
    mostPopular: "Le plus choisi",
    watchDemo: "Voir la démo de 2 minutes",
    getStarted: "Commencer",
    support: "Assistance",
    helpCentre: "Centre d'aide",
    allSystemsOperational: "Tous les systèmes fonctionnent",

    inbox: "Boîte de réception",
    lead: "Prospect",
    handOff: "Passer la main",
    aiInsight: "Analyse IA",
    live: "En direct",
    activeCount: "actives",
    aiHandling: "Traité par l'IA · aucune intervention humaine",

    design: "Design",
    homeLayout: "Mise en page",
    previewNote:
      "Aperçu seulement — à définir pour de bon dans brand.config.ts",
    themesTapToPreview: "Thèmes — cliquez pour prévisualiser",
    layoutsTapToPreview: "Mises en page — cliquez pour prévisualiser",

    pricingTitle: "Tarifs — des offres qui suivent votre croissance.",
    pricingMeta:
      "Des tarifs simples et transparents pour votre agent commercial IA. Commencez gratuitement, changez d'offre quand il rapporte plus qu'il ne coûte, résiliez à tout moment.",
    contactTitle: "Contact — parlez à l'IA sur WhatsApp.",
    contactMeta:
      "Le plus rapide pour nous joindre, c'est notre propre agent commercial IA sur WhatsApp. Sinon, écrivez-nous par e-mail.",

    pricingWhatYouGet: "Ce que vous obtenez",
    pricingEverything: "Tout ce qu'il vous faut",
    pricingSub:
      "Pas de paliers cachés, pas de mauvaise surprise. Chaque offre comprend un essai gratuit et les canaux que vos clients utilisent déjà.",
    pricingIncludedBadge: "Inclus",
    pricingOutOfBox: "Un agent commercial IA opérationnel, dès le départ.",
    pricingScalesEyebrow: "Des tarifs qui suivent votre croissance",
    pricingPayForWhat: "Payez ce dont vous avez besoin, quand vous en avez besoin.",
    pricingIncluded: [
      {
        t: "Tous les canaux, une seule boîte",
        b: "Connectez WhatsApp, Instagram, Messenger, le chat de votre site et vos SMS. Toutes les conversations arrivent au même endroit.",
      },
      {
        t: "Des réponses 24h/24",
        b: "Votre agent commercial IA répond en quelques secondes, jour et nuit, avec le ton de votre marque et dans la langue de votre client.",
      },
      {
        t: "Il réserve et il relance",
        b: "Il qualifie les prospects, répond aux questions, prend les rendez-vous et relance pour que rien ne se perde.",
      },
      {
        t: "Un essai gratuit sur chaque offre",
        b: "Connectez un canal et laissez l'IA travailler sur de vraies conversations avant le premier prélèvement. Sans carte bancaire pour commencer.",
      },
    ],
    pricingScale: [
      {
        t: "Commencez petit",
        b: "Démarrez sur un seul canal et laissez d'abord l'IA faire ses preuves sur de vraies conversations.",
      },
      {
        t: "Ajoutez des canaux en grandissant",
        b: "Activez d'autres canaux et fonctions quand vous le voulez — sans migration ni réapprentissage.",
      },
      {
        t: "Montez d'offre quand elle se rembourse",
        b: "Passez à l'offre supérieure une fois que l'IA réserve et conclut plus que ne coûte l'abonnement.",
      },
      {
        t: "Sans engagement",
        b: "Toutes les offres sont facturées au mois. Vous pouvez redescendre ou résilier depuis votre tableau de bord à tout moment.",
      },
    ],

    contactEyebrow: "Parlons-en",
    contactH1A: "Le plus rapide pour nous joindre,",
    contactH1Highlight: "c'est notre propre IA.",
    contactEmailCta: (email) => `Écrire à ${email}`,
    contactIntro:
      "L'agent commercial IA que nous vous proposons traite lui-même toutes les demandes qui arrivent ici. Écrivez-lui sur WhatsApp et vous aurez une réponse en quelques secondes. Vous préférez un humain ? Envoyez-nous un e-mail. Dans les deux cas, vous aurez une réponse.",
    contactWhatsAppCta: "Parler à l'IA sur WhatsApp",
    contactPickChannel: "Choisissez votre canal",
    contactThreeWays: "Trois façons de nous joindre",
    contactWaTitle: "Parler à l'IA sur WhatsApp",
    contactWaBody:
      "Le plus rapide. Notre propre agent commercial IA répond en quelques secondes, traite vos questions, fixe un rendez-vous et vous passe un humain quand c'est utile.",
    contactWaCta: "Écrire sur WhatsApp",
    contactEmailTitle: "Écrire à l'équipe",
    contactEmailBody: (email) =>
      `Vous préférez l'e-mail ? Écrivez à ${email} — commercial, assistance, facturation, presse, tout arrive à la même adresse. Nous répondons sous un jour ouvré.`,
    contactDocsTitle: "Consulter la documentation",
    contactDocsBody:
      "Le centre d'aide contient des guides complets sur l'installation, les canaux, l'entraînement de l'IA et le reste. Il répond à la plupart des questions en deux minutes.",
    contactDocsCta: "Ouvrir le centre d'aide",
    contactExpectEyebrow: "À quoi vous attendre",
    contactExpectHeading: "Une réponse en quelques secondes. Des humains derrière.",
    contactCompanyEyebrow: "Société",
    contactWhoHeading: "Qui vous répond",
    contactLegalName: "Raison sociale",
    contactJurisdiction: "Juridiction",
    contactEmailLabel: "E-mail",
    contactDoneReading: "Fini de lire ?",
    contactDoneHighlight: "Parlez à l'IA.",
    contactDoneBody:
      "Cinq minutes sur WhatsApp avec notre agent valent mieux que cinq minutes sur cette page. Vous verrez exactement ce que verront vos clients.",
    contactOpenDemo: "Ouvrir la démonstration WhatsApp",
    contactExpectItems: (email) => [
      {
        h: "Réponse immédiate de l'IA",
        b: "Notre agent commercial IA prend le relais tout de suite et traite la plupart des questions sans qu'un humain touche à la conversation.",
      },
      {
        h: "Passage à un humain si nécessaire",
        b: "Tout ce qui est complexe ou sensible est transmis à une personne, qui prend le relais sous quelques heures les jours ouvrés.",
      },
      {
        h: "Un jour ouvré par e-mail",
        b: `${email} est surveillée par l'équipe. Nous visons moins de 24 h sur chaque réponse.`,
      },
      {
        h: "De l'aide quand il en faut",
        b: "Parcourez le centre d'aide à tout moment pour des guides pas à pas, ou écrivez-nous et nous vous orienterons.",
      },
    ],

    demoDetected: ["Offres", "Tarifs", "FAQ", "Ton de voix"],
    demoGenerate: "Générer",
    demoGenerating: "Génération…",
    demoWebChat: "Chat du site",
    demoStatus: "Statut",
    demoActiveInbox: "Actif · boîte en direct",
    demoFlow: [
      {
        lead: "Bonjour, j'aimerais en savoir plus",
        reply: "Avec plaisir ! Quelle prestation vous intéresse ?",
      },
      {
        lead: "C'est combien la formule complète ?",
        reply: "Je vous détaille ça — je vous envoie la grille tarifaire ?",
      },
      {
        lead: "Je peux avoir un rendez-vous cette semaine ?",
        reply: "Bien sûr. J'ai jeudi 14h00 de libre. Je vous le bloque ?",
      },
      {
        lead: "Vous livrez en Belgique ?",
        reply: "Oui, offert dès 50 €. Je vous montre nos best-sellers ?",
      },
      {
        lead: "Il y a une garantie de remboursement ?",
        reply: "Remboursement intégral sous 30 jours, sans justification. Je vous envoie le lien ?",
      },
      {
        lead: "Franchement, c'est un peu cher…",
        reply:
          "Je comprends. La plupart de nos clients sont rentables dès la 3e semaine. Je vous envoie l'étude de cas ?",
      },
    ],

    waChatLabel: "Discuter avec l'IA",
    waAriaLabel: "Discuter avec l'IA sur WhatsApp",

    legalKicker: "Mentions légales",
    legalLastUpdated: "Dernière mise à jour :",
    legalToc: "Sommaire",
    legalOnThisPage: "Sur cette page",
    legalQuestions: "Une question sur ce document ?",
    legalReachUs: "Écrivez à notre équipe à",
    legalWithinTwoDays: "et nous vous répondrons sous deux jours ouvrés.",
    legalEmailUs: "Nous écrire",

    notFoundTitle: "Cette page s'est égarée.",
    notFoundBody:
      "Le lien est cassé ou la page a été déplacée. L'IA, elle, répond à chaque message — jour et nuit.",
    notFoundHome: "Retour à l'accueil",
    notFoundContact: "Nous contacter",
  },

  en: {
    openMenu: "Open menu",
    closeMenu: "Close menu",
    langLabel: "Language",
    langSwitchTo: "View this page in French",

    soon: "soon",
    partial: "Partial",
    mostPopular: "Most popular",
    watchDemo: "Watch the 2-minute demo",
    getStarted: "Get Started",
    support: "Support",
    helpCentre: "Help Centre",
    allSystemsOperational: "All systems operational",

    inbox: "Inbox",
    lead: "Lead",
    handOff: "Hand off",
    aiInsight: "AI Insight",
    live: "Live",
    activeCount: "active",
    aiHandling: "AI handling · zero human input",

    design: "Design",
    homeLayout: "Home layout",
    previewNote: "Previews only — set it for real in brand.config.ts",
    themesTapToPreview: "Themes — tap to preview",
    layoutsTapToPreview: "Layouts — tap to preview",

    pricingTitle: "Pricing — plans that scale with you.",
    pricingMeta:
      "Simple, transparent pricing for your AI sales agent. Start free, upgrade when it is closing more than it costs, and cancel anytime.",
    contactTitle: "Contact — talk to the AI on WhatsApp.",
    contactMeta:
      "The fastest way to reach us is through our own AI sales agent on WhatsApp. Or email the team.",

    pricingWhatYouGet: "What you get",
    pricingEverything: "Everything you need",
    pricingSub:
      "No hidden tiers, no surprises. Every plan includes a free trial and the channels your customers already use.",
    pricingIncludedBadge: "Included",
    pricingOutOfBox: "A working AI sales agent, out of the box.",
    pricingScalesEyebrow: "Pricing that scales with you",
    pricingPayForWhat: "Pay for what you need, when you need it.",
    pricingIncluded: [
      {
        t: "Every channel, one inbox",
        b: "Connect WhatsApp, Instagram, Messenger, web chat and SMS. Every conversation lands in a single place.",
      },
      {
        t: "Replies around the clock",
        b: "Your AI sales agent answers in seconds, day or night, in your brand voice and your customer's language.",
      },
      {
        t: "Books and follows up",
        b: "It qualifies leads, handles questions, books appointments and follows up so nothing slips through the cracks.",
      },
      {
        t: "Free trial on every plan",
        b: "Connect a channel and run the AI on real conversations before billing starts. No card required to begin.",
      },
    ],
    pricingScale: [
      {
        t: "Start small",
        b: "Begin on a single channel and let the AI prove itself on real conversations first.",
      },
      {
        t: "Add channels as you grow",
        b: "Turn on more channels and features whenever you are ready — no migration, no re-training.",
      },
      {
        t: "Upgrade when it pays for itself",
        b: "Move up a plan once the AI is booking and closing more than the subscription costs.",
      },
      {
        t: "No contracts",
        b: "Every plan is billed monthly. Downgrade or cancel from your dashboard anytime.",
      },
    ],

    contactEyebrow: "Talk to us",
    contactH1A: "The Fastest Way to Reach Us Is",
    contactH1Highlight: "Through Our Own AI.",
    contactEmailCta: (email) => `Email ${email}`,
    contactIntro:
      "The same AI sales agent we offer you handles every inbound conversation here. Message it on WhatsApp and you will get an answer in seconds. Want a human instead? Email us. Either way, you will hear back.",
    contactWhatsAppCta: "Talk to the AI on WhatsApp",
    contactPickChannel: "Pick your channel",
    contactThreeWays: "Three Ways to Get In Touch",
    contactWaTitle: "Talk to the AI on WhatsApp",
    contactWaBody:
      "The fastest path. Our own AI sales agent answers in seconds, handles your questions, books a call and hands you off to a human when it matters.",
    contactWaCta: "Message on WhatsApp",
    contactEmailTitle: "Email the team",
    contactEmailBody: (email) =>
      `Prefer email? Send anything to ${email} — sales, support, billing, press, all the same address. We reply within one business day.`,
    contactDocsTitle: "Read the docs first",
    contactDocsBody:
      "The Help Centre has full walkthroughs for setup, channels, AI training and more. It answers most questions in a couple of minutes.",
    contactDocsCta: "Open Help Centre",
    contactExpectEyebrow: "What to expect",
    contactExpectHeading: "Replies in Seconds. Humans in the Loop.",
    contactCompanyEyebrow: "Company",
    contactWhoHeading: "Who You Are Reaching",
    contactLegalName: "Legal name",
    contactJurisdiction: "Jurisdiction",
    contactEmailLabel: "Email",
    contactDoneReading: "Done reading?",
    contactDoneHighlight: "Talk to the AI.",
    contactDoneBody:
      "Five minutes in WhatsApp with our agent beats five minutes on this page. You will see exactly what your customers will see.",
    contactOpenDemo: "Open the WhatsApp demo",
    contactExpectItems: (email) => [
      {
        h: "Instant AI response",
        b: "Our AI sales agent picks up immediately and handles most questions without a human ever touching the conversation.",
      },
      {
        h: "Human handoff when needed",
        b: "Anything complex or sensitive gets passed to a person, who takes over within hours during business days.",
      },
      {
        h: "One business day on email",
        b: `${email} is monitored by the team. We aim for under 24h on every reply.`,
      },
      {
        h: "Help when you need it",
        b: "Browse the Help Centre any time for step-by-step guides, or reach out and we will point you in the right direction.",
      },
    ],

    demoDetected: ["Products", "Pricing", "FAQ", "Tone of voice"],
    demoGenerate: "Generate",
    demoGenerating: "Generating…",
    demoWebChat: "Web chat",
    demoStatus: "Status",
    demoActiveInbox: "Active · live inbox",
    demoFlow: [
      {
        lead: "Hi, I'd like to learn more",
        reply: "Happy to help! Which service interests you?",
      },
      {
        lead: "How much for the package?",
        reply: "Happy to break it down — want me to send the full pricing?",
      },
      {
        lead: "Can I book a call this week?",
        reply: "Sure. I have Thursday 14:00 free. Lock it in?",
      },
      {
        lead: "Do you ship to NL?",
        reply: "Yes, free over €50. Want our bestsellers?",
      },
      {
        lead: "Is there a refund policy?",
        reply: "30-day full refund, no questions. Want me to send the link?",
      },
      {
        lead: "Honestly, it's a bit pricey…",
        reply:
          "Totally hear you. Most clients break even by week 3. Want the case study?",
      },
    ],

    waChatLabel: "Chat with the AI",
    waAriaLabel: "Chat with the AI on WhatsApp",

    legalKicker: "Legal",
    legalLastUpdated: "Last updated:",
    legalToc: "Table of contents",
    legalOnThisPage: "On this page",
    legalQuestions: "Questions about this document?",
    legalReachUs: "Reach our team at",
    legalWithinTwoDays: "and we will respond within two business days.",
    legalEmailUs: "Email us",

    notFoundTitle: "This page wandered off.",
    notFoundBody:
      "The link is broken or the page has moved. The AI answers every message — day and night.",
    notFoundHome: "Back to the home page",
    notFoundContact: "Contact us",
  },
};

export default UI;
