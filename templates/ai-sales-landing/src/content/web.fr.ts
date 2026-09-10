/* Web Pro — contenu de la landing, version FRANÇAISE.
 * Servie sur /web-pro/. Accent violet, voir src/products.ts.
 *
 * CANEVAS À REMPLIR : seule l'accroche reprend la description publiée sur
 * shakeagency.io ; le reste attend vos informations.
 */
import type { ProductContent } from "./types";

export const webFr: ProductContent = {
  tagline: "Site web professionnel sur mesure, hébergement, CRM, support dédié et intégrations e-commerce et paiement.",

  channels: [
    { key: "webchat", label: "Chat du site" },
    { key: "whatsapp", label: "WhatsApp" },
  ],

  hero: {
    badge: null,
    titleA: "Web Pro",
    titleHighlight: "[à compléter]",
    titleB: "",
    subhead: "Site web professionnel sur mesure, hébergement, CRM, support dédié et intégrations e-commerce et paiement.",
    primaryCta: { label: "Demander un devis", href: "/contact/" },
    secondaryCta: { label: "Voir les tarifs", href: "/pricing/" },
    videoId: null,
    kpis: [
      { value: "[à compléter]", label: "[à compléter]" },
      { value: "[à compléter]", label: "[à compléter]", highlight: true },
      { value: "[à compléter]", label: "[à compléter]" },
      { value: "[à compléter]", label: "[à compléter]" },
    ],
  },

  /* Sections que la mise en page "compact" n'affiche pas. Remplies pour
     satisfaire le type ; à écrire si vous changez de mise en page. */
  comparison: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    youLabel: "Web Pro",
    themLabel: "[à compléter]",
    rows: [["[à compléter]", true, false]],
  },
  howItWorks: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    steps: [
      { title: "[à compléter]", body: "[à compléter]" },
      { title: "[à compléter]", body: "[à compléter]" },
      { title: "[à compléter]", body: "[à compléter]" },
    ],
  },
  problem: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    sub: "[à compléter]",
    items: [
      {
        emoji: "hourglass-not-done.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "money-with-wings.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "snowflake.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
    ],
  },
  conversation: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    sub: "[à compléter]",
    bullets: ["[à compléter]", "[à compléter]", "[à compléter]"],
  },
  trust: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    items: [
      {
        emoji: "rocket.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "alarm-clock.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "handshake.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "key.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
    ],
  },
  useCases: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    items: [
      {
        emoji: "sparkles.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "calendar.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "gear.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "chart-increasing.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "handshake.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "shield.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
    ],
  },

  /* Sections affichées par la mise en page "compact" */
  features: {
    eyebrow: "Ce que comprend l'offre",
    heading: "[à compléter]",
    items: [
      {
        emoji: "sparkles.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "calendar.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "gear.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "chart-increasing.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "handshake.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "shield.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
    ],
  },

  integrations: {
    eyebrow: "Ce à quoi ça se branche",
    heading: "[à compléter]",
    sub: "[à compléter]",
    tools: [
      "CRM",
      "Paiement en ligne",
      "E-commerce",
      "Hébergement",
    ],
  },

  guarantee: {
    eyebrow: "[à compléter]",
    heading: "[à compléter]",
    points: [
      {
        emoji: "rocket.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "alarm-clock.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "handshake.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
      {
        emoji: "key.png",
        title: "[à compléter]",
        body: "[à compléter]",
      },
    ],
  },

  testimonials: {
    eyebrow: "Ils nous font confiance",
    heading: "Ce que disent nos clients.",
    items: [],
  },

  pricing: {
    eyebrow: "Tarifs",
    heading: "[à compléter]",
    subheading: "[à compléter]",
    note: "[à compléter]",
    tiers: [
      {
        name: "Web Pro",
        price: "[à compléter]",
        cadence: "/mois",
        blurb: "[à compléter]",
        features: ["[à compléter]", "[à compléter]", "[à compléter]"],
        cta: { label: "Demander un devis", href: "/contact/" },
        featured: true,
      },
    ],
  },

  faq: {
    heading: "Vos questions, nos réponses.",
    items: [
      ["[à compléter]", "[à compléter]"],
      ["[à compléter]", "[à compléter]"],
      ["[à compléter]", "[à compléter]"],
      ["[à compléter]", "[à compléter]"],
    ],
  },

  finalCta: {
    headline: "[à compléter]",
    subhead: "[à compléter]",
    ctaLabel: "Demander un devis",
    ctaHref: "/contact/",
    trustLine: ["[à compléter]", "[à compléter]", "[à compléter]"],
  },
};

export default webFr;
