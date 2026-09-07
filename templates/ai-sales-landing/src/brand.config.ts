/* =============================================================================
 *  brand.config.ts  —  THE ONLY FILE YOU NEED TO EDIT TO MAKE THIS SITE YOURS
 * =============================================================================
 *
 *  This white-label landing template ships with neutral "YourBrand" placeholder
 *  copy so it renders as a working demo out of the box. Replace the values below
 *  with your own, drop your logo/favicon/og image into /public/brand/, run
 *  `npm run build`, and deploy. Nothing else needs touching for a basic rebrand.
 *
 *  👉 Search the codebase for the string "YourBrand" if you ever think you
 *     missed a spot — everything customer-facing flows from this file.
 *
 *  Anything wrapped in [SQUARE BRACKETS] is a placeholder you MUST replace
 *  before going live (especially the legal entity + the testimonials, which
 *  ship empty on purpose — never reuse someone else's reviews or logos).
 * ========================================================================== */

import type { ThemeName, ThemeColors } from "./themes";
import type { HomeLayoutName } from "./homeLayouts";
import { enContent } from "./content/en";

export interface BrandConfig {
  /* ---- Visual variant ----------------------------------------------------
   * The template ships with SIX complete looks — pick one word and the whole
   * site changes fonts, colours, card style and background:
   *   "original" — frosted glass + drifting grid, green, Space Grotesk
   *   "nebula"   — indigo/violet, solid elevated cards, Sora
   *   "bloom"    — rose serif (Fraunces), soft paper cards, boutique feel
   *   "ember"    — amber/orange, flat bordered cards, Bricolage Grotesque
   *   "tidal"    — sky/cyan, crisp minimal hairline cards, Manrope
   *   "mono"     — black & white minimalism, Inter (the Linear/Notion look)
   * Preview each by changing this value and reloading. Details: src/themes.ts */
  theme: ThemeName;

  /* ---- Home-page layout ---------------------------------------------------
   * Which sections the home page shows, in what order, and how it opens:
   *   "classic" — big hero + animated inbox, full story (the default)
   *   "split"   — copy left / live chat demo right, features first, leaner
   *   "vsl"     — video up top (hero.videoId), pricing early; for paid traffic
   * Layouts combine freely with any theme. Details: src/homeLayouts.ts */
  homeLayout: HomeLayoutName;

  /* ---- Identity ---------------------------------------------------------- */
  brandName: string;
  /** One-line product descriptor used in meta + footer. */
  tagline: string;
  /** Bare domain, no protocol. e.g. "yourbrand.com" */
  domain: string;
  /** Full canonical site URL, with protocol, no trailing slash. */
  siteUrl: string;
  /** Where "Log in" / dashboard CTAs point (your white-label app domain). */
  appUrl: string;
  supportEmail: string;
  /** Help / knowledge-base URL. Use appUrl or a docs subdomain. */
  helpUrl: string;
  /** Public WhatsApp deep-link (or any contact link) for the floating button. */
  whatsAppLink: string;

  /* ---- Legal (REPLACE — and have a lawyer review the Terms/Privacy) ------ */
  legalEntity: string;
  legalJurisdiction: string;
  legalEffectiveDate: string;

  /* ---- Infrastructure & sub-processors ----------------------------------
   * Pre-filled because the product runs on shared hosting/infrastructure that
   * is the same for everyone — so the hosting location and sub-processor list
   * are accurate out of the box and feed the Terms + Privacy pages directly.
   * Review with your lawyer and update if your setup differs. */
  infrastructure: {
    hostingRegion: string;
    hostingSummary: string;
    subProcessors: Array<{ name: string; purpose: string; location: string }>;
    transfersNote: string;
    retention: { conversations: string; backups: string; logs: string };
  };

  /* ---- Assets (paths under /public) -------------------------------------- */
  logo: string;
  logoAlt: string;
  favicon: string;
  ogImage: string;

  /* ---- Brand colours (optional) ------------------------------------------
   * null = use the accent colours that ship with your chosen theme (each
   * theme has its own — that's what makes the variants look different).
   * To use YOUR brand colour instead, set the six stops: they feed Tailwind's
   * `champ-*` classes and every gradient/button/accent in styles.css. Keep
   * them as a coherent light→dark ramp of ONE hue. Works with any theme. */
  colors: ThemeColors | null;

