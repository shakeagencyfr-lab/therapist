/* =============================================================================
 *  themes.ts — the six built-in visual variants
 * =============================================================================
 *
 *  Pick one in brand.config.ts →  theme: "original" | "nebula" | "bloom" |
 *  "ember" | "tidal" | "mono".  Each theme is a complete visual treatment: fonts, a
 *  default accent colour ramp, page background, card "material" (glass /
 *  paper / flat / hairline) and corner radius. Your own colours in
 *  brand.config.ts → colors (if set) override the theme's default ramp, so
 *  every theme works with any brand colour.
 *
 *  All of it compiles to a block of CSS variables injected into each page's
 *  <head> at build time (see src/lib/brandTheme.ts) — no runtime cost.
 *
 *  Want another look? Copy a theme object, tweak the values, add its key to
 *  ThemeName. Everything is plain CSS values.
 * ========================================================================== */

export type ThemeName =
  "original" | "nebula" | "bloom" | "ember" | "tidal" | "mono";

export interface ThemeColors {
  c50: string;
  c100: string;
  c500: string;
  c600: string;
  c700: string;
  c900: string;
}

export interface Theme {
  /** Shown in docs/guide only. */
  label: string;
  description: string;

  fonts: {
    /** CSS font-family for headlines (the .font-clash class). */
    display: string;
    /** CSS font-family for body text. */
    body: string;
    /** Google Fonts stylesheet URL loading the families above. */
    googleHref: string;
  };

  /** Default accent ramp — used when brand.config.ts → colors is null. */
  colors: ThemeColors;

  page: {
    /** Solid page background colour. */
    bgColor: string;
    /** background-image stack (orbs / glows). Use "none" for flat. */
    bgImage: string;
    /** Line-grid overlay colour. "transparent" disables the grid. */
    gridColor: string;
    /** Film-grain overlay opacity, 0–1. */
    grainOpacity: number;
  };

  /** Card material — feeds the .glass* classes in styles.css. */
  material: {
    bg: string;
    bgStrong: string;
    border: string;
    borderTop: string;
    shadow: string;
    shadowLift: string;
    subBg: string;
    subBorder: string;
    pillBg: string;
    pillBorder: string;
    pillShadow: string;
    /** .glass-soft overrides — omit to reuse bg/shadow (solid-card themes). */
    softBg?: string;
    softShadow?: string;
    /** backdrop blur for .glass / .glass-lift / .glass-sub / .glass-pill */
    blur: string;
    blurStrong: string;
    subBlur: string;
    pillBlur: string;
  };

  /** Corner radius override for glass cards. null = keep the template's
   *  per-element radii (only the original uses null). [large, medium] —
   *  large replaces rounded-3xl-class cards, medium replaces rounded-2xl. */
  radius: [string, string] | null;

  /** Optional raw CSS appended after the theme variables — the escape hatch
   *  for one-off tweaks a theme needs (e.g. mono flattens the gradient-text
   *  glow). Keep it tiny. */
  extraCss?: string;
}

/* -------------------------------------------------------------------------- */

const GF = "https://fonts.googleapis.com/css2?";

