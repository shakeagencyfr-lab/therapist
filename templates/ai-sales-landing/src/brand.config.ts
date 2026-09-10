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
import {
  products,
  productPath,
  DEFAULT_PRODUCT,
  type ProductKey,
} from "./products";
import type { SiteContent, ProductContent } from "./content/types";
import { siteFr } from "./content/site.fr";
import { siteEn } from "./content/site.en";
import { iaFr } from "./content/ia.fr";
import { iaEn } from "./content/ia.en";
import { rdvFr } from "./content/rdv.fr";
import { rdvEn } from "./content/rdv.en";
import { webFr } from "./content/web.fr";
import { webEn } from "./content/web.en";


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
/* =============================================================================
 *  Identité commune — ce qui ne change ni avec la langue ni avec l'offre
 * ========================================================================== */
const base = {
  theme: "original",

  /* La mise en page d'accueil :
   * "classic" | "story" | "split" | "demo" | "vsl" | "compact" */
  brandName: "YourBrand",
  domain: "yourbrand.com",
  siteUrl: "https://yourbrand.com",
  appUrl: "https://app.yourbrand.com",
  supportEmail: "hello@yourbrand.com",
  helpUrl: "https://help.yourbrand.com",
  whatsAppLink: "https://wa.me/10000000000?text=Bonjour",

  /* ---- Mentions légales — À REMPLACER, puis à faire relire par un juriste ---- */
  legalEntity: "[Votre société SAS / SARL]",
  logo: "/brand/logo.svg",
  favicon: "/brand/favicon.svg",
  ogImage: "/brand/og.svg",

  /* Vert de marque Shake, relevé sur shakeagency.io (teinte 167°).
   * c500/c600 = dégradé des boutons ; c700 = couleur de texte (62 usages),
   * assombrie pour rester lisible sur le fond clair du thème (5,1:1). */
} satisfies Partial<BrandConfig>;

/* =============================================================================
 *  Résolution : langue × offre
 * =============================================================================
 *  Chaque page pré-rendue sert UNE langue et UNE offre. Layout.tsx fixe les
 *  deux avant que ses enfants ne se rendent (React rend toujours le parent en
 *  premier), et elles ne changent plus pour cette page. Le proxy ci-dessous
 *  permet donc aux quelque 250 `brand.x` du code de rester inchangés.
 *
 *  Ordre de résolution :  contenu de l'offre → contenu du site → identité
 *  commune, plus `colors` et `homeLayout` pris sur l'offre active.
 * ========================================================================== */

export type Lang = "fr" | "en";

const SITE: Record<Lang, SiteContent> = { fr: siteFr, en: siteEn };

const PRODUITS: Record<ProductKey, Record<Lang, ProductContent>> = {
  ia: { fr: iaFr, en: iaEn },
  rdv: { fr: rdvFr, en: rdvEn },
  web: { fr: webFr, en: webEn },
};

let activeLang: Lang = "fr";
let activeProduct: ProductKey = DEFAULT_PRODUCT;

export function setActiveLang(lang: Lang): void {
  activeLang = lang;
}

export function getActiveLang(): Lang {
  return activeLang;
}

export function setActiveProduct(key: ProductKey): void {
  activeProduct = key;
}

export function getActiveProduct(): ProductKey {
  return activeProduct;
}

/**
 * Préfixe un lien interne par /en en anglais, et garantit la barre oblique
 * finale. Le build produit des dossiers (`dirStyle: "nested"`, voir
 * vite.config.ts) : "/pricing" sans barre finale fait retomber la plupart des
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

/** Le chemin d'une offre, dans la langue active. */
export function productHref(key: ProductKey): string {
  return lhref(productPath(key));
}

export const brand: BrandConfig = new Proxy({} as BrandConfig, {
  get(_t, prop: string) {
    const produit = products[activeProduct];
    if (prop === "colors") return produit.colors;
    if (prop === "homeLayout") return produit.homeLayout;

    const contenuOffre = PRODUITS[activeProduct][activeLang] as Record<string, unknown>;
    if (prop in contenuOffre) return contenuOffre[prop];

    const contenuSite = SITE[activeLang] as Record<string, unknown>;
    if (prop in contenuSite) return contenuSite[prop];

    return (base as Record<string, unknown>)[prop];
  },
}) as BrandConfig;

export default brand;