  /* ---- Navigation -------------------------------------------------------- */
  nav: {
    links: Array<{ href: string; label: string }>;
    /** Shows a "Themes" menu in the nav that live-previews every look
     *  (via ?theme= links — nothing changes until you set `theme` above).
     *  Handy while choosing a variant; set to false before going live. */
    themePicker: boolean;
    ctaLabel: string;
    ctaHref: string;
    loginLabel: string;
    loginHref: string;
  };

  /* ---- Channels shown as pills in the hero ------------------------------- */
  channels: Array<{ key: ChannelKey; label: string; soon?: boolean }>;

  /* ---- Hero -------------------------------------------------------------- */
  hero: {
    /** Optional small pill above the headline. Set to null to hide. */
    badge: string | null;
    /** Headline renders as: `${titleA} <gradient>${titleHighlight}</gradient> ${titleB}` */
    titleA: string;
    titleHighlight: string;
    titleB: string;
    subhead: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string } | null;
    /** YouTube video ID for the "vsl" layout's hero (the part after
     *  watch?v= — e.g. "dQw4w9WgXcQ"). null = the animated inbox showcase
     *  is shown instead until you add your video. */
    videoId: string | null;
    /** Four small stat chips. Keep these CAPABILITY facts, not customer-result
     *  claims (e.g. "24/7", "<30s reply") so they stay true for everyone. */
    kpis: Array<{ value: string; label: string; highlight?: boolean }>;
  };

  /* ---- "AI sales agent vs regular chatbot" comparison -------------------- */
  comparison: {
    eyebrow: string;
    heading: string;
    youLabel: string;
    themLabel: string;
    rows: Array<[string, Cell, Cell]>;
  };

  /* ---- How it works ------------------------------------------------------ */
  howItWorks: {
    eyebrow: string;
    heading: string;
    steps: Array<{ title: string; body: string }>;
  };

  /* ---- Feature bento ----------------------------------------------------- */
  features: {
    eyebrow: string;
    heading: string;
    /** `emoji` is a Fluent emoji filename that exists in /public/emoji
     *  (e.g. "brain.png") — rendered as a crisp animated-style image. A raw
     *  emoji character ("🧠") also works as a plain-text fallback. */
    items: Array<{ emoji: string; title: string; body: string }>;
  };

  /* ---- Problem / pain (the "problem" section) -----------------------------
   * The agitation block long-form funnels open with. Keep the claims
   * qualitative truths about slow replies, not invented statistics. */
  problem: {
    eyebrow: string;
    heading: string;
    sub: string;
    items: Array<{ emoji: string; title: string; body: string }>;
  };

  /* ---- Live conversation demo (the "conversation" section) ---------------
   * Copy + checklist next to an animated deal-closing chat (the demo
   * conversation itself ships with the template). */
  conversation: {
    eyebrow: string;
    heading: string;
    sub: string;
    bullets: string[];
  };

  /* ---- Risk reversal (the "guarantee" section) ---------------------------
   * Why starting is safe. Defaults are capability-facts; if you add a
   * money-back promise here, make sure YOU actually honour it. */
  guarantee: {
    eyebrow: string;
    heading: string;
    points: Array<{ emoji: string; title: string; body: string }>;
  };

  /* ---- Security & privacy strip (the "trust" section) --------------------
   * Should stay consistent with the `infrastructure` block above — it's the
   * marketing-page version of the same facts. */
  trust: {
    eyebrow: string;
    heading: string;
    items: Array<{ emoji: string; title: string; body: string }>;
  };

  /* ---- Use cases / industries (the "useCases" section) -------------------
   * Who the product is for. Same emoji rule as features: a Fluent emoji
   * filename from /public/emoji, or a raw emoji character as fallback. */
  useCases: {
    eyebrow: string;
    heading: string;
    items: Array<{ emoji: string; title: string; body: string }>;
  };

  /* ---- Integrations strip (the "integrations" section) -------------------
   * Channels come from `channels` above automatically; `tools` lists what
   * else the product plugs into. Keep every entry TRUE for your offer. */
  integrations: {
    eyebrow: string;
    heading: string;
    sub: string;
    tools: string[];
  };

  /* ---- Testimonials (SHIP EMPTY — add only your OWN, with permission) ----
   * Leave the array empty and the whole section hides itself. */
  testimonials: {
    eyebrow: string;
    heading: string;
    items: Array<{
      quote: string;
      name: string;
      title: string;
      avatar?: string; // path under /public, optional
    }>;
  };

  /* ---- Pricing ----------------------------------------------------------- */
  pricing: {
    eyebrow: string;
    heading: string;
    subheading: string;
    note: string;
    tiers: Array<{
      name: string;
      price: string; // e.g. "$97" or "Custom"
      cadence: string; // e.g. "/mo"
      blurb: string;
      features: string[];
      cta: { label: string; href: string };
      featured?: boolean;
    }>;
  };

  /* ---- FAQ --------------------------------------------------------------- */
  faq: {
    heading: string;
    items: Array<[string, string]>;
  };

  /* ---- Final CTA --------------------------------------------------------- */
  finalCta: {
    headline: string;
    subhead: string;
    ctaLabel: string;
    ctaHref: string;
    trustLine: string[];
  };

  /* ---- Footer ------------------------------------------------------------ */
  footer: {
    tagline: string;
    columns: Array<{
      title: string;
      links: Array<{ href: string; label: string }>;
    }>;
    social: Array<{ label: string; href: string }>;
    copyright: string;
  };
}

