/* Booster RDV Pro — contenu de la landing, version FRANÇAISE.
 * Servie sur /rdv-pro/. Accent ambre, voir src/products.ts.
 *
 * CANEVAS À REMPLIR : tout ce qui porte [à compléter] attend les informations
 * réelles de l'offre. Rien n'a été inventé.
 */
import type { ProductContent } from "./types";

export const rdvFr: ProductContent = {
  tagline: "[à compléter : ce que fait Booster RDV Pro, en une phrase.]",

  channels: [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "sms", label: "SMS" },
    { key: "webchat", label: "Chat du site" },
  ],

  hero: {
    badge: null,
    titleA: "Booster RDV Pro",
    titleHighlight: "[à compléter]",
    titleB: "",
    subhead: "[à compléter : ce que fait Booster RDV Pro, en une phrase.]",
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
    youLabel: "Booster RDV Pro",
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
      "Google Agenda",
      "[à compléter]",
      "[à compléter]",
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
        name: "Booster RDV Pro",
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

export default rdvFr;
