/* Web Pro — landing copy, ENGLISH.
 * Placeholder scaffold — voir web.fr.ts. */
import type { ProductContent } from "./types";

export const webEn: ProductContent = {
  tagline: "A bespoke professional website, with hosting, CRM, dedicated support and e-commerce and payment integrations.",

  channels: [
    { key: "webchat", label: "Web chat" },
    { key: "whatsapp", label: "WhatsApp" },
  ],

  hero: {
    badge: null,
    titleA: "Web Pro",
    titleHighlight: "[to fill in]",
    titleB: "",
    subhead: "A bespoke professional website, with hosting, CRM, dedicated support and e-commerce and payment integrations.",
    primaryCta: { label: "Request a quote", href: "/contact/" },
    secondaryCta: { label: "See pricing", href: "/pricing/" },
    videoId: null,
    kpis: [
      { value: "[to fill in]", label: "[to fill in]" },
      { value: "[to fill in]", label: "[to fill in]", highlight: true },
      { value: "[to fill in]", label: "[to fill in]" },
      { value: "[to fill in]", label: "[to fill in]" },
    ],
  },

  /* Sections que la mise en page "compact" n'affiche pas. Remplies pour
     satisfaire le type ; à écrire si vous changez de mise en page. */
  comparison: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    youLabel: "Web Pro",
    themLabel: "[to fill in]",
    rows: [["[to fill in]", true, false]],
  },
  howItWorks: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    steps: [
      { title: "[to fill in]", body: "[to fill in]" },
      { title: "[to fill in]", body: "[to fill in]" },
      { title: "[to fill in]", body: "[to fill in]" },
    ],
  },
  problem: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    sub: "[to fill in]",
    items: [
      {
        emoji: "hourglass-not-done.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "money-with-wings.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "snowflake.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
    ],
  },
  conversation: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    sub: "[to fill in]",
    bullets: ["[to fill in]", "[to fill in]", "[to fill in]"],
  },
  trust: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    items: [
      {
        emoji: "rocket.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "alarm-clock.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "handshake.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "key.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
    ],
  },
  useCases: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    items: [
      {
        emoji: "sparkles.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "calendar.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "gear.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "chart-increasing.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "handshake.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "shield.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
    ],
  },

  /* Sections affichées par la mise en page "compact" */
  features: {
    eyebrow: "What the plan covers",
    heading: "[to fill in]",
    items: [
      {
        emoji: "sparkles.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "calendar.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "gear.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "chart-increasing.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "handshake.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "shield.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
    ],
  },

  integrations: {
    eyebrow: "What it plugs into",
    heading: "[to fill in]",
    sub: "[to fill in]",
    tools: [
      "CRM",
      "Online payments",
      "E-commerce",
      "Hosting",
    ],
  },

  guarantee: {
    eyebrow: "[to fill in]",
    heading: "[to fill in]",
    points: [
      {
        emoji: "rocket.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "alarm-clock.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "handshake.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
      {
        emoji: "key.png",
        title: "[to fill in]",
        body: "[to fill in]",
      },
    ],
  },

  testimonials: {
    eyebrow: "Loved by teams",
    heading: "What customers say.",
    items: [],
  },

  pricing: {
    eyebrow: "Pricing",
    heading: "[to fill in]",
    subheading: "[to fill in]",
    note: "[to fill in]",
    tiers: [
      {
        name: "Web Pro",
        price: "[to fill in]",
        cadence: "/mo",
        blurb: "[to fill in]",
        features: ["[to fill in]", "[to fill in]", "[to fill in]"],
        cta: { label: "Request a quote", href: "/contact/" },
        featured: true,
      },
    ],
  },

  faq: {
    heading: "Questions, answered.",
    items: [
      ["[to fill in]", "[to fill in]"],
      ["[to fill in]", "[to fill in]"],
      ["[to fill in]", "[to fill in]"],
      ["[to fill in]", "[to fill in]"],
    ],
  },

  finalCta: {
    headline: "[to fill in]",
    subhead: "[to fill in]",
    ctaLabel: "Request a quote",
    ctaHref: "/contact/",
    trustLine: ["[to fill in]", "[to fill in]", "[to fill in]"],
  },
};

export default webEn;
