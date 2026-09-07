import { Head } from "vite-react-ssg";
import { motion } from "framer-motion";
import { Nav, OrbField, Pricing, FAQSection, FinalCta, Footer } from "../App";
import { fadeUp, popIn, staggerContainer, VIEWPORT_ONCE } from "../lib/motion";
import { SectionHeader, FeatureEmoji } from "../lib/SubPagePrimitives";
import brand from "../brand.config";

const CANONICAL = `${brand.siteUrl}/pricing/`;
const TITLE = `${brand.brandName} Pricing — Plans that scale with you.`;
const META =
  "Simple, transparent pricing for your AI sales agent. Start free, upgrade when it is closing more than it costs, and cancel anytime.";

// Pull the detailed FAQ from the brand config — one file to edit.
const PRICING_FAQS: Array<[string, string]> = brand.faq.items;

// Neutral, end-customer-facing "what's included" highlights. Edit these in code
// or swap for your own copy.
const INCLUDED_LIST: Array<{ t: string; b: string }> = [
  {
    t: "Every channel, one inbox",
    b: "Connect WhatsApp, Instagram, Messenger, web chat and SMS. Every conversation lands in a single place.",
  },
  {
    t: "Replies around the clock",
    b: "Your AI sales agent answers in seconds, day or night, in your brand voice and your customer's language.",
  },
  {
    t: "Books and follows up",
    b: "It qualifies leads, handles questions, books appointments and follows up so nothing slips through the cracks.",
  },
  {
    t: "Free trial on every plan",
    b: "Connect a channel and run the AI on real conversations before billing starts. No card required to begin.",
  },
];

const SCALE_LIST: Array<{ t: string; b: string }> = [
  {
    t: "Start small",
    b: "Begin on a single channel and let the AI prove itself on real conversations first.",
  },
  {
    t: "Add channels as you grow",
    b: "Turn on more channels and features whenever you are ready — no migration, no re-training.",
  },
  {
    t: "Upgrade when it pays for itself",
    b: "Move up a plan once the AI is booking and closing more than the subscription costs.",
  },
  {
    t: "No contracts",
    b: "Every plan is billed monthly. Downgrade or cancel from your dashboard anytime.",
  },
];

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: brand.brandName,
  url: `${brand.siteUrl}/`,
  logo: `${brand.siteUrl}${brand.logo}`,
  description: brand.tagline,
};

