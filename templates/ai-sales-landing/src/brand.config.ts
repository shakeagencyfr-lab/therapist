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
export const brand: BrandConfig = {
  /* Pick your look:
   * "original" | "nebula" | "bloom" | "ember" | "tidal" | "mono" */
  theme: "original",

  /* Pick your home-page layout: "classic" | "split" | "vsl" */
  homeLayout: "classic",

  brandName: "YourBrand",
  tagline: "The AI sales agent that books calls and closes deals in your DMs.",
  domain: "yourbrand.com",
  siteUrl: "https://yourbrand.com",
  appUrl: "https://app.yourbrand.com",
  supportEmail: "hello@yourbrand.com",
  helpUrl: "https://help.yourbrand.com",
  whatsAppLink: "https://wa.me/10000000000?text=Hi",

  legalEntity: "[Your Company Name Ltd / B.V.]",
  legalJurisdiction: "[your country]",
  legalEffectiveDate: "1 January 2026",

  infrastructure: {
    hostingRegion: "the European Union",
    hostingSummary:
      "The service and your data are hosted on secure dedicated servers and cloud infrastructure located in the European Union (Germany, and the EU region of our cloud provider). Data is encrypted in transit using TLS, and sensitive credentials and integration tokens are encrypted at rest.",
    // Sub-processors that may handle personal data to deliver the service. Channel
    // providers only apply to the channels you actually enable.
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

  logo: "/brand/logo.svg",
  logoAlt: "YourBrand",
  favicon: "/brand/favicon.svg",
  ogImage: "/brand/og.svg",

  /* null = the theme's own colours (recommended while previewing variants).
   * Replace with your six brand-colour stops to reskin any theme, e.g.
   * { c50: "#ecfdf5", c100: "#d1fae5", c500: "#25D366",
   *   c600: "#1ab854", c700: "#147a3a", c900: "#082f17" } */
  colors: null,

  nav: {
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
      // Your owner's manual (how to rebrand, theme, deploy). Remove this line
      // before going live if you'd rather keep the guide unlisted.
      { href: "/guide", label: "Guide" },
    ],
    // "Themes" menu with live previews of every look. Set false for launch.
    themePicker: true,
    ctaLabel: "Start free",
    ctaHref: "/pricing",
    loginLabel: "Log in",
    loginHref: "https://app.yourbrand.com",
  },

  channels: [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "instagram", label: "Instagram" },
    { key: "messenger", label: "Messenger" },
    { key: "webchat", label: "Web Chat" },
    { key: "sms", label: "SMS" },
    { key: "imessage", label: "iMessage", soon: true },
    { key: "telegram", label: "Telegram", soon: true },
  ],

  hero: {
    badge: "Replies in seconds. Books the call. Closes the deal.",
    titleA: "Your AI sales agent that",
    titleHighlight: "closes deals",
    titleB: "in the DMs.",
    subhead:
      "YourBrand answers every message in seconds, qualifies the lead, handles objections, books the call and follows up — on WhatsApp, Instagram, Messenger, web chat and SMS. Around the clock, in your brand's voice.",
    primaryCta: { label: "Start your free trial", href: "/pricing" },
    secondaryCta: { label: "See it in action", href: "/#how-it-works" },
    // Your VSL's YouTube ID — only shown by the "vsl" layout.
    videoId: null,
    kpis: [
      { value: "24/7", label: "never miss a DM again" },
      { value: "<30s", label: "average reply time", highlight: true },
      { value: "5", label: "channels, one inbox" },
      { value: "15 min", label: "to go live" },
    ],
  },

  comparison: {
    eyebrow: "Why it's different",
    heading: "An AI sales agent, not a chatbot.",
    youLabel: "YourBrand",
    themLabel: "Regular chatbot",
    rows: [
      ["Closes deals in chat", true, false],
      ["Handles objections", true, false],
      ["Books appointments inside the conversation", true, false],
      ["Understands images, voice notes and video", true, false],
      ["Remembers past conversations", true, false],
      ["Gets smarter automatically", true, false],
      ["Replies in your brand voice", true, "partial"],
      ["Every channel in one inbox", true, false],
    ],
  },

  howItWorks: {
    eyebrow: "Live in 15 minutes",
    heading: "Three steps to a 24/7 salesperson.",
    steps: [
      {
        title: "Connect your channels",
        body: "Link WhatsApp, Instagram, Messenger, your website chat and SMS. Every conversation lands in one inbox.",
      },
      {
        title: "Train it on your business",
        body: "Paste your website or upload your FAQs. The AI learns your offer, pricing and tone in minutes — no scripting.",
      },
      {
        title: "It starts selling",
        body: "It replies in seconds, qualifies every lead, answers questions, books the call and follows up so nothing slips.",
      },
    ],
  },

  features: {
    eyebrow: "What it does",
    heading: "Everything a great salesperson does. Instantly.",
    items: [
      {
        emoji: "speech-balloon.png",
        title: "It sells",
        body: "Qualifies, handles objections and moves the conversation toward a booking or a sale — not just canned FAQ answers.",
      },
      {
        emoji: "calendar.png",
        title: "Books appointments",
        body: "Offers times, confirms and adds the appointment to your calendar, right inside the chat.",
      },
      {
        emoji: "eyes.png",
        title: "Understands everything",
        body: "Reads images, listens to voice notes and watches video, so customers can message however they like.",
      },
      {
        emoji: "brain.png",
        title: "It remembers",
        body: "Recalls every past conversation with a customer, so each reply feels personal and picks up where you left off.",
      },
      {
        emoji: "chart-increasing.png",
        title: "Gets smarter",
        body: "Learns from every conversation and tightens its answers over time — automatically.",
      },
      {
        emoji: "megaphone.png",
        title: "Runs campaigns",
        body: "Reach out, re-engage cold leads and follow up at scale, then hand warm replies straight back to the AI.",
      },
      {
        emoji: "link.png",
        title: "Connects to everything",
        body: "Plugs into your CRM, calendar and tools through webhooks and integrations.",
      },
      {
        emoji: "globe.png",
        title: "Speaks your voice",
        body: "Replies in your tone and in your customer's language, on every channel.",
      },
    ],
  },

  problem: {
    eyebrow: "The problem",
    heading: "Every slow reply is a lost deal.",
    sub: "Your leads are already in their DMs — the only question is whether anyone answers while they still care.",
    items: [
      {
        emoji: "hourglass-not-done.png",
        title: "Minutes decide it",
        body: "A DM answered in seconds keeps the buying mood alive. One answered tomorrow lands in a conversation that has already gone cold.",
      },
      {
        emoji: "money-with-wings.png",
        title: "Missed DMs are missed revenue",
        body: "Every unanswered message is a customer who was ready to talk — and who is probably already messaging your competitor.",
      },
      {
        emoji: "snowflake.png",
        title: "You can't be on 24/7",
        body: "Evenings, weekends and holidays are exactly when people browse and message — and exactly when nobody is there to answer.",
      },
    ],
  },

  conversation: {
    eyebrow: "Watch it work",
    heading: "First message to closed deal — hands off.",
    sub: "This is the shape of a real conversation: qualify the lead, answer the questions, handle the objection, book the slot, confirm. Zero human input.",
    bullets: [
      "Replies in seconds, in your brand's tone",
      "Handles objections and books the appointment in-chat",
      "Hands off to a human the moment you want in",
    ],
  },

  guarantee: {
    eyebrow: "Zero-risk start",
    heading: "Try it without betting the business.",
    points: [
      {
        emoji: "rocket.png",
        title: "Start free",
        body: "Set it up, connect a channel and watch it handle real conversations before you pay anything.",
      },
      {
        emoji: "alarm-clock.png",
        title: "Live in 15 minutes",
        body: "No developers and no scripting — paste your website and the AI learns your offer, pricing and tone.",
      },
      {
        emoji: "handshake.png",
        title: "You stay in control",
        body: "Jump into any conversation, correct the AI or switch it off per chat. It's your inbox — the AI just works it.",
      },
      {
        emoji: "key.png",
        title: "Your data stays yours",
        body: "Export your contacts and conversations whenever you like. No lock-in.",
      },
    ],
  },

  trust: {
    eyebrow: "Security & privacy",
    heading: "Your customers' data, handled properly.",
    items: [
      {
        emoji: "globe.png",
        title: "EU hosting",
        body: "The service and your customer data run on secure servers located in the European Union.",
      },
      {
        emoji: "key.png",
        title: "Encrypted",
        body: "Data is encrypted in transit; credentials and integration tokens are encrypted at rest.",
      },
      {
        emoji: "balance-scale.png",
        title: "GDPR-ready",
        body: "Clear retention rules, EU standard contractual clauses for transfers and a transparent sub-processor list.",
      },
      {
        emoji: "shield.png",
        title: "You're in control",
        body: "Delete or export a contact's data whenever a customer asks — the tooling is built in.",
      },
    ],
  },

  useCases: {
    eyebrow: "Who it's for",
    heading: "Built for businesses that live in the DMs.",
    items: [
      {
        emoji: "lotion-bottle.png",
        title: "Beauty & wellness",
        body: "Salons, spas and studios: answer treatment questions, book the slot and take the deposit — while you're with a client.",
      },
      {
        emoji: "tooth.png",
        title: "Clinics & practices",
        body: "Qualify new patients, answer pricing questions and fill the calendar without the front desk touching a message.",
      },
      {
        emoji: "graduation-cap.png",
        title: "Coaches & consultants",
        body: "Turn 'how does it work?' DMs into booked discovery calls with follow-ups that never let a lead go cold.",
      },
      {
        emoji: "house.png",
        title: "Real estate",
        body: "Respond to every listing enquiry in seconds, qualify the buyer and book the viewing before the competition replies.",
      },
      {
        emoji: "shopping-cart.png",
        title: "E-commerce",
        body: "Answer product questions, recover carts and recommend the right item — in the channels your customers already use.",
      },
      {
        emoji: "briefcase.png",
        title: "Agencies & services",
        body: "Qualify inbound leads, book strategy calls and keep prospects warm across every client conversation.",
      },
    ],
  },

  integrations: {
    eyebrow: "Plays well with others",
    heading: "Every channel in one inbox — plus your tools.",
    sub: "Conversations flow in from every connected channel, and the AI works with the tools you already run your business on.",
    tools: [
      "Google Calendar",
      "Webhooks & API",
      "Your CRM",
      "Payment links",
      "Custom functions",
    ],
  },

  testimonials: {
    eyebrow: "Loved by teams",
    heading: "What customers say.",
    // ⚠️ SHIPS EMPTY ON PURPOSE. Add only testimonials you have permission to
    // use. While this array is empty, the section is hidden automatically.
    items: [],
  },

  pricing: {
    eyebrow: "Pricing",
    heading: "Simple pricing that scales with you.",
    subheading:
      "Start free. Upgrade when the AI is closing more than it costs.",
    note: "All plans include every channel and a 14-day free trial. Cancel anytime.",
    tiers: [
      {
        name: "Starter",
        price: "$27",
        cadence: "/mo",
        blurb: "For solo founders and small teams getting started.",
        features: [
          "1 channel",
          "AI replies 24/7",
          "Lead capture & tagging",
          "Email support",
        ],
        cta: { label: "Start free", href: "/pricing" },
      },
      {
        name: "Growth",
        price: "$97",
        cadence: "/mo",
        blurb: "For growing businesses across multiple channels.",
        features: [
          "All channels",
          "Appointment booking",
          "Campaigns & follow-ups",
          "Integrations",
          "Priority support",
        ],
        cta: { label: "Start free", href: "/pricing" },
        featured: true,
      },
      {
        name: "Pro",
        price: "$297",
        cadence: "/mo",
        blurb: "For teams that want power and bring-your-own-AI-key.",
        features: [
          "Everything in Growth",
          "Higher usage limits",
          "Bring your own AI key",
          "Advanced automations",
          "Dedicated support",
        ],
        cta: { label: "Talk to us", href: "/contact" },
      },
    ],
  },

  faq: {
    heading: "Questions, answered.",
    items: [
      [
        "Which channels does it cover?",
        "WhatsApp (Business API and WhatsApp Web), Instagram DMs, Facebook Messenger, website chat and SMS — all in one inbox. iMessage and Telegram are coming soon.",
      ],
      [
        "How long does it take to set up?",
        "About 15 minutes. Connect your channels, paste your website or FAQs, and the AI is ready to start replying.",
      ],
      [
        "Will it sound like a robot?",
        "No. It replies in your brand voice, in your customer's language, and you can set its tone. Most customers can't tell.",
      ],
      [
        "What happens when it can't answer something?",
        "It hands the conversation to you with full context, so nothing falls through the cracks.",
      ],
      [
        "Does it work in my language?",
        "Yes. It understands and replies in dozens of languages automatically, matching whatever your customer writes in.",
      ],
      [
        "Is my data safe?",
        "Your conversations are yours. See our Privacy Policy for how data is stored and processed.",
      ],
    ],
  },

  finalCta: {
    headline: "Stop losing deals in your DMs.",
    subhead:
      "Turn on your AI sales agent and let it qualify, book and close — 24/7, on every channel, in 15 minutes.",
    ctaLabel: "Start your free trial",
    ctaHref: "/pricing",
    trustLine: ["14-day free trial", "No card required", "Set up in 15 min"],
  },

  footer: {
    tagline:
      "The AI sales agent that books calls and closes deals on WhatsApp, Instagram, Messenger, web chat and SMS.",
    columns: [
      {
        title: "Product",
        links: [
          { href: "/#features", label: "Features" },
          { href: "/#how-it-works", label: "How it works" },
          { href: "/#pricing", label: "Pricing" },
          { href: "/#faq", label: "FAQ" },
        ],
      },
      {
        title: "Company",
        links: [{ href: "/contact", label: "Contact" }],
      },
      {
        title: "Legal",
        links: [
          { href: "/terms", label: "Terms" },
          { href: "/privacy-policy", label: "Privacy Policy" },
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

export default brand;
