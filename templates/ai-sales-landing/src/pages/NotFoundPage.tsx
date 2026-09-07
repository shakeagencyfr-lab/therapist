/* =============================================================================
 *  /404 — pre-rendered to dist/404.html, which Cloudflare Pages (and most
 *  static hosts) serve automatically for unknown URLs. Also mounted on the
 *  catch-all route so client-side navigation to a bad path shows it too.
 * ========================================================================== */
import { Head } from "vite-react-ssg";
import { motion } from "framer-motion";
import { Nav, OrbField, Footer } from "../App";
import { fadeUp, staggerContainer } from "../lib/motion";
import brand from "../brand.config";

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>{`Page not found — ${brand.brandName}`}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <Nav />

      <main className="relative pt-40 pb-28 px-4 sm:px-6 min-h-[70vh]">
        <OrbField />
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.08)}
          className="relative max-w-2xl mx-auto text-center"
        >
          <motion.div
            variants={fadeUp}
            className="font-clash font-bold grad-text text-[6rem] sm:text-[8rem] leading-none mb-4 select-none"
            aria-hidden
          >
            404
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="font-clash text-2xl sm:text-4xl font-semibold text-[#213856] mb-4 [text-wrap:balance]"
          >
            This page wandered off.
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="text-slate-600 text-base sm:text-lg leading-relaxed mb-8"
          >
            The link is broken or the page has moved. The AI answers every
            message — the website, evidently, not every URL.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <a
              href="/"
              className="btn-primary w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2"
            >
              Back to the home page
            </a>
            <a
              href="/contact"
              className="btn-ghost w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center"
            >
              Contact us
            </a>
          </motion.div>
        </motion.div>
      </main>

      <Footer />
    </>
  );
}
