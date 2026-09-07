/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // `champ-*` is the legacy class name used throughout the template. Each
        // stop reads from a CSS variable (an "R G B" triplet) set at runtime
        // from brand.config.ts → colors, so changing your primary colour in
        // ONE place reskins the whole site. The rgb(... / <alpha-value>) form
        // keeps opacity utilities like `champ-500/30` working.
        champ: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
      },
      fontFamily: {
        // All four aliases resolve to the active theme's fonts (CSS variables
        // set from src/themes.ts via brand.config.ts → theme). `grotesk` and
        // `clash` are the display/headline face; `sans`/`satoshi` the body.
        grotesk: "var(--font-display)",
        clash: "var(--font-display)",
        sans: "var(--font-body)",
        satoshi: "var(--font-body)",
      },
    },
  },
  plugins: [],
};