const SOFTWARE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: brand.brandName,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: META,
  url: CANONICAL,
  offers: brand.pricing.tiers.map((tier) => ({
    "@type": "Offer",
    name: tier.name,
    price: tier.price.replace(/[^0-9.]/g, "") || undefined,
    priceCurrency: "USD",
    url: CANONICAL,
  })),
};

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: PRICING_FAQS.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={META} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={META} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta
          property="og:image"
          content={`${brand.siteUrl}${brand.ogImage}`}
        />
        <meta property="og:image:width" content="1280" />
        <meta property="og:image:height" content="720" />
        <meta name="twitter:description" content={META} />
        <meta
          name="twitter:image"
          content={`${brand.siteUrl}${brand.ogImage}`}
        />
        <script type="application/ld+json">{JSON.stringify(ORG_JSONLD)}</script>
        <script type="application/ld+json">
          {JSON.stringify(SOFTWARE_JSONLD)}
        </script>
        <script type="application/ld+json">{JSON.stringify(FAQ_JSONLD)}</script>
      </Head>

      <Nav ctaLabel={brand.nav.ctaLabel} ctaHref={brand.nav.ctaHref} />

      <div className="orb-stage relative">
        <OrbField />

        {/* ============== HERO ============== */}
        <section className="relative pt-32 sm:pt-40 pb-12 sm:pb-16">
          <motion.div
            className="relative max-w-5xl mx-auto px-5 sm:px-6"
            initial="hidden"
            animate="visible"
            variants={staggerContainer(0.08)}
          >
            <motion.div variants={fadeUp} className="flex justify-center mb-5">
              <FeatureEmoji src="money-wings.png" size="lg" />
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-grotesk text-center text-3xl sm:text-5xl lg:text-[3.25rem] font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
            >
              {brand.pricing.heading}{" "}
              <span className="grad-text">{brand.pricing.eyebrow}</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-center text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-2"
            >
              {brand.pricing.subheading} {brand.pricing.note}
            </motion.p>
          </motion.div>
        </section>

        {/* ============== EXISTING PRICING COMPONENT ============== */}
        <Pricing />

        {/* ============== WHAT'S INCLUDED ============== */}
        <section className="relative py-16 sm:py-20 bg-slate-50/40">
          <div className="max-w-5xl mx-auto px-6">
            <SectionHeader
              eyebrow="What you get"
              emoji="brain.png"
              title="Everything you need"
              titleAccent="in every plan"
              sub="No hidden tiers, no surprises. Every plan includes a free trial and the channels your customers already use."
              align="center"
              maxWidth="max-w-3xl"
            />

            <div className="grid md:grid-cols-2 gap-5">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_ONCE}
                className="glass rounded-3xl p-6 sm:p-7"
              >
                <div className="flex items-center gap-3 mb-4">
                  <FeatureEmoji src="high-voltage.png" size="sm" />
                  <div className="text-xs uppercase tracking-wider text-champ-700 font-bold">
                    Included
                  </div>
                </div>
                <h3 className="font-clash text-xl font-semibold text-[#213856] mb-5">
                  A working AI sales agent, out of the box.
                </h3>
                <motion.ul
                  initial="hidden"
                  whileInView="visible"
                  viewport={VIEWPORT_ONCE}
                  variants={staggerContainer(0.04)}
                  className="space-y-3"
                >
                  {INCLUDED_LIST.map((item) => (
                    <motion.li
                      key={item.t}
                      variants={popIn}
                      className="flex items-start gap-3"
                    >
                      <span className="accent-glow shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-champ-500 text-white shadow-md shadow-champ-500/30 mt-0.5">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <div>
                        <div className="font-clash text-sm font-semibold text-[#213856] mb-0.5">
                          {item.t}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {item.b}
                        </p>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_ONCE}
                transition={{ delay: 0.05 }}
                className="glass rounded-3xl p-6 sm:p-7"
              >
                <div className="flex items-center gap-3 mb-4">
                  <FeatureEmoji src="link.png" size="sm" />
                  <div className="text-xs uppercase tracking-wider text-champ-700 font-bold">
                    Pricing that scales with you
                  </div>
                </div>
                <h3 className="font-clash text-xl font-semibold text-[#213856] mb-5">
                  Pay for what you need, when you need it.
                </h3>
                <motion.ul
                  initial="hidden"
                  whileInView="visible"
                  viewport={VIEWPORT_ONCE}
                  variants={staggerContainer(0.04)}
                  className="space-y-3"
                >
                  {SCALE_LIST.map((item) => (
                    <motion.li
                      key={item.t}
                      variants={popIn}
                      className="flex items-start gap-3"
                    >
                      <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-500 mt-0.5">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </span>
                      <div>
                        <div className="font-clash text-sm font-semibold text-[#213856] mb-0.5">
                          {item.t}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {item.b}
                        </p>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ============== PRICING FAQ ============== */}
        <FAQSection items={PRICING_FAQS} heading={brand.faq.heading} />

        {/* ============== FINAL CTA ============== */}
        <FinalCta
          headline={brand.finalCta.headline}
          subhead={brand.finalCta.subhead}
          primaryHref={brand.finalCta.ctaHref}
          primaryLabel={brand.finalCta.ctaLabel}
          primaryLabelMobile={brand.finalCta.ctaLabel}
        />

        {/* ============== FOOTER ============== */}
        <Footer />
      </div>
    </>
  );
}
