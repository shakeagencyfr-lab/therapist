// Shared visual primitives used by the sub-pages (Pricing, Contact).
// Kept out of App.tsx so the home page stays visually self-contained.

import { motion } from "framer-motion";
import { fadeUp, popIn, staggerContainer, VIEWPORT_ONCE } from "./motion";

/* ============================================================
 * FeatureEmoji
 * Same component shape as the home page version, re-exported
 * so sub-pages don't need to reach into App.tsx for it.
 *
 * Animation strategy: where Microsoft ships an official animated APNG
 * (downloaded under public/emoji-animated/ by scripts/download-animated-emojis.mjs)
 * we serve that; the remaining static PNGs get a subtle CSS-driven
 * "breathing" loop so the whole site reads as alive without per-emoji
 * asset work.
 * ============================================================ */
export const ANIMATED_EMOJIS = new Set([
  "alarm-clock.png",
  "brain.png",
  "calendar.png",
  "compass.png",
  "eyes.png",
  "flexed-biceps.png",
  "handshake.png",
  "high-voltage.png",
  "hourglass-done.png",
  "hourglass-not-done.png",
  "party-popper.png",
  "robot.png",
  "rocket.png",
  "snowflake.png",
  "telephone.png",
  "tooth.png",
]);

// Stable per-emoji phase offset (0-1) so a grid of static emojis pulses
// out-of-sync instead of in lockstep. Hash is FNV-1a-ish, deterministic.
function emojiPhase(src: string): number {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function FeatureEmoji({
  src,
  size = "lg",
}: {
  src: string;
  size?: "lg" | "md" | "sm";
}) {
  const isAnimated = ANIMATED_EMOJIS.has(src);
  const path = isAnimated ? `/emoji-animated/${src}` : `/emoji/${src}`;
  return (
    <img
      className={`femoji femoji-${size} ${isAnimated ? "femoji-animated" : "femoji-static"}`}
      src={path}
      alt=""
      loading="lazy"
      decoding="async"
      style={
        isAnimated
          ? undefined
          : ({
              "--femoji-phase": emojiPhase(src).toFixed(3),
            } as React.CSSProperties)
      }
    />
  );
}

/* ============================================================
 * SectionHeader
 * Numbered chip + emoji + eyebrow + H2 + optional sub-paragraph.
 * The visual signature for sub-page sections.
 * ============================================================ */
export function SectionHeader({
  number,
  eyebrow,
  emoji,
  title,
  titleAccent,
  sub,
  align = "left",
  maxWidth = "max-w-3xl",
}: {
  number?: string;
  eyebrow?: string;
  emoji?: string;
  title: React.ReactNode;
  titleAccent?: string;
  sub?: React.ReactNode;
  align?: "left" | "center";
  maxWidth?: string;
}) {
  const isCenter = align === "center";
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={staggerContainer(0.06)}
      className={`${maxWidth} ${isCenter ? "mx-auto text-center" : ""} mb-10`}
    >
      {(number || emoji || eyebrow) && (
        <motion.div
          variants={fadeUp}
          className={`flex items-center gap-3 mb-4 ${isCenter ? "justify-center" : ""}`}
        >
          {number && (
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl glass-pill font-clash text-sm font-bold text-champ-700 stat-num">
              {number}
            </span>
          )}
          {emoji && <FeatureEmoji src={emoji} size="md" />}
          {eyebrow && (
            <span className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold">
              {eyebrow}
            </span>
          )}
        </motion.div>
      )}
      <motion.h2
        variants={fadeUp}
        className="font-clash text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold leading-[1.1] text-[#213856] mb-4 [text-wrap:balance]"
      >
        {title}
        {titleAccent && (
          <>
            {" "}
            <span className="grad-text">{titleAccent}</span>
          </>
        )}
      </motion.h2>
      {sub && (
        <motion.p
          variants={fadeUp}
          className={`text-slate-600 text-lg leading-relaxed ${isCenter ? "max-w-2xl mx-auto" : ""}`}
        >
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}

/* ============================================================
 * StatChipRow
 * Inline row of stat callouts: big number + label.
 * ============================================================ */
export function StatChipRow({
  stats,
  className = "",
}: {
  stats: Array<{ value: string; label: string; accent?: boolean }>;
  className?: string;
}) {
  // Static class lookup so Tailwind JIT picks the right column count.
  // (Dynamic `sm:grid-cols-${n}` strings get purged.)
  const colMap: Record<number, string> = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
  };
  const cols =
    colMap[Math.min(Math.max(stats.length, 1), 4)] ?? "sm:grid-cols-4";
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={staggerContainer(0.06)}
      className={`grid grid-cols-2 ${cols} gap-3 ${className}`}
    >
      {stats.map((s, i) => (
        <motion.div
          key={i}
          variants={popIn}
          className={`glass rounded-2xl p-4 sm:p-5 text-center`}
        >
          <div
            className={`font-clash text-2xl sm:text-3xl font-semibold stat-num leading-none mb-1.5 ${
              s.accent ? "grad-text" : "text-[#213856]"
            }`}
          >
            {s.value}
          </div>
          <div className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 font-medium">
            {s.label}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ============================================================
 * EcosystemDiagram
 * Hero accent: 3 mini cards connected by arrows. Subtle.
 * ============================================================ */
export function EcosystemDiagram({
  nodes,
}: {
  nodes: Array<{ emoji?: string; title: string; sub: string }>;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={staggerContainer(0.08)}
      className="flex flex-col md:flex-row items-stretch justify-center gap-3 md:gap-2 max-w-4xl mx-auto"
    >
      {nodes.map((n, i) => (
        <div key={i} className="contents">
          <motion.div
            variants={popIn}
            className="glass rounded-2xl p-4 sm:p-5 flex-1 text-center min-w-0"
          >
            {n.emoji && (
              <div className="mb-2 flex justify-center">
                <FeatureEmoji src={n.emoji} size="md" />
              </div>
            )}
            <div className="font-clash text-sm sm:text-base font-semibold text-[#213856] mb-1 leading-tight">
              {n.title}
            </div>
            <div className="text-xs text-slate-500 leading-snug">{n.sub}</div>
          </motion.div>
          {i < nodes.length - 1 && (
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-center text-champ-600 shrink-0"
              aria-hidden
            >
              <span className="md:hidden text-xl">↓</span>
              <span className="hidden md:block text-xl">→</span>
            </motion.div>
          )}
        </div>
      ))}
    </motion.div>
  );
}

/* ============================================================
 * MiniFlow
 * Tiny inline 3-step horizontal flow inside a card (lighter than EcosystemDiagram)
 * ============================================================ */
export function MiniFlow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-4">
      {steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-champ-500/10 text-champ-700 text-[11px] font-semibold tracking-wide">
            {s}
          </span>
          {i < steps.length - 1 && (
            <span className="text-champ-600 text-xs">→</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ============================================================
 * Timeline
 * Vertical connector with dots, each step as a card to the right.
 * ============================================================ */
export function Timeline({
  steps,
}: {
  steps: Array<{ emoji?: string; title: string; body: string }>;
}) {
  return (
    <motion.ol
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={staggerContainer(0.06)}
      className="relative"
    >
      {/* The line */}
      <div
        aria-hidden
        className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-champ-500/60 via-champ-500/30 to-transparent"
      />
      {steps.map((step, i) => (
        <motion.li
          key={i}
          variants={fadeUp}
          className="relative flex gap-5 pb-5 last:pb-0"
        >
          {/* Dot */}
          <div className="relative shrink-0 z-10">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm font-clash text-sm font-bold text-champ-700 stat-num">
              {String(i + 1).padStart(2, "0")}
            </span>
          </div>
          {/* Card */}
          <div className="flex-1 glass rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-3">
              {step.emoji && (
                <div className="shrink-0 mt-0.5">
                  <FeatureEmoji src={step.emoji} size="sm" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-clash text-base sm:text-lg font-semibold text-[#213856] mb-1 leading-snug">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {step.body}
                </p>
              </div>
            </div>
          </div>
        </motion.li>
      ))}
    </motion.ol>
  );
}

/* ============================================================
 * Chip
 * Single small chip element for use inside cards.
 * ============================================================ */
export function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "accent";
}) {
  const base =
    tone === "accent"
      ? "bg-champ-500/10 text-champ-700"
      : "bg-slate-100/80 text-slate-600";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide ${base}`}
    >
      {children}
    </span>
  );
}
