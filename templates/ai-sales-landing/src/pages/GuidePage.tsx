/* =============================================================================
 *  /guide — the owner's manual, embedded in the site itself.
 *
 *  This page is for YOU (the person who bought the template), not for your
 *  visitors. It ships linked in the nav (the "Guide" item in brand.config.ts →
 *  nav.links) so you can't miss it — remove that one line before going live
 *  and the page becomes unlisted. It always carries a noindex meta tag, so
 *  search engines won't index it either way. Delete this file + its route in
 *  routes.tsx whenever you no longer want it around.
 * ========================================================================== */
import { Head } from "vite-react-ssg";
import { motion } from "framer-motion";
import { Nav, OrbField, Footer } from "../App";
import { fadeUp, staggerContainer, VIEWPORT_ONCE } from "../lib/motion";
import { SectionHeader, Chip, FeatureEmoji } from "../lib/SubPagePrimitives";
import brand from "../brand.config";
import { themes, type ThemeName } from "../themes";
import { homeLayouts, type HomeLayoutName } from "../homeLayouts";

const TITLE = "Owner's guide — make this site yours";
const META =
  "How to rebrand, restyle, edit with Claude Code, put on GitHub and host free on Cloudflare Pages.";

/* ---- tiny local primitives ---------------------------------------------- */

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="glass-sub rounded-xl px-4 py-3 overflow-x-auto text-[13px] leading-relaxed font-mono text-slate-700 whitespace-pre">
      {children}
    </pre>
  );
}

function GuideCard({
  emoji,
  title,
  children,
}: {
  emoji?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={fadeUp} className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-3">
        {emoji && (
          <div className="shrink-0 mt-0.5">
            <FeatureEmoji src={emoji} size="sm" />
          </div>
        )}
        <h3 className="font-clash text-base sm:text-lg font-semibold text-[#213856] leading-snug">
          {title}
        </h3>
      </div>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">
        {children}
      </div>
    </motion.div>
  );
}

/* ---- the 4-step journey shown at the top ---------------------------------- */

const JOURNEY = [
  {
    emoji: "desktop-computer.png",
    title: "Run it",
    sub: "Open the site on your own computer",
  },
  {
    emoji: "artist-palette.png",
    title: "Pick a look",
    sub: "Six ready-made designs — click to preview",
  },
  {
    emoji: "sparkles.png",
    title: "Make it yours",
    sub: "Your name, logo, prices — one file (or ask Claude)",
  },
  {
    emoji: "rocket.png",
    title: "Put it live",
    sub: "Free hosting on your own domain",
  },
] as const;

/* ---- theme gallery ------------------------------------------------------- */

const THEME_ORDER: ThemeName[] = [
  "original",
  "nebula",
  "bloom",
  "ember",
  "tidal",
  "mono",
];

const LAYOUT_ORDER: HomeLayoutName[] = [
  "classic",
  "story",
  "split",
  "demo",
  "vsl",
  "compact",
];

/** Friendly names for the section-order chips on the layout cards. */
const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  problem: "The problem",
  comparison: "Why us",
  howItWorks: "How it works",
  features: "Features",
  useCases: "Industries",
  conversation: "Live chat demo",
  integrations: "Channels & tools",
  midCta: "CTA band",
  trust: "Security",
  guarantee: "Risk-free",
  testimonials: "Reviews",
  pricing: "Pricing",
  faq: "FAQ",
  finalCta: "Final CTA",
};

