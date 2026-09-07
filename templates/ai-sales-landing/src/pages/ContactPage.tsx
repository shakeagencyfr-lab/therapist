import { Head } from "vite-react-ssg";
import { motion } from "framer-motion";
import { Nav, OrbField, Footer } from "../App";
import { fadeUp, staggerContainer, VIEWPORT_ONCE } from "../lib/motion";
import { FeatureEmoji } from "../lib/SubPagePrimitives";
import brand from "../brand.config";

const SUPPORT_EMAIL = brand.supportEmail;
const MAILTO = `mailto:${SUPPORT_EMAIL}`;
const CANONICAL = `${brand.siteUrl}/contact/`;
const TITLE = `Contact ${brand.brandName} — Talk to the AI on WhatsApp.`;
const META = `The fastest way to reach ${brand.brandName} is through our own AI sales agent on WhatsApp. Or email us at ${SUPPORT_EMAIL}.`;

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: brand.brandName,
  url: `${brand.siteUrl}/`,
  logo: `${brand.siteUrl}${brand.logo}`,
  description: brand.tagline,
  email: SUPPORT_EMAIL,
};

const CONTACT_POINT_JSONLD = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  url: CANONICAL,
  mainEntity: {
    "@type": "Organization",
    name: brand.brandName,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "Customer Service",
        email: SUPPORT_EMAIL,
      },
      {
        "@type": "ContactPoint",
        contactType: "Sales",
        email: SUPPORT_EMAIL,
      },
    ],
  },
};

function ChannelCard({
  emoji,
  title,
  body,
  ctaLabel,
  ctaHref,
  external,
  accent,
}: {
  emoji: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  external?: boolean;
  accent?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3 }}
      className={`relative rounded-3xl p-6 sm:p-7 flex flex-col h-full overflow-hidden ${
        accent
          ? "glass ring-2 ring-champ-500/60 shadow-[0_20px_60px_-20px_rgb(var(--brand-500)_/_0.45)]"
          : "glass"
      }`}
    >
      {accent && (
        <div
          aria-hidden
          className="featured-glow absolute -top-16 -right-16 w-48 h-48 rounded-full bg-champ-500/20 blur-3xl pointer-events-none"
        />
      )}
      <div className="relative flex flex-col h-full">
        <div className="mb-3">
          <FeatureEmoji src={emoji} size="md" />
        </div>
        <h3 className="font-clash text-xl font-semibold text-[#213856] mb-2">
          {title}
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed flex-1 mb-5">
          {body}
        </p>
        <a
          href={ctaHref}
          {...(external ? { target: "_blank", rel: "noopener" } : {})}
          className={
            accent
              ? "btn-primary text-sm font-semibold px-4 py-2.5 rounded-xl text-center inline-flex items-center justify-center gap-2"
              : "btn-ghost text-sm font-semibold px-4 py-2.5 rounded-xl text-center inline-flex items-center justify-center gap-2"
          }
        >
          {ctaLabel}
        </a>
      </div>
    </motion.div>
  );
}

