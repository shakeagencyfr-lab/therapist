# White-Label AI Sales-Agent Landing Template

A fast, config-driven marketing landing site for an **AI sales-agent** product — the kind of AI that answers DMs in seconds, qualifies leads, books calls and closes deals across WhatsApp, Instagram, Messenger, web chat and SMS.

Everything customer-facing on the site is driven from **one file**: [`src/brand.config.ts`](src/brand.config.ts). Edit that file, drop in your logo, and the entire site rebrands — no component hunting required.

> **New here? Open the built-in owner's guide.** Run `npm install && npm run dev` and visit **`/guide`** — it walks you through picking a look, rebranding, editing with Claude Code, GitHub and free Cloudflare Pages hosting. (It ships linked in the nav so you can't miss it; remove one config line to unlist it — it's always noindexed.)

## What's in the box

Seven pages, fully static-generated and SEO-ready:

| Page           | Route                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| Home           | `/`                                                                                |
| Pricing        | `/pricing`                                                                         |
| Contact        | `/contact`                                                                         |
| Terms          | `/terms`                                                                           |
| Privacy Policy | `/privacy-policy`                                                                  |
| 404            | any unknown URL (`dist/404.html`, served automatically by Cloudflare Pages)        |
| Owner's guide  | `/guide` (nav-linked by default — remove the nav line to unlist; always noindexed) |

### Six looks, one word

The template ships with **six complete visual variants** — different fonts, default colours, card materials and backgrounds. Pick one in `brand.config.ts`:

```ts
theme: "original", // | "nebula" | "bloom" | "ember" | "tidal" | "mono"
```

| Theme      | Vibe                                                               |
| ---------- | ------------------------------------------------------------------ |
| `original` | Frosted glass + drifting grid, green accent, Space Grotesk         |
| `nebula`   | Indigo/violet, solid elevated cards with a soft glow, Sora         |
| `bloom`    | Rose serif (Fraunces) on soft paper cards — boutique, editorial    |
| `ember`    | Amber/orange, flat confidently-bordered cards, Bricolage Grotesque |
| `tidal`    | Sky/cyan, crisp minimal hairline cards, Manrope                    |
| `mono`     | Black & white minimalism, Inter — the Linear/Notion look           |

Every theme carries its own accent colours out of the box; setting your own `colors` in the config overrides them, so any theme works with any brand. The variants live in [`src/themes.ts`](src/themes.ts) — copy an object there to design a seventh.

### Six home layouts

Separate from the look, `homeLayout` changes what the home page is built from — which sections render, in what order, and how it opens:

```ts
homeLayout: "classic", // | "story" | "split" | "demo" | "vsl" | "compact"
```

| Layout    | Shape                                                                      |
| --------- | -------------------------------------------------------------------------- |
| `classic` | Big hero + animated inbox showcase, full section story                     |
| `story`   | The long-form page: adds industries, integrations and a mid-page CTA       |
| `split`   | Copy left / live chat demo right, features first                           |
| `demo`    | Show-don't-tell: how it works right after the hero, industries next        |
| `vsl`     | Video hero (`hero.videoId`; styled placeholder until set), pricing early   |
| `compact` | Minimal hero (no demo), channels & tools, short one-pager for warm traffic |

Layouts combine freely with any theme and live in [`src/homeLayouts.ts`](src/homeLayouts.ts) — a layout is just a hero treatment + an ordered list of section keys, so reordering or inventing one is a data edit, not component work.