function ThemeCard({ name }: { name: ThemeName }) {
  const t = themes[name];
  const active = brand.theme === name;
  return (
    <motion.div
      variants={fadeUp}
      className={`glass rounded-2xl p-4 flex flex-col ${
        active ? "ring-2 ring-champ-500/60" : ""
      }`}
    >
      {/* Real screenshot of the home page in this theme. Clicking it (or the
          button below) opens the LIVE site in this look via ?theme=. */}
      <a
        href={`/?theme=${name}`}
        target="_blank"
        rel="noreferrer"
        className="block rounded-xl overflow-hidden border border-slate-900/10 mb-3 group relative"
        title={`Preview the ${t.label} look live`}
      >
        <img
          src={`/guide/theme-${name}.jpg`}
          alt={`The home page in the ${t.label} look`}
          loading="lazy"
          decoding="async"
          className="w-full aspect-[16/10] object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute inset-0 grid place-items-center bg-slate-950/0 group-hover:bg-slate-950/25 transition-colors">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-950/60">
            Click to preview live ↗
          </span>
        </span>
      </a>
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-clash text-lg font-semibold"
          style={{ color: t.colors.c700 }}
        >
          {t.label}
        </span>
        {active && <Chip tone="accent">active</Chip>}
      </div>
      {/* Accent ramp swatch */}
      <div className="flex gap-1.5 mb-3" aria-hidden>
        {[t.colors.c100, t.colors.c500, t.colors.c600, t.colors.c700].map(
          (c) => (
            <span
              key={c}
              className="w-6 h-6 rounded-full border border-slate-900/10"
              style={{ background: c }}
            />
          ),
        )}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed mb-3 flex-1">
        {t.description}
      </p>
      <div className="flex items-center justify-between gap-2">
        <code className="text-[12px] font-mono text-slate-500">
          theme: "{name}"
        </code>
        <a
          href={`/?theme=${name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-semibold text-champ-700 hover:underline whitespace-nowrap"
        >
          Preview live ↗
        </a>
      </div>
    </motion.div>
  );
}

/* ---- the page ------------------------------------------------------------ */

export default function GuidePage() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={META} />
        {/* Owner's manual — keep it out of search results. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <Nav />

      <main className="relative pt-32 pb-24 px-4 sm:px-6">
        <OrbField />

        {/* ---- Intro ---- */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.08)}
          className="max-w-3xl mx-auto text-center mb-20"
        >
          <motion.div variants={fadeUp} className="mb-4">
            <Chip tone="accent">
              Owner's guide — remove the nav link before going live
            </Chip>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="font-clash text-3xl sm:text-5xl font-bold text-[#213856] leading-[1.08] tracking-tight mb-5 [text-wrap:balance]"
          >
            Make this site <span className="grad-text">yours</span> — in an
            afternoon.
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="text-slate-600 text-lg leading-relaxed"
          >
            Everything you need is on this page: pick one of the six looks, put
            your brand in one config file, edit anything else with Claude Code,
            and host it free on Cloudflare Pages. No build pipelines to learn,
            no CMS, no monthly hosting bill.
          </motion.p>
        </motion.section>

        {/* ---- The journey at a glance (visual, for non-technical owners) -- */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08)}
          className="max-w-4xl mx-auto mb-24"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {JOURNEY.map((s, i) => (
              <motion.div
                key={s.title}
                variants={fadeUp}
                className="glass rounded-2xl p-4 text-center relative"
              >
                <div className="absolute top-3 left-3 w-6 h-6 rounded-full glass-pill grid place-items-center text-[11px] font-bold text-slate-500">
                  {i + 1}
                </div>
                <div className="flex justify-center mb-2 pt-1">
                  <FeatureEmoji src={s.emoji} size="md" />
                </div>
                <div className="font-clash text-sm font-semibold text-[#213856] mb-1">
                  {s.title}
                </div>
                <div className="text-[12px] text-slate-500 leading-snug">
                  {s.sub}
                </div>
              </motion.div>
            ))}
          </div>
          <motion.p
            variants={fadeUp}
            className="text-center text-[13px] text-slate-500 mt-4"
          >
            That's the whole journey — each step has its own section below, in
            order.
          </motion.p>
        </motion.section>

        {/* ---- 1. Quick start ---- */}
        <section className="max-w-4xl mx-auto mb-20">
          <SectionHeader
            number="01"
            emoji="rocket.png"
            eyebrow="Quick start"
            title="Run it on your machine"
            sub="Two things to install once, then four copy-paste commands. Ten minutes, no coding."
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="space-y-4"
          >
            <motion.div variants={fadeUp}>
              <GuideCard
                emoji="high-voltage.png"
                title="Never used a terminal? Start here"
              >
                <p>
                  The <strong>terminal</strong> is just a window where you type
                  a command and press Enter — that's all you'll do. Open it with{" "}
                  <strong>Cmd+Space → type "Terminal"</strong> on Mac, or the{" "}
                  <strong>Start menu → "PowerShell"</strong> on Windows.
                </p>
                <p>
                  First install <strong>Node.js</strong> (the engine that runs
                  the site tools): go to{" "}
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-champ-700 font-semibold hover:underline"
                  >
                    nodejs.org
                  </a>
                  , click the big green LTS button, and click through the
                  installer like any other app.
                </p>
                <p>
                  Then point the terminal at this project's folder: type{" "}
                  <code className="font-mono">cd </code>
                  (with a space), drag the project folder from Finder/Explorer
                  onto the terminal window, and press Enter. Now run the
                  commands below, one line at a time:
                </p>
              </GuideCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <CodeBlock>{`npm install        # once — installs everything the site needs
npm run dev        # opens a live preview → http://localhost:5173
npm run build      # packages the finished site into the dist/ folder
npm run preview    # double-check that finished version locally`}</CodeBlock>
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="text-sm text-slate-600 leading-relaxed"
            >
              Keep <code className="font-mono">npm run dev</code> running while
              you edit — every change shows up in the browser instantly, like
              editing a Google Doc.
            </motion.p>
          </motion.div>
        </section>

        {/* ---- 2. Pick your look ---- */}
        <section className="max-w-5xl mx-auto mb-20">
          <SectionHeader
            number="02"
            emoji="artist-palette.png"
            eyebrow="Six looks, one word"
            title="Pick your variant"
            sub={
              <>
                The template ships with six complete visual identities —
                different fonts, colours, card styles and backgrounds.{" "}
                <strong>
                  Click any screenshot below to see the whole site in that look
                </strong>{" "}
                (it opens a live preview — nothing changes until you pick). Then
                switch for real by changing ONE word in{" "}
                <code className="font-mono">src/brand.config.ts</code>:
              </>
            }
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="mb-6"
          >
            <motion.div variants={fadeUp}>
              <CodeBlock>{`theme: "${brand.theme}",   // "original" | "nebula" | "bloom" | "ember" | "tidal"`}</CodeBlock>
            </motion.div>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.05)}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {THEME_ORDER.map((n) => (
              <ThemeCard key={n} name={n} />
            ))}
            <motion.div
              variants={fadeUp}
              className="glass-sub rounded-2xl p-5 flex flex-col justify-center"
            >
              <p className="text-sm text-slate-600 leading-relaxed">
                Every theme works with <em>your</em> brand colour too — set the
                six colour stops in{" "}
                <code className="font-mono">brand.config.ts → colors</code> and
                they override the theme's default accent. Want a sixth look?
                Copy a theme object in{" "}
                <code className="font-mono">src/themes.ts</code> and tweak it.
              </p>
            </motion.div>
          </motion.div>

          {/* ---- Home-page layouts ---- */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.05)}
            className="mt-10"
          >
            <motion.h3
              variants={fadeUp}
              className="font-clash text-xl sm:text-2xl font-semibold text-[#213856] mb-2"
            >
              …and six home-page layouts
            </motion.h3>
            <motion.p
              variants={fadeUp}
              className="text-sm text-slate-600 leading-relaxed mb-5 max-w-3xl"
            >
              Separate from the look, you can change what the home page is built
              from — which sections appear, in what order, and how the top
              opens. Same one-word switch:{" "}
              <code className="font-mono">
                homeLayout: "{brand.homeLayout}"
              </code>
              . Any layout works with any theme.
            </motion.p>
            <div className="grid sm:grid-cols-3 gap-4">
              {LAYOUT_ORDER.map((n) => {
                const l = homeLayouts[n];
                const active = brand.homeLayout === n;
                return (
                  <motion.div
                    key={n}
                    variants={fadeUp}
                    className={`glass rounded-2xl p-5 flex flex-col ${
                      active ? "ring-2 ring-champ-500/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-clash text-lg font-semibold text-[#213856]">
                        {l.label}
                      </span>
                      {active && <Chip tone="accent">active</Chip>}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-3 flex-1">
                      {l.description}
                    </p>
                    {/* Section order, visualised */}
                    <div className="flex flex-wrap gap-1 mb-4" aria-hidden>
                      {["hero", ...l.sections].map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-md bg-slate-900/5 text-[10.5px] font-semibold text-slate-500"
                        >
                          {SECTION_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[12px] font-mono text-slate-500">
                        homeLayout: "{n}"
                      </code>
                      <a
                        href={`/?layout=${n}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] font-semibold text-champ-700 hover:underline whitespace-nowrap"
                      >
                        Preview live ↗
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </section>

        {/* ---- 3. Rebrand ---- */}
        <section className="max-w-4xl mx-auto mb-20">
          <SectionHeader
            number="03"
            emoji="sparkles.png"
            eyebrow="One file"
            title="Put your brand in"
            sub={
              <>
                Everything customer-facing — name, copy, pricing, FAQ, legal
                pages — flows from{" "}
                <code className="font-mono">src/brand.config.ts</code>. It's
                heavily commented; read it top to bottom once and you'll know
                the whole site.
              </>
            }
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="grid sm:grid-cols-2 gap-4"
          >
            <GuideCard emoji="books.png" title="Identity & copy">
              <p>
                Set <code className="font-mono">brandName</code>, domain, app
                URL and support email, then work through each section (hero,
                pricing tiers, FAQ…). Search the project for the string{" "}
                <code className="font-mono">YourBrand</code> if you think you
                missed a spot.
              </p>
            </GuideCard>
            <GuideCard emoji="artist-palette.png" title="Logo & images">
              <p>
                Drop your files into{" "}
                <code className="font-mono">public/brand/</code>: logo.svg,
                favicon.svg and og.svg (the social-share image). Any format
                works — update the paths in the config if you use .png.
              </p>
            </GuideCard>
            <GuideCard emoji="balance-scale.png" title="Legal pages">
              <p>
                Terms and Privacy are generated from the config's{" "}
                <code className="font-mono">legalEntity</code>,{" "}
                <code className="font-mono">legalJurisdiction</code> and{" "}
                <code className="font-mono">infrastructure</code> blocks.
                Anything in [SQUARE BRACKETS] MUST be replaced before you go
                live — and have a lawyer review both pages.
              </p>
            </GuideCard>
            <GuideCard emoji="shield.png" title="Testimonials ship empty">
              <p>
                On purpose. Add only your own reviews, with permission — never
                reuse someone else's. Leave the array empty and the whole
                section hides itself.
              </p>
            </GuideCard>
          </motion.div>
        </section>

        {/* ---- 4. Claude Code ---- */}
        <section className="max-w-4xl mx-auto mb-20">
          <SectionHeader
            number="04"
            emoji="robot.png"
            eyebrow="AI-assisted editing"
            title="Edit anything with Claude Code"
            sub="Claude Code is Anthropic's AI coding agent that runs in your terminal. This project ships pre-configured for it: it already knows the template's structure, rules and gotchas, so you can change anything in plain English — no coding needed."
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="space-y-4"
          >
            <motion.div variants={fadeUp}>
              <CodeBlock>{`npm install -g @anthropic-ai/claude-code   # install once
cd path/to/this-project
claude                                     # start it inside the project`}</CodeBlock>
            </motion.div>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              <GuideCard emoji="brain.png" title="What's packaged for you">
                <p>
                  <code className="font-mono">CLAUDE.md</code> — the project
                  briefing Claude reads automatically: architecture, where every
                  kind of change lives, and what not to touch.
                </p>
                <p>
                  <code className="font-mono">.claude/skills/</code> — guided
                  workflows you can invoke by name:{" "}
                  <code className="font-mono">/rebrand</code> (interview → your
                  whole brand filled in),{" "}
                  <code className="font-mono">/theme</code> (switch or design
                  variants) and <code className="font-mono">/deploy</code>{" "}
                  (build + ship to Cloudflare Pages).
                </p>
              </GuideCard>
              <GuideCard emoji="speech-balloon.png" title="Prompts that work">
                <p>Just describe the change:</p>
                <p className="font-mono text-[12.5px] text-slate-500 leading-relaxed">
                  "Rebrand this site to AcmeReply, domain acmereply.com, brand
                  colour #7c3aed"
                  <br />
                  "Add a fourth pricing tier called Agency at $297/mo"
                  <br />
                  "Rewrite the hero for a dental-clinic audience"
                  <br />
                  "Swap the theme to tidal and make the FAQ six questions"
                </p>
              </GuideCard>
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="text-sm text-slate-600 leading-relaxed"
            >
              After Claude makes a change, it runs{" "}
              <code className="font-mono">npm run build</code> to verify nothing
              broke — that's the safety net; the site can't deploy in a broken
              state if the build fails.
            </motion.p>
          </motion.div>
        </section>

        {/* ---- 5. Git + GitHub ---- */}
        <section className="max-w-4xl mx-auto mb-20">
          <SectionHeader
            number="05"
            emoji="package.png"
            eyebrow="Version control"
            title="Put it on GitHub"
            sub="Git gives you an undo history for every change; GitHub stores it online and is what Cloudflare Pages deploys from. One-time setup, five minutes."
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="space-y-4"
          >
            <motion.div variants={fadeUp}>
              <CodeBlock>{`# 1. one-time: install git (git-scm.com) and create a free github.com account

# 2. in the project folder — start the history and make the first snapshot
git init
git add .
git commit -m "My site — initial version"

# 3. create a PRIVATE repo on GitHub and push
#    (easiest: install GitHub's CLI from cli.github.com, then)
gh auth login
gh repo create my-site --private --source=. --push`}</CodeBlock>
            </motion.div>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              <GuideCard emoji="gear.png" title="Daily rhythm">
                <p>After every editing session:</p>
                <CodeBlock>{`git add .
git commit -m "what changed"
git push`}</CodeBlock>
                <p>
                  That's it. Each commit is a restore point, and each push
                  triggers a fresh deploy if you connect Cloudflare Pages to the
                  repo (next section).
                </p>
              </GuideCard>
              <GuideCard
                emoji="desktop-computer.png"
                title="No terminal? No problem"
              >
                <p>
                  GitHub Desktop (desktop.github.com) does all of the above with
                  buttons: File → Add local repository, then "Publish
                  repository" (keep "private" ticked), then Commit + Push after
                  each change. Claude Code can also run the git commands for you
                  — just ask it to "commit and push my changes".
                </p>
              </GuideCard>
            </motion.div>
          </motion.div>
        </section>

        {/* ---- 6. Cloudflare Pages ---- */}
        <section className="max-w-4xl mx-auto mb-20">
          <SectionHeader
            number="06"
            emoji="high-voltage.png"
            eyebrow="Free hosting"
            title="Host it free on Cloudflare Pages"
            sub="Cloudflare Pages serves static sites like this one on a global CDN, free — unlimited bandwidth, free SSL, custom domains included. Two ways to ship:"
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="space-y-4"
          >
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              <GuideCard
                emoji="handshake.png"
                title="A) Connect GitHub (recommended)"
              >
                <p>
                  1. dash.cloudflare.com → sign up free → Workers &amp; Pages →
                  Create → Pages → "Connect to Git".
                </p>
                <p>2. Authorize GitHub and pick your repo.</p>
                <p>
                  3. Build settings — framework preset <em>None</em>, build
                  command <code className="font-mono">npm run build</code>,
                  output directory <code className="font-mono">dist</code>.
                </p>
                <p>
                  4. Deploy. You get a free{" "}
                  <code className="font-mono">*.pages.dev</code> URL, and every{" "}
                  <code className="font-mono">git push</code> auto-deploys the
                  new version.
                </p>
              </GuideCard>
              <GuideCard emoji="hourglass-done.png" title="B) Direct upload">
                <p>
                  No GitHub needed — build locally and push the{" "}
                  <code className="font-mono">dist/</code> folder up:
                </p>
                <CodeBlock>{`npm run build
npx wrangler pages project create my-site
npx wrangler pages deploy dist --project-name=my-site`}</CodeBlock>
                <p>
                  (Or drag-and-drop the dist folder in the dashboard: Create →
                  Pages → "Upload assets".)
                </p>
              </GuideCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <GuideCard emoji="compass.png" title="Custom domain">
                <p>
                  In your Pages project → Custom domains → "Set up a domain". If
                  your domain already uses Cloudflare for DNS it's one click;
                  otherwise Cloudflare shows you the exact CNAME record to add
                  at your registrar. SSL is automatic. Set both{" "}
                  <code className="font-mono">yourbrand.com</code> and{" "}
                  <code className="font-mono">www</code>, and remember to put
                  the final URL in{" "}
                  <code className="font-mono">brand.config.ts → siteUrl</code>{" "}
                  and rebuild so canonical/OG tags match.
                </p>
              </GuideCard>
            </motion.div>
          </motion.div>
        </section>

        {/* ---- 7. Going further ---- */}
        <section className="max-w-4xl mx-auto">
          <SectionHeader
            number="07"
            emoji="party-popper.png"
            eyebrow="Going further"
            title="You're live — now iterate"
          />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.06)}
            className="grid sm:grid-cols-3 gap-4"
          >
            <GuideCard emoji="chart-increasing.png" title="Funnel copy">
              <p>
                Need ads, an opt-in page or an email sequence to drive traffic
                here? Ask Claude Code — it can read your whole brand config, so
                "write me 5 ad angles and a 3-email follow-up sequence matched
                to this landing page" comes back on-brand.
              </p>
            </GuideCard>
            <GuideCard emoji="calendar.png" title="Keep it fresh">
              <p>
                Update pricing, FAQ answers and screenshots as your offer
                evolves — it's one config edit + push. Stale pricing pages lose
                deals silently.
              </p>
            </GuideCard>
            <GuideCard emoji="eyes.png" title="Before you launch">
              <p>
                Checklist: [SQUARE BRACKETS] all gone, legal reviewed, your real
                WhatsApp link in <code className="font-mono">whatsAppLink</code>
                , og.svg shows your brand, and{" "}
                <code className="font-mono">siteUrl</code> matches your real
                domain.
              </p>
            </GuideCard>
          </motion.div>
        </section>
      </main>

      <Footer />
    </>
  );
}