export default function ContactPage() {
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
          {JSON.stringify(CONTACT_POINT_JSONLD)}
        </script>
      </Head>

      <Nav ctaLabel={brand.nav.ctaLabel} ctaHref={brand.nav.ctaHref} />
      <div className="orb-stage relative">
        <OrbField />

        {/* ============== HERO ============== */}
        <section className="relative pt-32 sm:pt-40 pb-12 sm:pb-16">
          <motion.div
            className="relative max-w-4xl mx-auto px-5 sm:px-6 text-center"
            initial="hidden"
            animate="visible"
            variants={staggerContainer(0.08)}
          >
            <motion.div
              variants={fadeUp}
              className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4"
            >
              Talk to us
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-grotesk text-3xl sm:text-5xl lg:text-[3.25rem] font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
            >
              The Fastest Way to Reach Us Is{" "}
              <span className="grad-text">Through Our Own AI.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-8"
            >
              The same AI sales agent we offer you handles every inbound
              conversation here. Message it on WhatsApp and you will get an
              answer in seconds. Want a human instead? Email us. Either way, you
              will hear back.
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <a
                href={brand.whatsAppLink}
                target="_blank"
                rel="noopener"
                className="btn-primary pulse-glow w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2"
              >
                Talk to the AI on WhatsApp
              </a>
              <a
                href={MAILTO}
                className="btn-ghost w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2"
              >
                Email {SUPPORT_EMAIL}
              </a>
            </motion.div>
          </motion.div>
        </section>

        {/* ============== CHANNELS ============== */}
        <section className="relative py-14 sm:py-18">
          <div className="max-w-5xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_ONCE}
              variants={staggerContainer(0.08)}
              className="text-center mb-10"
            >
              <motion.div
                variants={fadeUp}
                className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-3"
              >
                Pick your channel
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="font-clash text-3xl sm:text-4xl font-semibold leading-tight text-[#213856]"
              >
                Three Ways to Get In Touch
              </motion.h2>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_ONCE}
              variants={staggerContainer(0.06)}
              className="grid md:grid-cols-3 gap-4"
            >
              <ChannelCard
                emoji="speech-balloon.png"
                title="Talk to the AI on WhatsApp"
                body="The fastest path. Our own AI sales agent answers in seconds, handles your questions, books a call and hands you off to a human when it matters."
                ctaLabel="Message on WhatsApp"
                ctaHref={brand.whatsAppLink}
                accent
                external
              />
              <ChannelCard
                emoji="envelope.png"
                title="Email the team"
                body={`Prefer email? Send anything to ${SUPPORT_EMAIL} — sales, support, billing, press, all the same address. We reply within one business day.`}
                ctaLabel={SUPPORT_EMAIL}
                ctaHref={MAILTO}
              />
              <ChannelCard
                emoji="books.png"
                title="Read the docs first"
                body="The Help Centre has full walkthroughs for setup, channels, AI training and more. It answers most questions in a couple of minutes."
                ctaLabel="Open Help Centre"
                ctaHref={brand.helpUrl}
                external
              />
            </motion.div>
          </div>
        </section>

        {/* ============== WHAT TO EXPECT ============== */}
        <section className="relative py-14 sm:py-18 bg-slate-50/40">
          <div className="max-w-3xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_ONCE}
              variants={staggerContainer(0.08)}
            >
              <motion.div
                variants={fadeUp}
                className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-3"
              >
                What to expect
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="font-clash text-2xl sm:text-3xl font-semibold leading-tight text-[#213856] mb-6"
              >
                Replies in Seconds. Humans in the Loop.
              </motion.h2>
              <motion.div
                variants={fadeUp}
                className="grid sm:grid-cols-2 gap-3"
              >
                {[
                  {
                    h: "Instant AI response",
                    b: "Our AI sales agent picks up immediately and handles most questions without a human ever touching the conversation.",
                  },
                  {
                    h: "Human handoff when needed",
                    b: "Anything complex or sensitive gets passed to a person, who takes over within hours during business days.",
                  },
                  {
                    h: "One business day on email",
                    b: `${SUPPORT_EMAIL} is monitored by the team. We aim for under 24h on every reply.`,
                  },
                  {
                    h: "Help when you need it",
                    b: "Browse the Help Centre any time for step-by-step guides, or reach out and we will point you in the right direction.",
                  },
                ].map((item) => (
                  <div key={item.h} className="glass rounded-2xl p-4 sm:p-5">
                    <h3 className="font-clash text-base font-semibold text-[#213856] mb-1">
                      {item.h}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {item.b}
                    </p>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ============== COMPANY ============== */}
        <section className="relative py-14 sm:py-18">
          <div className="max-w-3xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_ONCE}
              variants={staggerContainer(0.08)}
            >
              <motion.div
                variants={fadeUp}
                className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-3"
              >
                Company
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="font-clash text-2xl sm:text-3xl font-semibold leading-tight text-[#213856] mb-6"
              >
                Who You Are Reaching
              </motion.h2>
              <motion.div
                variants={fadeUp}
                className="glass rounded-3xl p-6 sm:p-7"
              >
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <dt className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] mb-1">
                      Legal name
                    </dt>
                    <dd className="text-[#213856] font-semibold">
                      {brand.legalEntity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] mb-1">
                      Jurisdiction
                    </dt>
                    <dd className="text-[#213856] font-semibold">
                      {brand.legalJurisdiction}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] mb-1">
                      Email
                    </dt>
                    <dd className="text-[#213856] font-semibold">
                      <a
                        href={MAILTO}
                        className="hover:text-champ-700 transition-colors"
                      >
                        {SUPPORT_EMAIL}
                      </a>
                    </dd>
                  </div>
                </dl>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ============== BOTTOM CTA ============== */}
        <section className="relative py-16 sm:py-20">
          <div className="max-w-3xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_ONCE}
              className="glass rounded-[28px] p-8 sm:p-12 text-center relative overflow-hidden"
            >
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(80% 60% at 50% 0%, rgb(var(--brand-500) / 0.10) 0%, transparent 70%)",
                }}
              />
              <div className="relative">
                <h2 className="font-clash text-2xl sm:text-3xl font-semibold leading-tight text-[#213856] mb-3 [text-wrap:balance]">
                  Done reading?{" "}
                  <span className="grad-text">Talk to the AI.</span>
                </h2>
                <p className="text-slate-600 mb-6 max-w-xl mx-auto">
                  Five minutes in WhatsApp with our agent beats five minutes on
                  this page. You will see exactly what your customers will see.
                </p>
                <a
                  href={brand.whatsAppLink}
                  target="_blank"
                  rel="noopener"
                  className="btn-primary inline-flex items-center justify-center gap-2 text-base font-semibold px-6 py-3.5 rounded-2xl"
                >
                  Open the WhatsApp demo
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