**Live previews:** open any page with `?theme=bloom` or `?layout=vsl` (or use the nav's **Design** menu, `nav.themePicker`) — the preview sticks for your whole browser session, a floating chip lets you exit, and nothing changes until you edit the config.

### Built for Claude Code

The project ships pre-wired for [Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent: a `CLAUDE.md` briefing plus three guided skills — `/rebrand` (interview → whole brand filled in), `/theme` (switch or design variants) and `/deploy` (ship to Cloudflare Pages). Non-developers can customise the entire site by describing changes in plain English.

### Tech stack

- **React 19** + **Vite** (build tooling)
- **vite-react-ssg** — static site generation (pre-rendered HTML for every route)
- **Tailwind CSS v3** — utility styling, with a themeable `champ-*` colour scale driven by CSS variables
- **framer-motion** — entrance and scroll animations
- **TypeScript** — the project builds with `tsc && vite-react-ssg build`

---

## Quick start

You'll need [Node.js](https://nodejs.org/) 18+ installed.

```bash
npm install        # install dependencies (run once)
npm run dev        # local dev server with hot reload  → http://localhost:5173
npm run build      # type-check + build static site into  dist/
npm run preview    # serve the built dist/ locally to sanity-check before deploy
```

That's it. Out of the box the site renders as a working demo using neutral **"YourBrand"** placeholder copy.

---

## How to rebrand — in one file

Open [`src/brand.config.ts`](src/brand.config.ts) and edit the values. It is heavily commented and every section maps directly to a section of the site. Save, and `npm run dev` reflects the change instantly.

> Tip: anything wrapped in `[SQUARE BRACKETS]` is a placeholder you **must** replace before going live (especially the legal entity). And if you ever think you missed a spot, search the whole project for the string `YourBrand`.

Here is what each field controls:

### Identity

```ts
brandName: "YourBrand",
tagline: "The AI sales agent that books calls and closes deals in your DMs.",
domain: "yourbrand.com",          // bare domain, no protocol
siteUrl: "https://yourbrand.com", // full canonical URL, no trailing slash
appUrl: "https://app.yourbrand.com",  // where "Log in" / dashboard CTAs point
supportEmail: "hello@yourbrand.com",
helpUrl: "https://help.yourbrand.com",
whatsAppLink: "https://wa.me/10000000000?text=Hi", // floating contact button
```

### Legal (replace — and have a lawyer review)

```ts
legalEntity: "[Your Company Name Ltd / B.V.]",
legalJurisdiction: "[your country]",
legalEffectiveDate: "1 January 2026",
```

These feed the Terms and Privacy pages. **Get them reviewed by a lawyer before launch.**

### Theme & colours

```ts
theme: "original", // the visual variant — see "Six looks, one word" above

colors: null, // null = use the theme's own accent colours
// …or set your brand ramp (overrides the theme's accent, works with any theme):
// colors: {
//   c50:  "#ecfdf5",
//   c100: "#d1fae5",
//   c500: "#25D366",  // your primary brand colour
//   c600: "#1ab854",
//   c700: "#147a3a",
//   c900: "#082f17",
// },
```

See [The colour system](#the-colour-system) below.

### Assets

```ts
logo: "/brand/logo.svg",
logoAlt: "YourBrand",
favicon: "/brand/favicon.svg",
ogImage: "/brand/og.svg",
```

See [Swapping brand assets](#swapping-brand-assets) below.

### Navigation — `nav`

Header links, the header CTA button, and the "Log in" link.

### Channels — `channels`

The channel pills shown in the hero (WhatsApp, Instagram, Messenger, etc.). Mark any with `soon: true` to render a "soon" badge.

### Hero — `hero`

The top of the home page: optional `badge` pill, headline (rendered as `titleA <highlight>titleHighlight</highlight> titleB`), `subhead`, the primary and (optional) secondary CTAs, and four small `kpis` stat chips.

> Keep the KPI chips as **capability facts** ("24/7", "<30s reply", "5 channels") rather than customer-result claims, so they stay true for everyone.

### Comparison — `comparison`

The "AI sales agent vs. regular chatbot" table. Each row is `[label, yourCell, theirCell]` where a cell is `true`, `false`, or `"partial"`.

### How it works — `howItWorks`

The three-step setup explainer.

### Features — `features`

The feature bento grid — each item has an `emoji`, `title` and `body`.

### Testimonials — `testimonials`

**Ships empty on purpose.** While the `items` array is empty, the whole section is hidden automatically. See [Adding testimonials](#adding-testimonials).

### Pricing — `pricing`

The pricing tiers. Each tier has `name`, `price`, `cadence`, `blurb`, a `features` list, a `cta`, and an optional `featured: true` to highlight the recommended plan.

### FAQ — `faq`

A list of `[question, answer]` pairs.

### Final CTA — `finalCta`

The closing call-to-action band: `headline`, `subhead`, the CTA button, and a `trustLine` of short reassurance chips.

### Footer — `footer`

The footer `tagline`, link `columns`, `social` links, and `copyright`.

---

## The colour system

You do not touch any CSS to reskin the site:

1. At build time, the chosen theme (fonts, background, card material, accent ramp) is compiled to **CSS variables** and baked into every page's `<head>` — your `colors`, if set, replace the theme's accent ramp.
2. Tailwind's `champ-50` / `champ-100` / `champ-500` / `champ-600` / `champ-700` / `champ-900` utility classes (and the font utilities) resolve to those variables.
3. Every gradient, button, accent and hover state in the design is built from those classes.

If you set your own `colors`, keep the six stops as a coherent **light → dark ramp of a single hue** (50 lightest, 900 darkest, 500 is your primary). Pick your brand colour for `c500` and fill the others in around it, and the gradients and accents stay balanced.

---

## Swapping brand assets

All brand assets live in [`public/brand/`](public/brand/). Replace these files (keep the same filenames, or update the paths in `brand.config.ts`):

| File          | What it is                  | Notes                                                                                                                                                                                                                                 |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo.svg`    | Your logo (header + footer) | SVG recommended so it stays crisp at any size                                                                                                                                                                                         |
| `favicon.svg` | Browser tab icon            |                                                                                                                                                                                                                                       |
| `og.svg`      | Social share preview image  | **Must be exported to PNG or JPG before launch** — most social platforms (Facebook, LinkedIn, X, iMessage, etc.) do **not** render SVG OG images. Export a `1200×630` PNG/JPG, drop it in `public/brand/`, and point `ogImage` at it. |

Anything you put under `public/` is served at the site root (e.g. `public/brand/logo.svg` → `/brand/logo.svg`).

---

## Adding testimonials

The testimonials section **ships empty on purpose** and hides itself until you add entries. Add only testimonials **you have written permission to use** — never reuse someone else's reviews, names or logos.

In `brand.config.ts`:

```ts
testimonials: {
  eyebrow: "Loved by teams",
  heading: "What customers say.",
  items: [
    {
      quote: "Replies to every lead in seconds — it paid for itself in week one.",
      name: "Jane Doe",
      title: "Founder, Example Co.",
      avatar: "/brand/jane.jpg", // optional, path under /public
    },
  ],
},
```

---

## Deploying

`npm run build` produces a fully static site in `dist/`. Point any static host at that folder:

- **Netlify** — set build command `npm run build`, publish directory `dist`.
- **Vercel** — framework "Other", build command `npm run build`, output directory `dist`.
- **Cloudflare Pages** — build command `npm run build`, output directory `dist`.

A [`public/_redirects`](public/_redirects) file is included for host-level redirect rules (Netlify and Cloudflare Pages read it natively). Adjust it for any custom redirects you need.

For a click-by-click walkthrough of the whole path — GitHub setup, free Cloudflare Pages hosting and a custom domain — open **`/guide`** on your running site.

---

## Before you go live — checklist

- [ ] Replace every `YourBrand` / `yourbrand.com` placeholder (search the whole project to be sure).
- [ ] Fill in the legal entity, jurisdiction and effective date — and **get the Terms and Privacy pages reviewed by a lawyer**.
- [ ] Export a real **OG image** to PNG/JPG (`1200×630`) and point `ogImage` at it.
- [ ] Set the real **app / login URL** (`appUrl`, `nav.loginHref`) and **WhatsApp / contact link** (`whatsAppLink`).
- [ ] Set the real **support email** and **help URL**.
- [ ] Swap in your **logo** and **favicon**.
- [ ] Set your brand **colours** and confirm the site looks right in light and dark areas.
- [ ] Add your **own testimonials** (with permission) — or leave the section empty.
- [ ] Confirm your **pricing tiers** and the CTAs point where you want them.
- [ ] Run `npm run build` and `npm run preview` and click through all five pages.

---

## License

This template is provided under a commercial license — see [LICENSE.md](LICENSE.md). In short: use and customise it for your own brand (and your clients, under an agency/extended license), but don't redistribute or resell the template itself.
