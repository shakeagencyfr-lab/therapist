/* Booster IA Pro — contenu de la landing, version ANGLAISE. */
import type { ProductContent } from "./types";

export const iaEn: ProductContent = {
  tagline: "The AI sales agent that books calls and closes deals in your DMs.",
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
    primaryCta: { label: "Start your free trial", href: "/en/pricing/" },
    secondaryCta: { label: "See it in action", href: "/en/#how-it-works" },
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
        cta: { label: "Start free", href: "/en/pricing/" },
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
        cta: { label: "Start free", href: "/en/pricing/" },
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
        cta: { label: "Talk to us", href: "/en/contact/" },
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
    ctaHref: "/en/pricing/",
    trustLine: ["14-day free trial", "No card required", "Set up in 15 min"],
  },
};

export default iaEn;
