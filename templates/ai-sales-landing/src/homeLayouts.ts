/* =============================================================================
 *  homeLayouts.ts — the six built-in home-page layouts
 * =============================================================================
 *
 *  A layout = which hero treatment to use + which sections appear, in what
 *  order. Pick one in brand.config.ts → homeLayout, or live-preview any with
 *  ?layout=<name> in the URL (the nav's Design menu does this for you).
 *  Layouts combine freely with the six themes in src/themes.ts — 36
 *  combinations out of the box.
 *
 *  The section components themselves live in src/App.tsx (see the
 *  SECTION_COMPONENTS map there). To invent a new layout: add an entry here,
 *  add its key to HomeLayoutName, done — no component work needed unless you
 *  want a new hero treatment.
 * ========================================================================== */

/** How the top of the page opens:
 *  - "showcase": centered copy above the full-width animated inbox demo
 *  - "split":    copy on the left, live chat demo on the right (leaner)
 *  - "video":    centered copy with a VSL video (brand.config.ts →
 *                hero.videoId; a designed placeholder frame until it's set)
 *  - "minimal":  centered copy, CTAs and channel pills only — no demo */
export type HeroVariant = "showcase" | "split" | "video" | "minimal";

/** Sections that can appear on the home page, in any order. */
export type SectionKey =
  | "problem"
  | "comparison"
  | "howItWorks"
  | "features"
  | "useCases"
  | "conversation"
  | "integrations"
  | "midCta"
  | "trust"
  | "guarantee"
  | "testimonials"
  | "pricing"
  | "faq"
  | "finalCta";

export type HomeLayoutName =
  "classic" | "story" | "split" | "demo" | "vsl" | "compact";

export interface HomeLayout {
  label: string;
  description: string;
  hero: HeroVariant;
  sections: SectionKey[];
}

export const homeLayouts: Record<HomeLayoutName, HomeLayout> = {
  /** The shipped default: full story, showcase first. */
  classic: {
    label: "Classic",
    description:
      "The full story: big hero with the animated inbox, then why-it's-different, how it works, features, pricing.",
    hero: "showcase",
    sections: [
      "comparison",
      "howItWorks",
      "features",
      "conversation",
      "testimonials",
      "pricing",
      "guarantee",
      "faq",
      "finalCta",
    ],
  },

  /** Everything on one page — the longest, most persuasive version. */
  story: {
    label: "Story",
    description:
      "The long-form page: every section — comparison, steps, industries, features, integrations, a mid-page CTA — before pricing. For cold traffic that needs convincing.",
    hero: "showcase",
    sections: [
      "problem",
      "comparison",
      "howItWorks",
      "useCases",
      "conversation",
      "features",
      "integrations",
      "midCta",
      "trust",
      "testimonials",
      "pricing",
      "guarantee",
      "faq",
      "finalCta",
    ],
  },

  /** Product-led: split hero, features first, leaner above the fold. */
  split: {
    label: "Split",
    description:
      "Product-led: copy left + live chat demo right, features first, industries and comparison after.",
    hero: "split",
    sections: [
      "features",
      "conversation",
      "howItWorks",
      "useCases",
      "comparison",
      "testimonials",
      "pricing",
      "guarantee",
      "faq",
      "finalCta",
    ],
  },

  /** Show-don't-tell: steps first, then who it's for. */
  demo: {
    label: "Demo",
    description:
      "Show, don't tell: how it works right after the hero, then industries, features and a mid-page CTA before the comparison.",
    hero: "showcase",
    sections: [
      "conversation",
      "howItWorks",
      "useCases",
      "features",
      "midCta",
      "comparison",
      "testimonials",
      "pricing",
      "faq",
      "finalCta",
    ],
  },

  /** Conversion/VSL: video up top, pricing early, short page. */
  vsl: {
    label: "Video launch",
    description:
      "A conversion page for paid traffic: VSL video up top (hero.videoId — a styled placeholder until you set it), how it works, industries, pricing early, FAQ, done.",
    hero: "video",
    sections: [
      "problem",
      "howItWorks",
      "useCases",
      "pricing",
      "guarantee",
      "testimonials",
      "faq",
      "finalCta",
    ],
  },

  /** One-pager lite: no demos, straight to the point. */
  compact: {
    label: "Compact",
    description:
      "A tight one-pager: minimal hero (no demo), channels & tools, features, pricing, FAQ. For warm audiences that just need the essentials.",
    hero: "minimal",
    sections: [
      "integrations",
      "features",
      "pricing",
      "guarantee",
      "faq",
      "finalCta",
    ],
  },
};
