import { motion } from "framer-motion";
import { SPRING_SMOOTH } from "./motion";
import type { ReactNode } from "react";

export interface MessageBubbleProps {
  text: string;
  direction: "in" | "out";
  /** Group with previous bubble in the same chain - collapses the top inner corner + tighter top margin. */
  grouped?: boolean;
  /** Optional time string shown bottom-right (e.g., "14:32"). */
  time?: string;
  /** Optional leading icon (rendered inline before the text). */
  leading?: ReactNode;
}

const BUBBLE_VARIANTS = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_SMOOTH },
};

/**
 * Landing-page message bubble matching the React app's depth recipe:
 * - gradient surface (top lighter → bottom slightly darker)
 * - hairline ring border
 * - inset top highlight + tiny inset bottom shade
 * - subtle outer drop
 */
export default function MessageBubble({
  text,
  direction,
  grouped = false,
  time,
  leading,
}: MessageBubbleProps) {
  const isOut = direction === "out";

  // Same depth recipe as the React app's outbound bubble - a soft tint of the
  // active accent (13% → 24% brand over white matches the original green pair).
  const outboundStyle = {
    background:
      "var(--msg-out-bg, linear-gradient(180deg, color-mix(in srgb, rgb(var(--brand-500)) 13%, white) 0%, color-mix(in srgb, rgb(var(--brand-500)) 24%, white) 100%))",
    boxShadow:
      "var(--msg-shadow, inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 3px rgb(var(--brand-700) / 0.05), 0 1px 2px rgba(15,23,42,0.04))",
  };
  const inboundStyle = {
    background:
      "var(--msg-in-bg, linear-gradient(180deg, #F4F6FA 0%, #E5E9F0 100%))",
    boxShadow:
      "var(--msg-shadow, inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.05))",
  };

  // Tail (small bottom-inner corner) is always present per bubble.
  // Top-inner corner snaps small when grouped with previous bubble in chain.
  const outboundCorners = `rounded-tl-2xl rounded-bl-2xl rounded-br-md ${grouped ? "rounded-tr-md" : "rounded-tr-2xl"}`;
  const inboundCorners = `rounded-tr-2xl rounded-br-2xl rounded-bl-md ${grouped ? "rounded-tl-md" : "rounded-tl-2xl"}`;

  const ringCls = isOut
    ? "ring-1 ring-champ-600/20"
    : "ring-1 ring-slate-900/[0.09]";

  return (
    <motion.div
      variants={BUBBLE_VARIANTS}
      className={`flex ${isOut ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-1.5"}`}
    >
      <div
        style={isOut ? outboundStyle : inboundStyle}
        className={`relative px-3 py-1.5 max-w-[78%] ${ringCls} ${isOut ? outboundCorners : inboundCorners}`}
      >
        <p className="text-[13px] leading-snug text-[#213856] whitespace-pre-wrap break-words">
          {leading && (
            <span className="inline-flex items-center align-middle mr-1.5">
              {leading}
            </span>
          )}
          {text}
        </p>
        {time && (
          <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] tabular-nums text-slate-400">
            <span>{time}</span>
            {isOut && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 11"
                fill="none"
                className="text-champ-600"
              >
                <path
                  d="M1 5.5L4.5 9L10 2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 5.5L9.5 9L15 2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation primitives: date dividers, system event chips, gap badges, win toast.
// All use BUBBLE_VARIANTS so they cascade with the parent stagger.
// ─────────────────────────────────────────────────────────────────────────────

export function DateDivider({ label }: { label: string }) {
  return (
    <motion.div
      variants={BUBBLE_VARIANTS}
      className="flex items-center gap-3 my-3 px-1"
    >
      <div className="flex-1 h-px bg-slate-200/80" />
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
        {label}
      </div>
      <div className="flex-1 h-px bg-slate-200/80" />
    </motion.div>
  );
}

type SystemTone = "ai" | "lead" | "win" | "warn";
const SYSTEM_STYLES: Record<
  SystemTone,
  { bg: string; text: string; border: string }
> = {
  ai: {
    bg: "rgba(99,102,241,0.10)",
    text: "#4338ca",
    border: "rgba(99,102,241,0.28)",
  },
  lead: {
    bg: "rgba(15,23,42,0.05)",
    text: "#475569",
    border: "rgba(15,23,42,0.12)",
  },
  win: {
    bg: "rgb(var(--brand-500) / 0.12)",
    text: "rgb(var(--brand-700))",
    border: "rgb(var(--brand-700) / 0.30)",
  },
  warn: {
    bg: "rgba(245,158,11,0.12)",
    text: "#92400e",
    border: "rgba(245,158,11,0.30)",
  },
};

export function SystemCard({
  tone = "ai",
  label,
  icon,
}: {
  tone?: SystemTone;
  label: string;
  icon?: ReactNode;
}) {
  const s = SYSTEM_STYLES[tone];
  return (
    <motion.div
      variants={BUBBLE_VARIANTS}
      className="flex justify-center my-1.5"
    >
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: s.bg,
          color: s.text,
          border: `1px solid ${s.border}`,
        }}
      >
        {icon}
        {label}
      </div>
    </motion.div>
  );
}

/** Inline "Chat window closed - Xh no reply" indicator. */
export function ChatGapBadge({ label }: { label: string }) {
  return (
    <motion.div
      variants={BUBBLE_VARIANTS}
      className="flex justify-center my-2.5"
    >
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold text-amber-700"
        style={{
          background: "rgba(245,158,11,0.10)",
          border: "1px solid rgba(245,158,11,0.28)",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        {label}
      </div>
    </motion.div>
  );
}

/** Final outcome banner - green 3D card with trophy emoji and proud copy. */
export function WinToast({
  headline,
  sub,
}: {
  headline: string;
  sub?: string;
}) {
  return (
    <motion.div variants={BUBBLE_VARIANTS} className="mt-2 mb-5">
      <div
        className="relative rounded-xl p-3 text-white overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.10), 0 0 0 1px rgb(var(--brand-700) / 0.45), 0 12px 24px -8px rgb(var(--brand-500) / 0.55)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{
            background:
              "var(--win-sheen, linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%))",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <img
            src="/emoji/party-popper.png"
            alt=""
            className="w-7 h-7 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold leading-tight drop-shadow-sm">
              {headline}
            </div>
            {sub && (
              <div className="text-[10.5px] text-white/90 mt-0.5">{sub}</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Typing indicator bubble - pulsating dots. Participates in parent stagger. */
export function TypingBubble({ name }: { name?: string }) {
  return (
    <motion.div
      variants={BUBBLE_VARIANTS}
      className="flex justify-start items-center gap-2 mt-1.5"
    >
      <div
        style={{
          background:
            "var(--msg-in-bg, linear-gradient(180deg, #F4F6FA 0%, #E5E9F0 100%))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.05)",
        }}
        className="ring-1 ring-slate-900/[0.09] rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md px-3 py-2 inline-flex items-center gap-1.5"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-slate-400"
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      {name && (
        <span className="text-[11px] text-slate-400">{name} is typing…</span>
      )}
    </motion.div>
  );
}
