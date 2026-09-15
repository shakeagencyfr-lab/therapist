/* RDV Pro — landing copy, ENGLISH.
 * Translated from rdv.fr.ts, itself written from the RDV Pro page of
 * shakeagency.io. Prices and figures are the ones published there.
 */
import type { ProductContent } from "./types";

export const rdvEn: ProductContent = {
  tagline:
    "Online appointment booking, installed and configured by our team within 48 hours.",

  channels: [
    { key: "webchat", label: "Booking site" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "sms", label: "SMS", soon: true },
  ],

  hero: {
    badge: "Live in 48h · €29 excl. VAT/month · setup included",
    titleA: "A calendar that",
    titleHighlight: "fills itself.",
    titleB: "",
    subhead:
      "Your customers book on their own, day and night. Confirmations, reminders and deposits included. We install and configure everything within 48 hours — you never open a settings panel.",
    primaryCta: { label: "Talk to an expert", href: "/en/contact/" },
    secondaryCta: { label: "See what's included", href: "/en/#features" },
    videoId: null,
    kpis: [
      { value: "48h", label: "installed and configured by us" },
      { value: "24/7", label: "customers book on their own", highlight: true },
      { value: "Unlimited", label: "staff, services and customers" },
      { value: "€29", label: "excl. VAT per month" },
    ],
  },

  problem: {
    eyebrow: "What this fixes",
    heading: "Every missed call is a lost customer.",
    sub: "One empty slot costs more than a month's subscription.",
    items: [
      {
        emoji: "telephone.png",
        title: "“I pick up the phone mid-appointment.”",
        body: "One customer on the line, one in front of you. You lose a bit of both.",
      },
      {
        emoji: "hourglass-not-done.png",
        title: "“The customer doesn't show up.”",
        body: "No reminder, no deposit, no consequence. An empty slot in the middle of the day.",
      },
      {
        emoji: "compass.png",
        title: "“Nobody knows who's doing what.”",
        body: "Two practitioners, three calendars, one paper sheet. Double bookings always happen eventually.",
      },
    ],
  },

  features: {
    eyebrow: "What we deliver",
    heading: "Everything unlimited. Everything set up for you.",
    items: [
      {
        emoji: "calendar.png",
        title: "Customers book without you",
        body: "A link, a QR code on your counter, a button on your site and your social profiles. They pick their slot whenever it suits them, 24/7.",
      },
      {
        emoji: "handshake.png",
        title: "Your whole team in sync",
        body: "Each practitioner has their own hours, services and personal calendar. Google Calendar and Outlook stay up to date automatically. No more double bookings.",
      },
      {
        emoji: "money-with-wings.png",
        title: "Paid at the moment of booking",
        body: "Full payment, deposit or gift card: the customer commits as they book. No-shows become rare.",
      },
      {
        emoji: "alarm-clock.png",
        title: "The reminders you no longer send",
        body: "Instant confirmation, reminder the day before, follow-up message after the appointment, win-back for customers who stopped coming. No volume limit.",
      },
      {
        emoji: "globe.png",
        title: "Your booking site, included",
        body: "Your services, prices, team, photos and reviews, in your colours and under your name. Indexable by Google, so you can take bookings before you even have a website.",
      },
      {
        emoji: "desktop-computer.png",
        title: "The team's day, in their pocket",
        body: "Everyone sees their appointments, customers and takings. Block an hour, move a customer, add a service on the spot: two taps.",
      },
      {
        emoji: "sparkles.png",
        title: "Gift cards, packages, memberships",
        body: "Sell ten sessions at once, a monthly membership or a gift card bought online: the balance counts down on its own, with no ledger to keep.",
      },
      {
        emoji: "balance-scale.png",
        title: "Your cancellation rules, enforced",
        body: "Minimum notice, one reschedule allowed, deposit non-refundable beyond that: the customer moves their own appointment, within the limits you set.",
      },
    ],
  },

  howItWorks: {
    eyebrow: "Live within 48 hours",
    heading: "You never open a settings panel.",
    steps: [
      {
        title: "You tell us how you work",
        body: "Your services and their real durations, your team, your hours, your closing days, your cancellation rules.",
      },
      {
        title: "Our team builds the calendar",
        body: "Services, preparation buffers, payments, reminders, calendar sync and a booking site in your colours. Within 48 hours, with nothing to do on your side.",
      },
      {
        title: "The bookings come in",
        body: "A link, a QR code, a button on your Google listing and on your website. You receive appointments, confirmed and paid.",
      },
    ],
  },

  useCases: {
    eyebrow: "Who it's for",
    heading: "Built for businesses that run on appointments.",
    items: [
      {
        emoji: "lotion-bottle.png",
        title: "Beauty salons and spas",
        body: "Services with real durations, deposit taken at booking, gift cards and session packages.",
      },
      {
        emoji: "artist-palette.png",
        title: "Hairdressers and barbers",
        body: "One calendar per stylist, every service with its duration and price, deposit taken the moment they book.",
      },
      {
        emoji: "tooth.png",
        title: "Dentists and health practitioners",
        body: "Questions asked before the session, automatic reminders, cancellation rules enforced on your behalf.",
      },
      {
        emoji: "brain.png",
        title: "Therapists and practitioners",
        body: "In-person or remote: the Google Meet or Zoom link is created and sent automatically.",
      },
      {
        emoji: "graduation-cap.png",
        title: "Coaches and trainers",
        body: "Group classes with capacity, session packages that count down, a schedule published online.",
      },
      {
        emoji: "gear.png",
        title: "Garages and trades",
        body: "Service address asked at booking, travel time reserved before and after, multiple locations handled.",
      },
    ],
  },

  comparison: {
    eyebrow: "Compare before you choose",
    heading: "Is Shake One enough? Here's the difference.",
    youLabel: "RDV Pro",
    themLabel: "Shake One",
    rows: [
      ["Multi-practitioner and multi-site calendars", true, false],
      ["Unlimited staff, synced calendars", true, false],
      ["Deposits, balances, packages and gift cards", true, "partial"],
      ["WhatsApp reminders and post-session win-back", true, "partial"],
      ["Cancellation rules and slot re-offered", true, "partial"],
      ["Team web app, one account per employee", true, "partial"],
      ["Personalised mini booking site", true, false],
      ["“Book” button on your Google listing", true, false],
      ["Installed and configured within 48h by us", true, false],
    ],
  },

  integrations: {
    eyebrow: "What it plugs into",
    heading: "Your calendar stays the single source of truth.",
    sub: "What you block in your calendar becomes unavailable online, and every booking appears there immediately. Time zones are handled automatically.",
    tools: [
      "Google Calendar",
      "Outlook",
      "Reserve with Google",
      "Google Meet",
      "Zoom",
      "Secure online payments",
    ],
  },

  guarantee: {
    eyebrow: "What the subscription covers",
    heading: "One recovered appointment a month pays for it.",
    points: [
      {
        emoji: "rocket.png",
        title: "Setup and training included",
        body: "We install, configure and train your team. Setup is billed once, €150 excl. VAT.",
      },
      {
        emoji: "handshake.png",
        title: "Human support on WhatsApp",
        body: "A real person at the other end, at no extra cost and with no queue.",
      },
      {
        emoji: "key.png",
        title: "Everything is unlimited",
        body: "Staff, services, customers, bookings and email reminders. No hidden tier as your business grows.",
      },
      {
        emoji: "money-with-wings.png",
        title: "Two months free on annual billing",
        body: "€290 excl. VAT per year instead of twelve monthly payments. You choose when you sign up.",
      },
    ],
  },

  pricing: {
    eyebrow: "Price",
    heading: "€29 excl. VAT per month, all in.",
    subheading:
      "One subscription, no tiers and no hidden add-ons. Two months free if you pay annually.",
    note: "Plus €150 excl. VAT for setup and configuration, billed once. Prices exclude VAT.",
    tiers: [
      {
        name: "RDV Pro",
        price: "€29",
        cadence: "excl. VAT/mo",
        blurb:
          "Or €290 excl. VAT per year, two months free. Setup and configuration by our team.",
        features: [
          "Unlimited staff, services and customers",
          "24/7 online booking and secure payment",
          "Automatic email reminders, SMS optional",
          "Gift cards, packages and memberships",
          "Google Calendar, Google Meet and Zoom",
          "Mini booking site in your colours",
          "“Book” button on your Google listing",
          "Setup, configuration and training by our team",
          "Human support on WhatsApp, at no extra cost",
        ],
        cta: { label: "Book my call", href: "/en/contact/" },
        featured: true,
      },
    ],
  },

  faq: {
    heading: "Questions, answered.",
    items: [
      [
        "How long until we're up and running?",
        "48 hours. Our team installs and configures the calendar around the way you work: services, durations, team, payments, reminders and cancellation rules. You never open a settings panel.",
      ],
      [
        "Do we need a website already?",
        "No. RDV Pro generates your own booking site, in your colours and under your name, with your services, photos, team and prices. It is indexable by Google, so you can take appointments before you even have a website.",
      ],
      [
        "How do we cut down on no-shows?",
        "By taking payment before the visit: full payment, deposit or gift card, chosen per service. On top of that: instant confirmation, a reminder the day before, a reminder the same morning, and a waiting list that re-offers the slot when someone cancels.",
      ],
      [
        "What if several practitioners share the diary?",
        "Each one has their own services, hours, days off and personal calendar, synced with Google Calendar or Outlook. Staff, locations and services are unlimited, and double bookings become impossible.",
      ],
      [
        "Are remote consultations handled?",
        "Yes. The Google Meet or Zoom link is generated as the booking is made, sent to both parties in the confirmation, then repeated in the reminder.",
      ],
      [
        "How is this different from the calendar in Shake One?",
        "The Shake One module suits a simple diary: one employee, simple slots, one email reminder. RDV Pro runs a practice, a salon or a whole team: multi-practitioner, multi-site, deposits and packages, a team web app, a mini booking site and a button on your Google listing. If you're unsure, start with Shake One and move up later — your content and your customers come with you.",
      ],
    ],
  },

  conversation: {
    eyebrow: "",
    heading: "",
    sub: "",
    bullets: [],
  },
  trust: {
    eyebrow: "",
    heading: "",
    items: [],
  },
  testimonials: {
    eyebrow: "Trusted by",
    heading: "Businesses like yours, already running on it.",
    items: [],
  },

  finalCta: {
    headline: "Put the phone down. They book online.",
    subhead:
      "Calendar installed and configured within 48 hours by our team. €29 excl. VAT per month, all in.",
    ctaLabel: "Book my discovery call",
    ctaHref: "/en/contact/",
    trustLine: ["Live within 48h", "Everything unlimited", "Human support on WhatsApp"],
  },
};

export default rdvEn;
