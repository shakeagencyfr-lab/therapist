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

    notFoundTitle: "This page wandered off.",
    notFoundBody:
      "The link is broken or the page has moved. The AI answers every message — day and night.",
    notFoundHome: "Back to the home page",
    notFoundContact: "Contact us",
  },
};

export default UI;
