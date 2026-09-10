/* Contenu commun à tout le site — version ANGLAISE.
 * Voir site.fr.ts pour la version française. */
import type { SiteContent } from "./types";

export const siteEn: SiteContent = {
  logoAlt: "YourBrand",
  legalJurisdiction: "[your country]",
  legalEffectiveDate: "1 January 2026",
  infrastructure: {
    hostingRegion: "the European Union",
    hostingSummary:
      "The service and your data are hosted on secure dedicated servers and cloud infrastructure located in the European Union (Germany, and the EU region of our cloud provider). Data is encrypted in transit using TLS, and sensitive credentials and integration tokens are encrypted at rest.",
    subProcessors: [
      {
        name: "AI providers (e.g. Anthropic, OpenAI, Google)",
        purpose:
          "Generating AI replies and understanding images, voice notes and video",
        location: "EU / United States",
      },
      {
        name: "Messaging providers (e.g. Twilio, Meta Platforms)",
        purpose:
          "Sending and receiving messages on the channels you connect (WhatsApp, SMS, Instagram, Messenger)",
        location: "EU / United States",
      },
      {
        name: "Cloud & server hosting (e.g. Hetzner, Google Cloud — EU regions)",
        purpose: "Application hosting, databases and encrypted backups",
        location: "European Union",
      },
      {
        name: "Payment processor (e.g. Stripe)",
        purpose: "Subscription billing and fraud prevention",
        location: "EU / United States",
      },
      {
        name: "Email & analytics tools",
        purpose:
          "Transactional and marketing email, and product-usage analytics",
        location: "EU / United States",
      },
    ],
    transfersNote:
      "Our infrastructure is primarily located in the European Union. Where a sub-processor (such as an AI, messaging or payment provider) processes data outside the EU, we rely on the European Commission's Standard Contractual Clauses or another lawful transfer mechanism.",
    retention: {
      conversations:
        "Contacts and conversation content are retained for the life of your account and deleted from active systems within 90 days of account closure, unless a longer period is required by law.",
      backups:
        "Encrypted backups are retained on a rolling basis for up to 30 days.",
      logs: "Server logs and security events are retained for up to 90 days.",
    },
  },
  nav: {
    links: [
      { href: "/en/#features", label: "Features" },
      { href: "/en/#how-it-works", label: "How it works" },
      { href: "/en/#pricing", label: "Pricing" },
      { href: "/en/#faq", label: "FAQ" },
      { href: "/en/guide/", label: "Guide" },
    ],
    themePicker: true,
    ctaLabel: "Start free",
    ctaHref: "/en/pricing/",
    loginLabel: "Log in",
    loginHref: "https://app.yourbrand.com",
  },
  footer: {
    tagline:
      "The AI sales agent that books calls and closes deals on WhatsApp, Instagram, Messenger, web chat and SMS.",
    columns: [
      {
        title: "Plans",
        links: [
          { href: "/en/", label: "Booster IA Pro" },
          { href: "/en/rdv-pro/", label: "Booster RDV Pro" },
          { href: "/en/web-pro/", label: "Web Pro" },
        ],
      },
      {
        title: "Product",
        links: [
          { href: "/en/#features", label: "Features" },
          { href: "/en/#how-it-works", label: "How it works" },
          { href: "/en/#pricing", label: "Pricing" },
          { href: "/en/#faq", label: "FAQ" },
        ],
      },
      {
        title: "Company",
        links: [{ href: "/en/contact/", label: "Contact" }],
      },
      {
        title: "Legal",
        links: [
          { href: "/en/terms/", label: "Terms" },
          { href: "/en/privacy-policy/", label: "Privacy Policy" },
        ],
      },
    ],
    social: [
      { label: "Twitter", href: "#" },
      { label: "Instagram", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
    copyright: "© 2026 YourBrand. All rights reserved.",
  },
};

export default siteEn;