export const themes: Record<ThemeName, Theme> = {
  /* ---- Original — the shipped look: frosted glass, drifting grid, grain --- */
  original: {
    label: "Original",
    description:
      "Frosted-glass cards over a slow-drifting grid with film grain. Fresh green accent, Space Grotesk headlines.",
    fonts: {
      display: '"Space Grotesk", "Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      googleHref:
        GF +
        "family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
    },
    colors: {
      c50: "#ecfdf5",
      c100: "#d1fae5",
      c500: "#25D366",
      c600: "#1ab854",
      c700: "#147a3a",
      c900: "#082f17",
    },
    page: {
      bgColor: "#fafbfc",
      bgImage:
        "radial-gradient(ellipse 70% 50% at 12% 0%, rgb(var(--brand-500) / 0.1) 0%, transparent 60%)," +
        "radial-gradient(ellipse 60% 50% at 88% 12%, rgba(139, 92, 246, 0.08) 0%, transparent 60%)," +
        "radial-gradient(ellipse 60% 45% at 50% 90%, rgb(var(--brand-500) / 0.06) 0%, transparent 60%)",
      gridColor: "rgba(15, 23, 42, 0.085)",
      grainOpacity: 0.95,
    },
    material: {
      bg: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(248,250,253,0.1) 100%)",
      bgStrong:
        "linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(243,245,249,0.22) 100%)",
      border: "rgba(15, 23, 42, 0.1)",
      borderTop: "rgba(255, 255, 255, 0.95)",
      shadow:
        "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px -2px rgba(15,23,42,0.06), 0 18px 38px -10px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.04)",
      shadowLift:
        "0 2px 4px rgba(15,23,42,0.06), 0 10px 24px -4px rgba(15,23,42,0.08), 0 28px 56px -12px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.04)",
      subBg:
        "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(245,246,248,0.4) 100%)",
      subBorder: "rgba(15, 23, 42, 0.06)",
      pillBg:
        "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(245,246,248,0.62) 100%)",
      pillBorder: "rgba(15, 23, 42, 0.08)",
      pillShadow:
        "0 1px 2px rgba(15,23,42,0.04), 0 6px 18px -8px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,1)",
      softBg:
        "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(248,250,253,0.22) 100%)",
      softShadow:
        "0 1px 2px rgba(15,23,42,0.05), 0 8px 20px -6px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
      blur: "4px",
      blurStrong: "6px",
      subBlur: "12px",
      pillBlur: "16px",
    },
    radius: null,
  },

  /* ---- Nebula — indigo/violet, solid elevated app-surface cards ---------- */
  nebula: {
    label: "Nebula",
    description:
      "Indigo & violet on solid elevated cards with a soft violet glow — a modern app-surface look. Sora headlines, orb background, no grid.",
    fonts: {
      display: '"Sora", "Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      googleHref:
        GF +
        "family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap",
    },
    colors: {
      c50: "#eef2ff",
      c100: "#e0e7ff",
      c500: "#6366f1",
      c600: "#4f46e5",
      c700: "#4338ca",
      c900: "#1e1b4b",
    },
    page: {
      bgColor: "#fafbff",
      bgImage:
        "radial-gradient(ellipse 70% 50% at 12% 0%, rgba(99,102,241,0.16) 0%, transparent 60%)," +
        "radial-gradient(ellipse 60% 50% at 88% 12%, rgba(168,85,247,0.12) 0%, transparent 60%)," +
        "radial-gradient(ellipse 60% 45% at 50% 92%, rgba(56,189,248,0.1) 0%, transparent 60%)",
      gridColor: "transparent",
      grainOpacity: 0,
    },
    material: {
      bg: "#ffffff",
      bgStrong: "#ffffff",
      border: "rgba(99, 102, 241, 0.18)",
      borderTop: "rgba(99, 102, 241, 0.18)",
      shadow:
        "0 1px 2px rgba(30,27,75,0.05), 0 14px 34px -12px rgba(99,102,241,0.28)",
      shadowLift:
        "0 2px 6px rgba(30,27,75,0.06), 0 26px 56px -16px rgba(99,102,241,0.36)",
      subBg: "#f3f3ff",
      subBorder: "rgba(99, 102, 241, 0.12)",
      pillBg: "#ffffff",
      pillBorder: "rgba(99, 102, 241, 0.18)",
      pillShadow:
        "0 1px 2px rgba(30,27,75,0.05), 0 8px 20px -10px rgba(99,102,241,0.3)",
      blur: "0px",
      blurStrong: "0px",
      subBlur: "0px",
      pillBlur: "0px",
    },
    radius: ["1.25rem", "1rem"],
  },

  /* ---- Bloom — rose/fuchsia, serif headlines, soft paper cards ------------ */
  bloom: {
    label: "Bloom",
    description:
      "Rose & fuchsia with Fraunces serif headlines on soft paper cards — big radius, pastel shadows, warm bloom background. Boutique and editorial.",
    fonts: {
      display: '"Fraunces", Georgia, serif',
      body: '"Inter", system-ui, sans-serif',
      googleHref:
        GF +
        "family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap",
    },
    colors: {
      c50: "#fff1f2",
      c100: "#ffe4e6",
      c500: "#f43f5e",
      c600: "#e11d48",
      c700: "#be123c",
      c900: "#881337",
    },
    page: {
      bgColor: "#fffafb",
      bgImage:
        "radial-gradient(ellipse 90% 70% at 0% 0%, rgba(244,63,94,0.15) 0%, transparent 65%)," +
        "radial-gradient(ellipse 80% 65% at 100% 20%, rgba(217,70,239,0.1) 0%, transparent 65%)," +
        "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(251,113,133,0.1) 0%, transparent 65%)",
      gridColor: "transparent",
      grainOpacity: 0,
    },
    material: {
      bg: "#ffffff",
      bgStrong: "#fffafb",
      border: "rgba(136, 19, 55, 0.07)",
      borderTop: "rgba(136, 19, 55, 0.07)",
      shadow:
        "0 1px 2px rgba(136,19,55,0.04), 0 18px 42px -16px rgba(244,63,94,0.2)",
      shadowLift:
        "0 2px 6px rgba(136,19,55,0.05), 0 28px 64px -20px rgba(244,63,94,0.24)",
      subBg: "#fff4f7",
      subBorder: "rgba(136, 19, 55, 0.06)",
      pillBg: "rgba(255, 255, 255, 0.94)",
      pillBorder: "rgba(136, 19, 55, 0.08)",
      pillShadow:
        "0 1px 2px rgba(136,19,55,0.04), 0 12px 28px -12px rgba(244,63,94,0.22)",
      blur: "0px",
      blurStrong: "0px",
      subBlur: "0px",
      pillBlur: "0px",
    },
    radius: ["1.75rem", "1.25rem"],
  },

  /* ---- Ember — amber/orange, bold flat bordered cards --------------------- */
  ember: {
    label: "Ember",
    description:
      "Amber & orange with Bricolage Grotesque headlines on flat, confidently bordered cards — warm blooms, a hint of grain. Bold and energetic.",
    fonts: {
      display: '"Bricolage Grotesque", "Inter", system-ui, sans-serif',
      body: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
      googleHref:
        GF +
        "family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Bricolage+Grotesque:wght@500;600;700&display=swap",
    },
    colors: {
      c50: "#fffbeb",
      c100: "#fef3c7",
      c500: "#f59e0b",
      c600: "#d97706",
      c700: "#b45309",
      c900: "#78350f",
    },
    page: {
      bgColor: "#fffdf7",
      bgImage:
        "radial-gradient(ellipse 70% 50% at 10% 0%, rgba(245,158,11,0.18) 0%, transparent 60%)," +
        "radial-gradient(ellipse 55% 50% at 90% 10%, rgba(234,88,12,0.12) 0%, transparent 60%)," +
        "radial-gradient(ellipse 55% 45% at 50% 95%, rgba(244,63,94,0.08) 0%, transparent 60%)",
      gridColor: "transparent",
      grainOpacity: 0.25,
    },
    material: {
      bg: "#fffdf9",
      bgStrong: "#ffffff",
      border: "rgba(124, 45, 18, 0.16)",
      borderTop: "rgba(124, 45, 18, 0.16)",
      shadow:
        "0 1px 2px rgba(124,45,18,0.05), 0 8px 18px -12px rgba(234,88,12,0.28)",
      shadowLift:
        "0 2px 4px rgba(124,45,18,0.06), 0 14px 28px -14px rgba(234,88,12,0.34)",
      subBg: "#fff7ed",
      subBorder: "rgba(124, 45, 18, 0.12)",
      pillBg: "#fffdf9",
      pillBorder: "rgba(124, 45, 18, 0.18)",
      pillShadow: "0 2px 0 0 rgba(124,45,18,0.06)",
      blur: "0px",
      blurStrong: "0px",
      subBlur: "0px",
      pillBlur: "0px",
    },
    radius: ["0.75rem", "0.625rem"],
  },

  /* ---- Tidal — sky/cyan, crisp hairline cards (Linear-style) -------------- */
  tidal: {
    label: "Tidal",
    description:
      "Sky & cyan in Manrope on crisp hairline cards — tight shadows, sharp corners, a single top glow. Minimal and product-led.",
    fonts: {
      display: '"Manrope", "Inter", system-ui, sans-serif',
      body: '"Manrope", "Inter", system-ui, sans-serif',
      googleHref: GF + "family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    colors: {
      c50: "#f0f9ff",
      c100: "#e0f2fe",
      c500: "#0ea5e9",
      c600: "#0284c7",
      c700: "#0369a1",
      c900: "#0c4a6e",
    },
    page: {
      bgColor: "#f8fdff",
      bgImage:
        "radial-gradient(ellipse 65% 55% at 50% -5%, rgba(14,165,233,0.14) 0%, transparent 62%)",
      gridColor: "transparent",
      grainOpacity: 0,
    },
    material: {
      bg: "#ffffff",
      bgStrong: "#ffffff",
      border: "rgba(8, 47, 73, 0.1)",
      borderTop: "rgba(8, 47, 73, 0.1)",
      shadow: "0 1px 2px rgba(8,47,73,0.05)",
      shadowLift:
        "0 1px 2px rgba(8,47,73,0.05), 0 12px 26px -14px rgba(8,47,73,0.18)",
      subBg: "#f1f9fe",
      subBorder: "rgba(8, 47, 73, 0.08)",
      pillBg: "#ffffff",
      pillBorder: "rgba(8, 47, 73, 0.1)",
      pillShadow: "0 1px 2px rgba(8,47,73,0.06)",
      blur: "0px",
      blurStrong: "0px",
      subBlur: "0px",
      pillBlur: "0px",
    },
    radius: ["0.5rem", "0.375rem"],
  },

  /* ---- Mono — black & white minimalism (the Linear / Notion look) --------- */
  mono: {
    label: "Mono",
    description:
      "Black & white minimalism — Inter everywhere, near-black buttons, hairline gray borders, zero decoration. The Linear/Notion look.",
    fonts: {
      display: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      googleHref: GF + "family=Inter:wght@400;500;600;700;800&display=swap",
    },
    colors: {
      c50: "#fafafa",
      c100: "#f4f4f5",
      c500: "#18181b",
      c600: "#101012",
      c700: "#09090b",
      c900: "#000000",
    },
    page: {
      bgColor: "#ffffff",
      bgImage: "none",
      gridColor: "transparent",
      grainOpacity: 0,
    },
    material: {
      bg: "#ffffff",
      bgStrong: "#ffffff",
      border: "rgba(9, 9, 11, 0.1)",
      borderTop: "rgba(9, 9, 11, 0.1)",
      shadow: "0 1px 2px rgba(9,9,11,0.04)",
      shadowLift: "0 1px 3px rgba(9,9,11,0.07)",
      subBg: "#fafafa",
      subBorder: "rgba(9, 9, 11, 0.08)",
      pillBg: "#ffffff",
      pillBorder: "rgba(9, 9, 11, 0.1)",
      pillShadow: "0 1px 2px rgba(9,9,11,0.05)",
      blur: "0px",
      blurStrong: "0px",
      subBlur: "0px",
      pillBlur: "0px",
    },
    radius: ["0.625rem", "0.5rem"],
    // Mono is gradient-FREE: solid headline highlight, flat button, flat
    // bubbles, no pulsing CTA glow, no blurred background orbs. (The demo
    // surfaces read --msg-out-bg / --typing-bg with gradient fallbacks; the
    // remaining accent-ramp gradients resolve black-on-black here anyway.)
    extraCss:
      ":root{--msg-out-bg:#f4f4f5;--msg-in-bg:#ffffff;--msg-shadow:none;--typing-bg:#3f3f46;--win-sheen:none;--cta-wash:none;--avatar-neutral-bg:#f1f5f9;}" +
      ".stream-fade-top{background:linear-gradient(to bottom,#fafafa,transparent);}" +
      ".stream-fade-bottom{background:linear-gradient(to top,#fafafa,transparent);}" +
      ".grad-text{background:none;-webkit-text-fill-color:rgb(var(--brand-900));color:rgb(var(--brand-900));filter:none;}" +
      ".btn-primary{background:rgb(var(--brand-500));box-shadow:0 1px 2px rgba(9,9,11,0.25);}" +
      ".btn-primary:hover{box-shadow:0 2px 6px rgba(9,9,11,0.3);}" +
      ".pulse-glow{animation:none;}" +
      ".bubble-out{background:rgb(var(--brand-900));}" +
      ".orb{display:none;}" +
      ".hero-halo{display:none;}" +
      ".featured-glow{display:none;}" +
      ".accent-glow{box-shadow:0 1px 2px rgba(9,9,11,0.12);}" +
      ".glass{box-shadow:var(--glass-shadow);}" +
      ".glass:hover{transform:none;}" +
      ".panel-soft{background:#fafafa;}" +
      ".panel-insight{background:#f5f3ff;}" +
      ".panel-accent{background:rgb(var(--brand-50));}",
  },
};