export type ChannelKey =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "imessage"
  | "telegram"
  | "webchat"
  | "sms";
export type Cell = true | false | "partial";

/* =============================================================================
 *  YOUR CONFIG  —  edit everything below this line
 * ========================================================================== */
const frBrand: BrandConfig = {
  /* Le look : "original" | "nebula" | "bloom" | "ember" | "tidal" | "mono" */
  theme: "original",

  /* La mise en page d'accueil :
   * "classic" | "story" | "split" | "demo" | "vsl" | "compact" */
  homeLayout: "classic",

  /* ---- Identité (commune aux deux langues) ---- */
  brandName: "YourBrand",
  tagline:
    "L'agent commercial IA qui répond, qualifie et prend les rendez-vous dans vos messages privés.",
  domain: "yourbrand.com",
  siteUrl: "https://yourbrand.com",
  appUrl: "https://app.yourbrand.com",
  supportEmail: "hello@yourbrand.com",
  helpUrl: "https://help.yourbrand.com",
  whatsAppLink: "https://wa.me/10000000000?text=Bonjour",

  /* ---- Mentions légales — À REMPLACER, puis à faire relire par un juriste ---- */
  legalEntity: "[Votre société SAS / SARL]",
  legalJurisdiction: "[votre pays]",
  legalEffectiveDate: "1er janvier 2026",

  infrastructure: {
    hostingRegion: "l'Union européenne",
    hostingSummary:
      "Le service et vos données sont hébergés sur des serveurs dédiés sécurisés et une infrastructure cloud situés dans l'Union européenne (Allemagne, et la région européenne de notre fournisseur cloud). Les données sont chiffrées en transit via TLS, et les identifiants sensibles ainsi que les jetons d'intégration sont chiffrés au repos.",
    subProcessors: [
      {
        name: "Fournisseurs d'IA (par ex. Anthropic, OpenAI, Google)",
        purpose:
          "Génération des réponses IA et compréhension des images, messages vocaux et vidéos",
        location: "UE / États-Unis",
      },
      {
        name: "Fournisseurs de messagerie (par ex. Twilio, Meta Platforms)",
        purpose:
          "Envoi et réception des messages sur les canaux que vous connectez (WhatsApp, SMS, Instagram, Messenger)",
        location: "UE / États-Unis",
      },
      {
        name: "Hébergement cloud et serveurs (par ex. Hetzner, Google Cloud — régions UE)",
        purpose:
          "Hébergement de l'application, bases de données et sauvegardes chiffrées",
        location: "Union européenne",
      },
      {
        name: "Prestataire de paiement (par ex. Stripe)",
        purpose: "Facturation des abonnements et prévention de la fraude",
        location: "UE / États-Unis",
      },
      {
        name: "Outils d'e-mail et d'analyse",
        purpose:
          "E-mails transactionnels et marketing, et analyse de l'usage du produit",
        location: "UE / États-Unis",
      },
    ],
    transfersNote:
      "Notre infrastructure est principalement située dans l'Union européenne. Lorsqu'un sous-traitant (fournisseur d'IA, de messagerie ou de paiement) traite des données hors de l'UE, nous nous appuyons sur les clauses contractuelles types de la Commission européenne ou sur un autre mécanisme de transfert licite.",
    retention: {
      conversations:
        "Les contacts et le contenu des conversations sont conservés pendant toute la durée de vie de votre compte et supprimés des systèmes actifs dans les 90 jours suivant sa clôture, sauf si une durée plus longue est requise par la loi.",
      backups:
        "Les sauvegardes chiffrées sont conservées de manière glissante pendant 30 jours maximum.",
      logs: "Les journaux serveur et les événements de sécurité sont conservés pendant 90 jours maximum.",
    },
  },

  /* ---- Assets (chemins sous /public, communs aux deux langues) ---- */
  logo: "/brand/logo.svg",
  logoAlt: "YourBrand",
  favicon: "/brand/favicon.svg",
  ogImage: "/brand/og.svg",

  /* Vert de marque Shake, relevé sur shakeagency.io (teinte 167°).
   * c500/c600 = dégradé des boutons ; c700 = couleur de texte (62 usages),
   * assombrie pour rester lisible sur le fond clair du thème (5,1:1). */
  colors: {
    c50: "#edfcf9",
    c100: "#caf6ed",
    c500: "#00D5A7",
    c600: "#00AD88",
    c700: "#007A60",
    c900: "#063229",
  },

  nav: {
    links: [
      { href: "/#features", label: "Fonctionnalités" },
      { href: "/#how-it-works", label: "Comment ça marche" },
      { href: "/#pricing", label: "Tarifs" },
      { href: "/#faq", label: "FAQ" },
      // Votre manuel (rebrander, changer de thème, déployer). Retirez cette
      // ligne avant la mise en ligne pour ne plus l'afficher dans le menu.
      { href: "/guide/", label: "Guide" },
    ],
    // Menu « Design » avec aperçu de chaque look. À passer à false pour le lancement.
    themePicker: true,
    ctaLabel: "Essai gratuit",
    ctaHref: "/pricing/",
    loginLabel: "Connexion",
    loginHref: "https://app.yourbrand.com",
  },

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

  footer: {
    tagline:
      "L'agent commercial IA qui prend les rendez-vous et conclut les ventes sur WhatsApp, Instagram, Messenger, le chat de votre site et par SMS.",
    columns: [
      {
        title: "Produit",
        links: [
          { href: "/#features", label: "Fonctionnalités" },
          { href: "/#how-it-works", label: "Comment ça marche" },
          { href: "/#pricing", label: "Tarifs" },
          { href: "/#faq", label: "FAQ" },
        ],
      },
      {
        title: "Société",
        links: [{ href: "/contact/", label: "Contact" }],
      },
      {
        title: "Légal",
        links: [
          { href: "/terms/", label: "Conditions générales" },
          { href: "/privacy-policy/", label: "Politique de confidentialité" },
        ],
      },
    ],
    social: [
      { label: "Twitter", href: "#" },
      { label: "Instagram", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
    copyright: "© 2026 YourBrand. Tous droits réservés.",
  },
};

/* =============================================================================
 *  Résolution de la langue
 * =============================================================================
 *  Chaque langue est pré-rendue dans sa propre page HTML, donc une seule langue
 *  est active par rendu : le français à la racine, l'anglais sous /en.
 *  `setActiveLang` est appelé par src/Layout.tsx AVANT que ses enfants ne se
 *  rendent (React rend toujours le parent en premier), et la valeur ne change
 *  plus ensuite pour cette page. Le proxy ci-dessous permet donc à tous les
 *  `brand.x` du code de rester inchangés tout en renvoyant la bonne langue.
 * ========================================================================== */

export type Lang = "fr" | "en";

let activeLang: Lang = "fr";

export function setActiveLang(lang: Lang): void {
  activeLang = lang;
}

export function getActiveLang(): Lang {
  return activeLang;
}

/**
 * Préfixe un lien interne par /en en anglais, et garantit la barre oblique
 * finale. Le build produit des dossiers (`dirStyle: "nested"`, voir
 * vite.config.ts) : "/pricing/" sans barre finale fait retomber la plupart des
 * serveurs sur la coquille de l'accueil. Ancres et liens externes inchangés.
 */
export function lhref(href: string): string {
  if (!href.startsWith("/")) return href;
  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const prefixed =
    activeLang === "en" ? "/en" + (path === "/" ? "/" : path) : path;
  const withSlash = prefixed.endsWith("/") ? prefixed : prefixed + "/";
  return hash ? withSlash + "#" + hash : withSlash;
}

/** Le chemin équivalent dans l'autre langue (pour le sélecteur et les alternates). */
export function swapLangPath(pathname: string, to: Lang): string {
  const bare = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  const target = to === "fr" ? bare : bare === "/" ? "/en/" : "/en" + bare;
  return target.endsWith("/") ? target : target + "/";
}

export const brand: BrandConfig = new Proxy(frBrand, {
  get(target, prop: string) {
    if (activeLang === "en" && prop in enContent) {
      return (enContent as Record<string, unknown>)[prop];
    }
    return (target as unknown as Record<string, unknown>)[prop];
  },
}) as BrandConfig;

export default brand;
