import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { SPRING_SMOOTH, SPRING_SNAP } from "./motion";

// Tiny inline icons (avoids pulling in a full icon set just for the demos).
const ICheck = ({ s = 12 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ISparkle = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2 9.1 8.5 2 9.3l5 4.9L5.8 22 12 18.3 18.2 22 17 14.2l5-4.9-7.1-.8z" />
  </svg>
);
const IGlobe = ({ s = 14 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </svg>
);
const IBolt = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" />
  </svg>
);

// Hook that flips once the element scrolls into view (no rerun on exit).
function useEnterOnce(amount = 0.3) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });
  return { ref, inView };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// ════════════════════════════════════════════════════════════════════════════
// Step 01 - paste URL, AI generates, four data points stream in. Cycles 3 URLs.
// ════════════════════════════════════════════════════════════════════════════
const STEP1_URLS = [
  "https://aurora-clinic.com",
  "https://atelier-21.studio",
  "https://goldcrest-realty.com",
];
const STEP1_DETECTED = ["Products", "Pricing", "FAQ", "Tone of voice"];

export function TypingScanDemo() {
  const { ref, inView } = useEnterOnce();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<
    "typing" | "generating" | "found" | "erasing"
  >("typing");
  const [foundCount, setFoundCount] = useState(0);
  const [urlIdx, setUrlIdx] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const url = STEP1_URLS[urlIdx]!;

    const loop = async () => {
      setPhase("typing");
      setTyped("");
      setFoundCount(0);
      for (let i = 1; i <= url.length; i++) {
        await sleep(55);
        if (cancelled) return;
        setTyped(url.slice(0, i));
      }
      await sleep(420);
      if (cancelled) return;
      setPhase("generating");
      await sleep(900);
      if (cancelled) return;
      setPhase("found");
      for (let i = 1; i <= STEP1_DETECTED.length; i++) {
        await sleep(220);
        if (cancelled) return;
        setFoundCount(i);
      }
      await sleep(1500);
      if (cancelled) return;
      setPhase("erasing");
      for (let i = url.length; i >= 0; i--) {
        await sleep(28);
        if (cancelled) return;
        setTyped(url.slice(0, i));
      }
      await sleep(280);
      if (cancelled) return;
      setUrlIdx((idx) => (idx + 1) % STEP1_URLS.length);
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [inView, urlIdx]);

  const generating = phase === "generating" || phase === "found";

  return (
    <div ref={ref} className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div
          className="flex-1 min-w-0 flex items-center gap-2 px-3 rounded-lg bg-white text-[12px] font-mono text-slate-700 min-h-[44px] overflow-hidden"
          style={{
            border: "1px solid rgba(15,23,42,0.10)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          <span className="text-slate-400 shrink-0">
            <IGlobe s={12} />
          </span>
          <span className="truncate flex-1">{typed}</span>
          {phase === "typing" || phase === "erasing" ? (
            <span className="inline-block w-[2px] h-[12px] bg-champ-600 caret-blink shrink-0" />
          ) : null}
        </div>
        <button
          className={`shrink-0 px-2.5 py-2 rounded-lg text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap ${generating ? "pulse-glow" : ""}`}
          style={{
            background:
              "linear-gradient(180deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px rgb(var(--brand-700) / 0.4), 0 4px 10px -4px rgb(var(--brand-500) / 0.5)",
          }}
        >
          <ISparkle s={11} />
          {phase === "generating" ? "Generating…" : "Generate"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 min-h-[44px]">
        {STEP1_DETECTED.map((label, i) => {
          const shown = i < foundCount;
          return (
            <motion.div
              key={label}
              animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 6 }}
              transition={{ ...SPRING_SMOOTH, delay: shown ? 0.04 : 0 }}
              className="flex items-center gap-1.5 text-[11px] text-slate-700"
            >
              <span className="text-champ-600">
                <ICheck s={11} />
              </span>
              {label}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Step 02 - channel rows with brand-icon avatars + sliding toggle switches.
// ════════════════════════════════════════════════════════════════════════════
type Ch = { name: string; bg: string; icon: React.ReactNode };

const CH_LIST: Ch[] = [
  {
    name: "WhatsApp",
    bg: "#25D366",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
        <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.4-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4M12 2A10 10 0 0 0 2 12c0 1.8.5 3.5 1.4 5L2 22l5.2-1.4A10 10 0 1 0 12 2" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    bg: "linear-gradient(135deg,#833AB4 0%,#E4405F 50%,#F77737 100%)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
        <path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.2.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1-3.2 0-3.6 0-4.8-.1-3.3-.2-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8 0-3.2 0-3.6.1-4.8.1-3.2 1.7-4.8 4.9-4.9 1.2-.1 1.6-.1 4.8-.1M12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0m0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4m0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9" />
      </svg>
    ),
  },
  {
    name: "Messenger",
    bg: "#0084FF",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
        <path d="M12 0C5.4 0 0 5 0 11.1c0 3.5 1.7 6.6 4.5 8.6V24l4.1-2.2c1.1.3 2.2.5 3.4.5 6.6 0 12-5 12-11.1S18.6 0 12 0m1.2 15-3.1-3.3-6 3.3 6.6-7 3.1 3.3 6-3.3-6.6 7" />
      </svg>
    ),
  },
  {
    name: "Web chat",
    bg: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    name: "SMS",
    bg: "#0EA5E9",
    icon: (
      <span className="text-[9px] font-bold text-white tracking-tight">
        SMS
      </span>
    ),
  },
];

export function ChannelToggleDemo() {
  const { ref, inView } = useEnterOnce();
  const [onCount, setOnCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        setOnCount(0);
        await sleep(450);
        for (let i = 1; i <= CH_LIST.length; i++) {
          if (cancelled) return;
          setOnCount(i);
          await sleep(420);
        }
        await sleep(2000);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  return (
    <div ref={ref} className="space-y-1.5">
      {CH_LIST.map((c, i) => {
        const on = i < onCount;
        return (
          <div
            key={c.name}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/85"
            style={{
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: c.bg }}
              >
                {c.icon}
              </span>
              <span className="text-[12px] font-medium text-[#213856]">
                {c.name}
              </span>
            </div>
            <motion.span
              className={`relative w-8 h-4 rounded-full block transition-colors duration-300 ${on ? "bg-champ-600" : "bg-slate-300"}`}
            >
              <motion.span
                animate={{ x: on ? 18 : 2 }}
                transition={SPRING_SNAP}
                className="absolute top-0.5 left-0 w-3 h-3 rounded-full bg-white shadow"
              />
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Step 03 - live inbox: status pulse + cycling lead → typing → AI reply.
// ════════════════════════════════════════════════════════════════════════════
const STEP3_FLOW = [
  {
    lead: "Hi, I'd like to learn more",
    reply: "Happy to help! Which service interests you?",
  },
  {
    lead: "How much for the package?",
    reply: "Happy to break it down — want me to send the full pricing?",
  },
  {
    lead: "Can I book a call this week?",
    reply: "Sure. I have Thursday 14:00 free. Lock it in?",
  },
  {
    lead: "Do you ship to NL?",
    reply: "Yes, free over $50. Want our bestsellers?",
  },
  {
    lead: "Is there a refund policy?",
    reply: "30-day full refund, no questions. Want me to send the link?",
  },
  {
    lead: "Honestly, it's a bit pricey…",
    reply:
      "Totally hear you. Most clients break even by week 3. Want the case study?",
  },
];

export function LiveInboxDemo() {
  const { ref, inView } = useEnterOnce();
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<"inbound" | "typing" | "reply">("inbound");

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        setStage("inbound");
        await sleep(1100);
        if (cancelled) return;
        setStage("typing");
        await sleep(950);
        if (cancelled) return;
        setStage("reply");
        await sleep(2300);
        if (cancelled) return;
        setIdx((v) => (v + 1) % STEP3_FLOW.length);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  const ex = STEP3_FLOW[idx]!;
  return (
    <div ref={ref} className="space-y-2">
      <div
        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/85"
        style={{
          border: "1px solid rgba(15,23,42,0.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
        }}
      >
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          Status
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-champ-700">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-champ-500 animate-ping opacity-60" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-champ-500" />
          </span>
          Active · live inbox
        </span>
      </div>

      <div className="min-h-[140px] sm:min-h-[110px] flex flex-col gap-1.5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`in-${idx}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={SPRING_SNAP}
            className="flex justify-start"
          >
            <div
              className="max-w-[80%] rounded-2xl rounded-bl-md px-2.5 py-1.5 text-[12px] text-[#213856]"
              style={{
                background:
                  "var(--msg-in-bg, linear-gradient(180deg,#FBFCFE 0%,#EEF1F6 100%))",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
              }}
            >
              {ex.lead}
            </div>
          </motion.div>

          {stage === "typing" && (
            <motion.div
              key={`typing-${idx}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAP}
              className="flex justify-end"
            >
              <div
                className="rounded-2xl rounded-br-md px-2.5 py-2 inline-flex items-center gap-1"
                style={{
                  background:
                    "var(--typing-bg, linear-gradient(180deg, color-mix(in srgb, rgb(var(--brand-500)) 45%, white) 0%, color-mix(in srgb, rgb(var(--brand-500)) 75%, white) 100%))",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/80"
                    animate={{ y: [0, -2.5, 0] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {stage === "reply" && (
            <motion.div
              key={`re-${idx}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAP}
              className="flex justify-end"
            >
              <div
                className="max-w-[80%] rounded-2xl rounded-br-md px-2.5 py-1.5 text-[12px] text-[#213856]"
                style={{
                  background:
                    "var(--msg-out-bg, linear-gradient(180deg, color-mix(in srgb, rgb(var(--brand-500)) 13%, white) 0%, color-mix(in srgb, rgb(var(--brand-500)) 24%, white) 100%))",
                  border: "1px solid rgb(var(--brand-700) / 0.18)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
                }}
              >
                {ex.reply}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-1 pt-0.5">
        {STEP3_FLOW.map((_, i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full transition-colors"
            style={{
              background: i === idx ? "rgb(var(--brand-600))" : "#cbd5e1",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Step 04 - live revenue ticker with floating +$ flashes and an optimize CTA.
// ════════════════════════════════════════════════════════════════════════════
type Flash = { id: number; amount: number };

export function RevenueTickerDemo() {
  const { ref, inView } = useEnterOnce();
  const [value, setValue] = useState(2847);
  const [pulse, setPulse] = useState(false);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const flashId = useRef(0);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const inc = 0.5 + Math.random() * 2.4;
      setValue((v) => (v + inc >= 3550 ? 2847 : v + inc));
      setPulse(true);
      setTimeout(() => setPulse(false), 280);
      setTimeout(tick, 700 + Math.random() * 600);
    };
    const t = setTimeout(tick, 600);

    const flash = setInterval(() => {
      if (cancelled) return;
      flashId.current += 1;
      const amt = 60 + Math.round(Math.random() * 240);
      const f: Flash = { id: flashId.current, amount: amt };
      setFlashes((prev) => [...prev, f]);
      setTimeout(
        () => setFlashes((prev) => prev.filter((x) => x.id !== f.id)),
        1700,
      );
    }, 2400);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(flash);
    };
  }, [inView]);

  return (
    <div ref={ref} className="relative">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        This week
      </div>
      <div className="relative">
        <motion.div
          animate={{ scale: pulse ? 1.02 : 1 }}
          transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
          className="font-clash text-3xl font-semibold text-[#213856] tabular-nums mb-3"
        >
          ${Math.floor(value).toLocaleString()}
        </motion.div>

        <div className="absolute top-0 right-0 pointer-events-none">
          <AnimatePresence>
            {flashes.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0, 1, 1, 0], y: [-2, -10, -22, -36] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, times: [0, 0.15, 0.7, 1] }}
                className="text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{
                  color: "rgb(var(--brand-700))",
                  background: "rgb(var(--brand-50))",
                  border: "1px solid rgb(var(--brand-700) / 0.25)",
                }}
              >
                +${f.amount}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <button
        className="pulse-glow w-full px-3 py-2 rounded-lg text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px rgb(var(--brand-700) / 0.4), 0 8px 18px -8px rgb(var(--brand-500) / 0.5)",
        }}
      >
        <IBolt s={12} />
        One-click optimize
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Feature card - animated calendar: AI books a slot, confirms, picks next.
// ════════════════════════════════════════════════════════════════════════════
const APPT_SLOTS = ["Tue 11:00", "Tue 14:30", "Wed 09:00", "Thu 16:00"];

export function AppointmentDemo() {
  const { ref, inView } = useEnterOnce();
  const [booking, setBooking] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let pickIdx = 1;
    const loop = async () => {
      while (!cancelled) {
        setBooking(null);
        setConfirmed(null);
        await sleep(700);
        if (cancelled) return;
        setBooking(pickIdx);
        await sleep(900);
        if (cancelled) return;
        setConfirmed(pickIdx);
        setBooking(null);
        await sleep(2400);
        if (cancelled) return;
        pickIdx =
          (pickIdx + 1 + Math.floor(Math.random() * 2)) % APPT_SLOTS.length;
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  return (
    <div ref={ref} className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        Available slots
      </div>
      {APPT_SLOTS.map((s, i) => {
        const isBooking = booking === i;
        const isConfirmed = confirmed === i;
        const active = isBooking || isConfirmed;
        return (
          <motion.div
            key={s}
            animate={{ scale: active ? 1.02 : 1 }}
            transition={SPRING_SMOOTH}
            className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
            style={{
              background: active
                ? "rgb(var(--brand-500) / 0.10)"
                : "rgba(255,255,255,0.7)",
              border: `1px solid ${active ? "rgb(var(--brand-700) / 0.35)" : "rgba(15,23,42,0.08)"}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
            }}
          >
            <span className="text-[12px] font-medium text-[#213856]">{s}</span>
            {isBooking ? (
              <span className="text-[10px] font-bold text-champ-700 inline-flex items-center gap-1.5">
                <span className="relative inline-flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-champ-500 animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-champ-500" />
                </span>
                Booking…
              </span>
            ) : isConfirmed ? (
              <span className="text-[10px] font-bold text-champ-700 inline-flex items-center gap-1">
                <ICheck s={11} /> Booked
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">Open</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Feature card - media chips: cycle through Photo / Voice / Video / PDF / Audio.
// ════════════════════════════════════════════════════════════════════════════
const MEDIA = [
  {
    label: "Photo",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="2" />
        <path d="M21 17l-5-5-9 8" />
      </svg>
    ),
  },
  {
    label: "Voice",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 19v3" />
      </svg>
    ),
  },
  {
    label: "Video",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <path d="m22 8-6 4 6 4z" />
      </svg>
    ),
  },
  {
    label: "PDF",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    label: "Audio",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" />
        <path d="M15 9a4 4 0 0 1 0 6" />
      </svg>
    ),
  },
];

export function MediaUnderstandsDemo() {
  const { ref, inView } = useEnterOnce();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(
      () => setActive((a) => (a + 1) % MEDIA.length),
      1400,
    );
    return () => clearInterval(id);
  }, [inView]);

  return (
    <div ref={ref}>
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {MEDIA.map((m, i) => {
          const on = i === active;
          return (
            <motion.div
              key={m.label}
              animate={{
                y: on ? -2 : 0,
                scale: on ? 1.06 : 1,
              }}
              transition={SPRING_SMOOTH}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-md ${on ? "text-white" : "text-slate-500"}`}
              style={{
                background: on
                  ? "linear-gradient(180deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)"
                  : "rgba(255,255,255,0.7)",
                border: `1px solid ${on ? "rgb(var(--brand-700) / 0.5)" : "rgba(15,23,42,0.08)"}`,
                boxShadow: on
                  ? "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 10px -4px rgb(var(--brand-500) / 0.5)"
                  : "inset 0 1px 0 rgba(255,255,255,0.95)",
              }}
            >
              {m.icon}
              <span className="text-[9px] font-bold">{m.label}</span>
            </motion.div>
          );
        })}
      </div>
      <div className="text-[11px] text-slate-500 text-center">
        Parsed in context ·{" "}
        <span className="font-semibold text-[#213856]">
          {MEDIA[active]!.label}
        </span>{" "}
        understood
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Feature card - deal-closing mini chat: prospect → typing → reply → toast.
// ════════════════════════════════════════════════════════════════════════════
const DEAL_FLOW: Array<{
  side: "lead" | "typing" | "ai" | "toast";
  text?: string;
}> = [
  { side: "lead", text: "Is the bundle still on offer?" },
  { side: "typing" },
  {
    side: "ai",
    text: "Yes. Locks the rate in for you. Want me to send the invoice?",
  },
  { side: "lead", text: "Yes please" },
  { side: "typing" },
  { side: "ai", text: "Sent. Anything else?" },
  { side: "toast", text: "Deal closed" },
];

export function CloseDealDemo() {
  const { ref, inView } = useEnterOnce();
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        setStep(-1);
        await sleep(500);
        for (let i = 0; i < DEAL_FLOW.length; i++) {
          if (cancelled) return;
          setStep(i);
          const s = DEAL_FLOW[i]!;
          await sleep(
            s.side === "typing" ? 850 : s.side === "toast" ? 1700 : 1400,
          );
        }
        await sleep(1400);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-1.5 min-h-[300px] sm:min-h-[220px]"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {DEAL_FLOW.slice(0, step + 1).map((s, i) => {
          const isLast = i === step;
          if (s.side === "typing") {
            // Only render the typing bubble while it's the current step.
            if (!isLast) return null;
            return (
              <motion.div
                key={`typing-${i}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_SNAP}
                className="flex justify-end"
              >
                <div
                  className="rounded-2xl rounded-br-md px-2.5 py-2 inline-flex items-center gap-1"
                  style={{
                    background:
                      "var(--typing-bg, linear-gradient(180deg, color-mix(in srgb, rgb(var(--brand-500)) 45%, white) 0%, color-mix(in srgb, rgb(var(--brand-500)) 75%, white) 100%))",
                  }}
                >
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-white/80"
                      animate={{ y: [0, -2.5, 0] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        delay: d * 0.15,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            );
          }
          if (s.side === "toast") {
            return (
              <motion.div
                key={`toast-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SPRING_SNAP}
                className="pt-1"
              >
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
                  style={{
                    background:
                      "linear-gradient(180deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)",
                    boxShadow:
                      "0 0 0 1px rgb(var(--brand-700) / 0.4), 0 6px 14px -4px rgb(var(--brand-500) / 0.45)",
                  }}
                >
                  <ICheck s={11} />
                  {s.text}
                </span>
              </motion.div>
            );
          }
          const isAI = s.side === "ai";
          return (
            <motion.div
              key={`msg-${i}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAP}
              className={`flex ${isAI ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-2.5 py-1.5 text-[12px] text-[#213856] ${
                  isAI ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={{
                  background: isAI
                    ? "var(--msg-out-bg, linear-gradient(180deg, color-mix(in srgb, rgb(var(--brand-500)) 13%, white) 0%, color-mix(in srgb, rgb(var(--brand-500)) 24%, white) 100%))"
                    : "var(--msg-in-bg, linear-gradient(180deg,#FBFCFE 0%,#EEF1F6 100%))",
                  border: `1px solid ${isAI ? "rgb(var(--brand-700) / 0.18)" : "rgba(15,23,42,0.08)"}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
                }}
              >
                {s.text}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// "It's Yours" - cycles through 3 sample brands (swatch + name + domain).
// ════════════════════════════════════════════════════════════════════════════
const BRANDS = [
  { name: "Northstar", domain: "northstar.social", a: "#6366f1", b: "#8b5cf6" },
  { name: "Halcyon", domain: "halcyon.studio", a: "#f472b6", b: "#fb923c" },
  { name: "Veridian", domain: "veridian.io", a: "#10b981", b: "#14b8a6" },
];

export function BrandSwitchDemo() {
  const { ref, inView } = useEnterOnce();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setI((x) => (x + 1) % BRANDS.length), 2400);
    return () => clearInterval(t);
  }, [inView]);
  const b = BRANDS[i]!;
  return (
    <div ref={ref} className="mt-6 rounded-2xl glass-sub p-3 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={b.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={SPRING_SMOOTH}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-6 h-6 rounded-md flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${b.a}, ${b.b})` }}
            />
            <span className="text-xs font-semibold text-[#213856] truncate">
              {b.name}
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-champ-700 truncate">
            app.{b.domain}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// "Gets Smarter" - conversion bar ticks up each one-click optimise pass.
// ════════════════════════════════════════════════════════════════════════════
export function OptimiseLiftDemo() {
  const { ref, inView } = useEnterOnce();
  const stages = [31, 38, 44, 51];
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        for (let i = 0; i < stages.length; i++) {
          if (cancelled) return;
          setStage(i);
          await sleep(1400);
        }
        await sleep(900);
        if (cancelled) return;
        setStage(0);
        await sleep(600);
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [inView]);
  const v = stages[stage];
  return (
    <div ref={ref} className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Conversion
        </span>
        <motion.span
          key={v}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SMOOTH}
          className="font-clash text-lg font-semibold text-champ-700"
        >
          {v}%
        </motion.span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden relative">
        <motion.div
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-champ-400 to-champ-600 relative"
        >
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.3,
            }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          />
        </motion.div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
        <ISparkle s={11} />
        <span>
          Auto-tuning {stage + 1}/{stages.length} plays
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// "Runs Campaigns" - pills cycle "live", counter ticks up underneath.
// ════════════════════════════════════════════════════════════════════════════
const CAMPAIGNS = [
  { label: "Reel → DM", chip: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
  { label: "Ad → DM", chip: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  {
    label: "Cart recovery",
    chip: "bg-champ-100 text-champ-700",
    dot: "bg-champ-500",
  },
];

export function CampaignsPulseDemo() {
  const { ref, inView } = useEnterOnce();
  const [active, setActive] = useState(0);
  const [sent, setSent] = useState(124);
  const [booked, setBooked] = useState(19);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(
      () => setActive((x) => (x + 1) % CAMPAIGNS.length),
      1800,
    );
    return () => clearInterval(t);
  }, [inView]);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => {
      setSent((s) => s + Math.floor(Math.random() * 3) + 1);
      if (Math.random() < 0.45) setBooked((b) => b + 1);
    }, 1100);
    return () => clearInterval(t);
  }, [inView]);
  return (
    <div ref={ref} className="mt-4">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {CAMPAIGNS.map((c, i) => {
          const isActive = i === active;
          return (
            <motion.span
              key={c.label}
              animate={{ scale: isActive ? 1.04 : 1 }}
              transition={SPRING_SMOOTH}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-semibold ${c.chip}`}
              style={{
                boxShadow: isActive
                  ? "0 0 0 2px rgb(var(--brand-500) / 0.35)"
                  : "none",
              }}
            >
              <span className="relative inline-flex w-1.5 h-1.5">
                {isActive && (
                  <span
                    className={`absolute inset-0 rounded-full ${c.dot} animate-ping opacity-60`}
                  />
                )}
                <span
                  className={`relative w-1.5 h-1.5 rounded-full ${isActive ? c.dot : "bg-slate-300"}`}
                />
              </span>
              {c.label}
            </motion.span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
        <span>
          <strong className="font-clash text-[#213856] text-sm">{sent}</strong>{" "}
          sent today
        </span>
        <span className="w-px h-3 bg-slate-200" />
        <span>
          <strong className="font-clash text-champ-700 text-sm">
            {booked}
          </strong>{" "}
          booked
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// "Connects to Everything" - central beam pings each integration in turn.
// ════════════════════════════════════════════════════════════════════════════
const INTEGRATIONS = [
  "Your CRM",
  "Zapier",
  "Slack",
  "Calendar",
  "Webhooks",
  "REST API",
];

export function IntegrationsBeamDemo() {
  const { ref, inView } = useEnterOnce();
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(
      () => setActive((x) => (x + 1) % INTEGRATIONS.length),
      900,
    );
    return () => clearInterval(t);
  }, [inView]);
  return (
    <div ref={ref} className="mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        {INTEGRATIONS.map((t, i) => {
          const isActive = i === active;
          return (
            <motion.span
              key={t}
              animate={{ scale: isActive ? 1.06 : 1 }}
              transition={SPRING_SMOOTH}
              className="text-[11px] font-mono px-2 py-1 rounded-md relative"
              style={{
                background: isActive
                  ? "rgb(var(--brand-500) / 0.14)"
                  : "rgb(241,245,249)",
                color: isActive ? "rgb(var(--brand-700))" : "#475569",
                boxShadow: isActive
                  ? "0 0 0 1px rgb(var(--brand-700) / 0.35)"
                  : "none",
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="webhook-beam"
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-champ-500"
                  initial={false}
                  transition={SPRING_SNAP}
                  style={{ boxShadow: "0 0 8px rgb(var(--brand-500) / 0.8)" }}
                />
              )}
              {t}
            </motion.span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
        <IBolt s={11} />
        <span className="font-mono">
          webhook →{" "}
          <span className="text-champ-700 font-semibold">
            {INTEGRATIONS[active]}
          </span>
        </span>
      </div>
    </div>
  );
}
