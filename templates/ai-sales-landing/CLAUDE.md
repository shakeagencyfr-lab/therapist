# CLAUDE.md — project briefing

This is a **white-label AI sales-agent landing site**: six static pages
(Home `/`, Pricing, Contact, Terms, Privacy, 404) plus an owner's manual
at `/guide` (nav-linked by default, noindexed; the build copies the 404
page to `dist/404.html` for static hosts). React 19 + Vite + Tailwind v3, pre-rendered to static HTML with
`vite-react-ssg`. The person working on this is often **not a developer** —
prefer plain-English explanations and make changes for them rather than
telling them how.

## The three files that matter

1. **`src/brand.config.ts`** — ALL customer-facing content: brand name,
   domain, colours, nav, hero copy, pricing tiers, FAQ, testimonials, legal
   entity, footer. For any request that is about words, prices, links or
   brand colour, edit ONLY this file.
2. **`src/themes.ts`** — the six visual variants ("original", "nebula",
   "bloom", "ember", "tidal", "mono"): fonts, default accent ramp, page background,
   card material, radius. Switching looks = changing `theme:` in
   brand.config.ts. New variant = new object here + add its key to
   `ThemeName`.
3. **`src/homeLayouts.ts`** — the six home-page layouts ("classic", "story",
   "split", "demo", "vsl", "compact"): which hero treatment opens the page +
   which sections render, in what order. Switching = changing `homeLayout:`
   in brand.config.ts. Reordering/dropping sections or inventing a layout =
   edit ONLY this file (no component work).

## Home-page building blocks (App.tsx)

The home page is assembled in `src/App.tsx` from named components — reuse
these, never duplicate their JSX:

| Component                     | Section                                                           | Content source (brand.config)                   |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `Hero`                        | top of page (4 modes: "showcase" / "split" / "video" / "minimal") | `hero`, `channels`                              |
| `ComparisonTable`             | "why us" table                                                    | `comparison`                                    |
| `HowItWorks`                  | 3 steps + demos                                                   | `howItWorks` (+ `lib/StepDemos`)                |
| `Features`                    | bento grid                                                        | `features` (Fluent emoji PNGs)                  |
| `ProblemSection`              | pain/agitation cards                                              | `problem`                                       |
| `UseCases`                    | industries grid                                                   | `useCases` (Fluent emoji PNGs)                  |
| `ConversationSection`         | copy + animated deal-closing chat                                 | `conversation` (+ `lib/threads`)                |
| `IntegrationsStrip`           | channels + tools pills                                            | `integrations` (+ `channels`)                   |
| `MidCta`                      | mid-page CTA band                                                 | `finalCta` (reused, compact)                    |
| `TrustSection`                | security/GDPR cards                                               | `trust` (keep consistent with `infrastructure`) |
| `GuaranteeSection`            | risk-reversal cards                                               | `guarantee`                                     |
| `Testimonials`                | reviews (hides if [])                                             | `testimonials`                                  |
| `Pricing`                     | tiers                                                             | `pricing`                                       |
| `FAQSection`                  | accordion                                                         | `faq`                                           |
| `FinalCta`                    | closing banner                                                    | `finalCta`                                      |
| `Nav` / `Footer` / `OrbField` | shared chrome                                                     | `nav` / `footer`                                |

The "video" hero renders a styled `VideoPlaceholder` (dark stage + play
button) until `hero.videoId` is set.

The `SECTION_COMPONENTS` map in App.tsx binds section keys → components;
layouts in homeLayouts.ts are just ordered lists of those keys. Hero
sub-pieces (`HeroBadge`, `HeroCtas`, `HeroChannelPills`, `HeroKpis`) are
shared across all three hero modes. The "vsl" hero embeds
`react-lite-youtube-embed` using `hero.videoId` and falls back to the
inbox showcase when it's null.

Design previews: any URL with `?theme=` / `?layout=` previews that design
site-wide for the browser session (sessionStorage, see `lib/previewMode.ts`)
with a floating exit chip; the nav's Design menu (`nav.themePicker`) links
them. Previews never change brand.config.

How theming works: `src/lib/brandTheme.ts` compiles the chosen theme (+
optional `colors` override from brand.config) into a `:root { --* }` CSS
block injected into every page's head by `src/Layout.tsx`. `src/styles.css`
declares the same variables with "original" defaults, and
`tailwind.config.js` maps `champ-*` colours and the font utilities
(`font-grotesk`/`font-clash` → `--font-display`, `font-sans` →
`--font-body`) onto those variables. So: **never hardcode a colour or
font-family in a component — use `champ-*` classes and the font utilities.**

## Commands

```bash
npm run dev        # dev server with live reload
npm run build      # tsc + static build into dist/  — MUST pass before "done"
npm run preview    # serve the built dist/
```

Always run `npm run build` after making changes and fix any errors before
reporting success.

## Layout of everything else

- `src/App.tsx` — the home page (exports `Nav`, `Footer`, `OrbField` reused
  by sub-pages)
- `src/pages/` — Pricing, Contact, Terms, Privacy, Guide
- `src/lib/` — shared pieces: `SubPagePrimitives.tsx` (SectionHeader, cards,
  timeline, chips), `StepDemos.tsx` + `threads.tsx` (the animated inbox
  demo), `MessageBubble.tsx`, `LegalPageShell.tsx`, `WhatsAppCTA.tsx`
- `public/brand/` — logo.svg, favicon.svg, og.svg (the owner replaces these)
- `public/emoji/` + `public/emoji-animated/` — Fluent emoji assets; use
  `FeatureEmoji` with a filename that EXISTS in those folders

## Rules

- Legal pages are generated from `brand.config.ts` (legalEntity,
  infrastructure, retention). Never invent legal facts; if the owner asks for
  legal-content changes beyond filling their entity/jurisdiction in, remind
  them a lawyer should review.
- Testimonials ship EMPTY on purpose. Never fabricate reviews, customer
  names or logos.
- Keep every claim in the copy a capability ("24/7", "replies in seconds"),
  not an invented customer result ("made $50k").
- The site must stay fully static — no backend calls, no forms that POST
  anywhere. Contact goes through mailto: and the WhatsApp link.
- Don't remove the `/guide` route unless the owner explicitly asks; it's
  their manual.
- After UI changes, sanity-check `npm run build` output — every page renders
  at build time, so a runtime error breaks the build (that's the safety
  net).

## Skills

- `/rebrand` — interview the owner, then fill brand.config.ts completely
- `/theme` — switch variants or create a new one in src/themes.ts
- `/deploy` — build + ship to Cloudflare Pages (git-connected or wrangler)
