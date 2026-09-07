import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MessageBubble, {
  DateDivider,
  SystemCard,
  ChatGapBadge,
  WinToast,
} from "./lib/MessageBubble";
import { THREADS, type ConvoEvent, type Thread } from "./lib/threads";
import {
  TypingScanDemo,
  ChannelToggleDemo,
  LiveInboxDemo,
} from "./lib/StepDemos";
import {
  SPRING_SMOOTH,
  fadeUp,
  popIn,
  staggerContainer,
  VIEWPORT_ONCE,
} from "./lib/motion";
import brand, {
  getActiveLang,
  lhref,
  swapLangPath,
  type Cell,
  type ChannelKey,
} from "./brand.config";
import { LANGS } from "./lib/i18n";
import { useUi } from "./lib/i18n";
import { themes, type ThemeName } from "./themes";
import {
  homeLayouts,
  type HomeLayoutName,
  type SectionKey,
  type HeroVariant,
} from "./homeLayouts";
import { previewTheme, previewLayout } from "./lib/previewMode";
import { FeatureEmoji } from "./lib/SubPagePrimitives";
import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";

// ----- inline SVG channel icons -----
const IconWhatsApp = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const IconInstagram = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FFDC80" />
        <stop offset="25%" stopColor="#F56040" />
        <stop offset="50%" stopColor="#C13584" />
        <stop offset="75%" stopColor="#833AB4" />
        <stop offset="100%" stopColor="#5B51D8" />
      </linearGradient>
    </defs>
    <path
      fill="url(#ig-grad)"
      d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
    />
  </svg>
);

const IconMessenger = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#0084FF">
    <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.259L19.752 8.2l-6.561 6.763z" />
  </svg>
);

const IconTelegram = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#229ED9">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.242-.213-.054-.334-.373-.121l-6.87 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.566-4.458c.538-.196 1.006.128.832.938z" />
  </svg>
);

const IconIMessage = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="imsg-grad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#5BF675" />
        <stop offset="100%" stopColor="#0CBD45" />
      </linearGradient>
    </defs>
    <path
      fill="url(#imsg-grad)"
      d="M12 2C5.925 2 1 6.21 1 11.4c0 2.97 1.617 5.617 4.144 7.343 0 .68-.4 2.42-1.144 3.257 0 0 2.43-.04 4.71-1.735.736.135 1.5.207 2.29.207 6.075 0 11-4.21 11-9.4S18.075 2 12 2z"
    />
  </svg>
);

const IconWebChat = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#6366f1"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconSms = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#0ea5e9"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

// Channel key -> icon. Used by the hero channel pills (driven by brand.channels).
const CHANNEL_ICONS: Record<
  ChannelKey,
  ({ size }: { size?: number }) => React.ReactElement
> = {
  whatsapp: IconWhatsApp,
  instagram: IconInstagram,
  messenger: IconMessenger,
  imessage: IconIMessage,
  telegram: IconTelegram,
  webchat: IconWebChat,
  sms: IconSms,
};

const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
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
);

// ===== checkmark / cross / partial cells =====
const YesMark = () => (
  <span className="accent-glow inline-flex items-center justify-center w-7 h-7 rounded-full bg-champ-500 text-white shadow-md shadow-champ-500/30">
    <svg
      width="14"
      height="14"
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
);
const NoMark = () => (
  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400">
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </span>
);
const PartialMark = () => (
  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
    Partial
  </span>
);
const renderMark = (v: Cell) =>
  v === true ? <YesMark /> : v === "partial" ? <PartialMark /> : <NoMark />;

// ===== Design menu (nav dropdown; live previews via ?theme= / ?layout=) =====
const THEME_NAMES = Object.keys(themes) as ThemeName[];
const LAYOUT_NAMES = Object.keys(homeLayouts) as HomeLayoutName[];

/** Currently shown theme/layout (configured, or the sticky session preview). */
function useEffectiveDesign(): { theme: ThemeName; layout: HomeLayoutName } {
  const { search } = useLocation();
  const [design, setDesign] = useState<{
    theme: ThemeName;
    layout: HomeLayoutName;
  }>({ theme: brand.theme, layout: brand.homeLayout });
  useEffect(() => {
    setDesign({
      theme: previewTheme(search) ?? brand.theme,
      layout: previewLayout(search) ?? brand.homeLayout,
    });
  }, [search]);
  return design;
}

/** Preview link that keeps the OTHER preview param intact (so a bloom+vsl
 *  combination can be built up click by click). Always points at home. */
function previewHref(
  kind: "theme" | "layout",
  value: string,
  current: { theme: ThemeName; layout: HomeLayoutName },
): string {
  const sp = new URLSearchParams();
  const theme = kind === "theme" ? value : current.theme;
  const layout = kind === "layout" ? value : current.layout;
  if (theme !== brand.theme || kind === "theme") sp.set("theme", theme);
  if (layout !== brand.homeLayout || kind === "layout")
    sp.set("layout", layout);
  return `/?${sp.toString()}`;
}

function CheckSmall() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-champ-600"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ThemesMenu() {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const design = useEffectiveDesign();
  const current = design.theme;
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative px-2.5 py-2 rounded-xl whitespace-nowrap transition-all duration-200 will-change-transform hover:-translate-y-px hover:bg-champ-500/10 hover:text-champ-700 inline-flex items-center gap-1.5"
      >
        {ui.design}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 top-full pt-2 w-64"
        >
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)] p-1.5">
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Colour &amp; style
            </div>
            {THEME_NAMES.map((n) => (
              <a
                key={n}
                role="menuitem"
                href={previewHref("theme", n, design)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-champ-500/10 hover:text-champ-700 transition-colors"
              >
                <span
                  aria-hidden
                  className="w-3.5 h-3.5 rounded-full border border-slate-900/10 shrink-0"
                  style={{ background: themes[n].colors.c500 }}
                />
                <span className="flex-1">{themes[n].label}</span>
                {current === n && <CheckSmall />}
              </a>
            ))}
            <div className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100 mt-1">
              {ui.homeLayout}
            </div>
            {LAYOUT_NAMES.map((n) => (
              <a
                key={n}
                role="menuitem"
                href={previewHref("layout", n, design)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-champ-500/10 hover:text-champ-700 transition-colors"
              >
                <span
                  aria-hidden
                  className="w-3.5 h-3.5 rounded-[4px] border border-slate-300 grid place-items-center shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-[1.5px] bg-slate-400" />
                </span>
                <span className="flex-1">{homeLayouts[n].label}</span>
                {design.layout === n && <CheckSmall />}
              </a>
            ))}
            <div className="px-3 pt-1.5 pb-1 text-[10.5px] leading-snug text-slate-400">
              {ui.previewNote}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Nav (extracted, reused on home + sub-pages) =====

/* -----------------------------------------------------------------------------
 * Sélecteur de langue.
 * Deux liens vers la même page dans l'autre langue — pas de JavaScript, donc il
 * survit à l'export HTML statique et reste lisible par les moteurs de recherche.
 * -------------------------------------------------------------------------- */
function LangSwitcher({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  const current = getActiveLang();
  const ui = useUi();
  return (
    <div
      className={`inline-flex items-center rounded-xl p-0.5 glass-pill ${className}`}
      role="group"
      aria-label={ui.langLabel}
    >
      {LANGS.map(({ code, label, hreflang }) => {
        const active = code === current;
        return (
          <a
            key={code}
            href={swapLangPath(pathname, code)}
            hrefLang={hreflang}
            lang={hreflang}
            aria-current={active ? "true" : undefined}
            className={`px-2 py-1 text-[11.5px] font-bold rounded-[10px] transition-colors ${
              active
                ? "bg-champ-500/15 text-champ-700"
                : "text-slate-500 hover:text-champ-700"
            }`}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

export function Nav({
  links: linksProp,
  ctaHref: ctaHrefProp,
  ctaLabel: ctaLabelProp,
}: {
  links?: Array<{ href: string; label: string }>;
  ctaHref?: string;
  ctaLabel?: string;
} = {}) {
  // Résolu au rendu, pas à l'import : le contenu dépend de la langue active.
  const links = linksProp ?? brand.nav.links;
  const ctaHref = ctaHrefProp ?? brand.nav.ctaHref;
  const ctaLabel = ctaLabelProp ?? brand.nav.ctaLabel;
  const ui = useUi();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const isActive = (href: string) => {
    // In-page anchor links (e.g. "/#pricing") never count as the active route —
    // otherwise every anchor lights up at once on the single-page home.
    if (href.includes("#")) return false;
    const a = pathname.replace(/\/+$/, "");
    const b = href.replace(/\/+$/, "");
    if (!b) return a === "";
    return a === b || a.startsWith(b + "/");
  };
  return (
    <header className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
      <div className="w-full max-w-6xl">
        <nav className="glass rounded-2xl px-4 py-2.5 flex items-center gap-3">
          <a href={lhref("/")} className="flex items-center gap-2 pr-2 shrink-0">
            <img
              src={brand.logo}
              alt={brand.logoAlt}
              className="h-5 sm:h-7 shrink-0"
            />
          </a>
          <div className="hidden lg:flex flex-1 items-center justify-center gap-1.5 text-sm text-slate-700 min-w-0">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-2.5 py-2 rounded-xl whitespace-nowrap transition-all duration-200 will-change-transform hover:-translate-y-px ${
                    active
                      ? "bg-champ-500/10 text-champ-700 font-semibold ring-1 ring-inset ring-champ-500/30 shadow-[0_4px_14px_-8px_rgb(var(--brand-500)_/_0.55)]"
                      : "hover:bg-champ-500/10 hover:text-champ-700 hover:shadow-[0_4px_14px_-10px_rgb(var(--brand-500)_/_0.45)]"
                  }`}
                >
                  {l.label}
                </a>
              );
            })}
            {brand.nav.themePicker && <ThemesMenu />}
          </div>
          <div className="flex flex-1 lg:flex-none items-center justify-end gap-2 shrink-0">
            <LangSwitcher className="hidden sm:inline-flex" />
            <a
              href={brand.nav.loginHref}
              target="_blank"
              rel="noopener"
              className="hidden sm:inline-flex btn-ghost text-sm font-medium px-3.5 py-2 rounded-xl whitespace-nowrap"
            >
              {brand.nav.loginLabel}
            </a>
            <a
              href={ctaHref}
              className="btn-primary text-sm font-semibold px-3.5 sm:px-4 py-2 rounded-xl hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {ctaLabel} <ArrowRight />
            </a>
            <button
              type="button"
              aria-label={mobileOpen ? ui.closeMenu : ui.openMenu}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-panel"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 hover:text-champ-700 hover:ring-champ-500/40 transition-colors"
            >
              {mobileOpen ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="7" x2="21" y2="7" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="17" x2="21" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </nav>
        {mobileOpen && (
          <div
            id="mobile-nav-panel"
            className="lg:hidden rounded-2xl mt-2 p-3 flex flex-col gap-1 text-sm text-slate-700 bg-white ring-1 ring-slate-200 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)]"
          >
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2.5 rounded-xl transition-colors ${
                    active
                      ? "bg-champ-500/10 text-champ-700 font-semibold ring-1 ring-champ-500/30"
                      : "hover:bg-champ-500/10 hover:text-champ-700"
                  }`}
                >
                  {l.label}
                </a>
              );
            })}
            {brand.nav.themePicker && (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-200/70 mt-1">
                  {ui.themesTapToPreview}
                </div>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {THEME_NAMES.map((n) => (
                    <a
                      key={n}
                      href={`/?theme=${n}`}
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ring-1 ring-slate-200 text-[12px] text-slate-600 hover:text-champ-700 hover:ring-champ-500/40 transition-colors"
                    >
                      <span
                        aria-hidden
                        className="w-2.5 h-2.5 rounded-full border border-slate-900/10"
                        style={{ background: themes[n].colors.c500 }}
                      />
                      {themes[n].label}
                    </a>
                  ))}
                </div>
                <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {ui.layoutsTapToPreview}
                </div>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {LAYOUT_NAMES.map((n) => (
                    <a
                      key={n}
                      href={`/?layout=${n}`}
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ring-1 ring-slate-200 text-[12px] text-slate-600 hover:text-champ-700 hover:ring-champ-500/40 transition-colors"
                    >
                      {homeLayouts[n].label}
                    </a>
                  ))}
                </div>
              </>
            )}
            <a
              href={brand.nav.loginHref}
              target="_blank"
              rel="noopener"
              className="sm:hidden px-3 py-2.5 rounded-xl text-slate-700 hover:bg-champ-500/10 hover:text-champ-700 transition-colors border-t border-slate-200/70 mt-1 pt-3"
            >
              {brand.nav.loginLabel}
            </a>
            <div className="sm:hidden flex items-center gap-2 px-3 pt-3 border-t border-slate-200/70 mt-1">
              <span className="text-[11.5px] font-semibold text-slate-500">
                {ui.langLabel}
              </span>
              <LangSwitcher />
            </div>
            <a
              href={ctaHref}
              onClick={() => setMobileOpen(false)}
              className="btn-primary text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap mt-2"
            >
              {ctaLabel} <ArrowRight />
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

// ===== FAQ section (extracted, accepts an FAQ list override) =====
export function FAQSection({
  items: itemsProp,
  heading,
}: { items?: Array<[string, string]>; heading?: string } = {}) {
  // Résolu au rendu : le contenu dépend de la langue active.
  const items = itemsProp ?? brand.faq.items;
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <section id="faq" className="relative py-20 sm:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08)}
          className="text-center mb-12"
        >
          <motion.div
            variants={fadeUp}
            className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4"
          >
            FAQ
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]"
          >
            {heading ?? brand.faq.heading}
          </motion.h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.05, 0.1)}
          className="space-y-3"
        >
          {items.map(([q, a], i) => {
            const open = openFaq === i;
            return (
              <motion.div
                variants={fadeUp}
                key={q}
                className="glass rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full p-5 flex items-center justify-between gap-4 text-left"
                >
                  <span className="font-clash text-base sm:text-lg font-semibold text-[#213856]">
                    {q}
                  </span>
                  <motion.span
                    animate={{ rotate: open ? 45 : 0 }}
                    transition={SPRING_SMOOTH}
                    className={`w-8 h-8 rounded-full grid place-items-center border border-slate-200 shrink-0 transition-colors duration-300 ${open ? "bg-champ-500 text-white" : "bg-white/95 text-slate-500"}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: SPRING_SMOOTH,
                        opacity: { duration: 0.18 },
                      }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-5 pb-5 text-slate-600 text-sm leading-relaxed">
                        {a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

// Re-export site shell pieces used by sub-pages
export {
  OrbField,
  ComparisonTable,
  HowItWorks,
  Features,
  Testimonials,
  Pricing,
  FinalCta,
  Footer,
};

// ===== component =====
// ===== home assembly ========================================================
// The home page is a LAYOUT (src/homeLayouts.ts) rendered from building
// blocks: a Hero variant + the section components in this map. To reorder or
// drop sections, edit the layout — not the components.
const SECTION_COMPONENTS: Record<SectionKey, React.ComponentType> = {
  problem: ProblemSection,
  comparison: ComparisonTable,
  howItWorks: HowItWorks,
  features: Features,
  useCases: UseCases,
  conversation: ConversationSection,
  integrations: IntegrationsStrip,
  midCta: MidCta,
  trust: TrustSection,
  guarantee: GuaranteeSection,
  testimonials: Testimonials,
  pricing: Pricing,
  faq: FAQSection,
  finalCta: FinalCta,
};

export default function App() {
  const { search } = useLocation();
  // The configured layout renders into the static HTML; a ?layout= preview
  // (or one remembered for this session) swaps it after hydration.
  const [layoutName, setLayoutName] = useState<HomeLayoutName>(
    brand.homeLayout,
  );
  useEffect(() => {
    setLayoutName(previewLayout(search) ?? brand.homeLayout);
  }, [search]);
  const layout = homeLayouts[layoutName];

  return (
    <>
      <Nav />
      <div className="orb-stage relative">
        <OrbField />
        <Hero variant={layout.hero} />
        {layout.sections.map((key) => {
          const Section = SECTION_COMPONENTS[key];
          return <Section key={key} />;
        })}
        <Footer />
      </div>
    </>
  );
}

// ===== hero (three treatments — picked by the layout) =======================

/** Shared hero pieces */
function HeroBadge({ center = true }: { center?: boolean }) {
  if (!brand.hero.badge) return null;
  return (
    <motion.div
      variants={fadeUp}
      className={`flex ${center ? "justify-center" : "justify-start"} mb-6`}
    >
      <span className="glass-pill inline-flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-champ-700 px-4 py-1.5 rounded-full">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-champ-500 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-champ-500" />
        </span>
        {brand.hero.badge}
      </span>
    </motion.div>
  );
}

function HeroCtas({ center = true }: { center?: boolean }) {
  return (
    <motion.div
      variants={fadeUp}
      className={`flex flex-col sm:flex-row items-center ${center ? "justify-center" : "justify-start"} gap-3 mb-10`}
    >
      <a
        href={brand.hero.primaryCta.href}
        className="btn-primary pulse-glow w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2"
      >
        {brand.hero.primaryCta.label} <ArrowRight size={16} />
      </a>
      {brand.hero.secondaryCta && (
        <a
          href={brand.hero.secondaryCta.href}
          className="btn-ghost w-full sm:w-auto text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2"
        >
          {brand.hero.secondaryCta.label}
        </a>
      )}
    </motion.div>
  );
}

function HeroChannelPills({ center = true }: { center?: boolean }) {
  const ui = useUi();
  return (
    <motion.div
      variants={staggerContainer(0.06, 0.2)}
      className={`flex flex-wrap items-center ${center ? "justify-center" : "justify-start"} gap-2.5 mb-12`}
    >
      {brand.channels.map((c) => {
        const Icon = CHANNEL_ICONS[c.key];
        return (
          <motion.span
            key={c.key}
            variants={popIn}
            className={`glass-pill text-sm font-medium inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full ${c.soon ? "text-slate-500" : "text-slate-700"}`}
          >
            <Icon /> {c.label}
            {c.soon && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-champ-700 bg-champ-100 px-1.5 py-0.5 rounded-full -mr-1">
                {ui.soon}
              </span>
            )}
          </motion.span>
        );
      })}
    </motion.div>
  );
}

function HeroKpis({ delay = 0.5 }: { delay?: number }) {
  return (
    <motion.div
      variants={staggerContainer(0.08, delay)}
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 max-w-5xl mx-auto"
    >
      {brand.hero.kpis.map((k) => (
        <Kpi
          key={k.label}
          value={k.value}
          label={k.label}
          valueClass={k.highlight ? "grad-text" : "text-[#213856]"}
        />
      ))}
    </motion.div>
  );
}

/** Styled 16:9 frame shown by the "video" hero until hero.videoId is set —
 *  a dark brand-tinted stage with a play button, so the VSL layout looks
 *  like a video page out of the box. */
function VideoPlaceholder() {
  const ui = useUi();
  return (
    <div
      className="relative aspect-video grid place-items-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 90% at 50% 0%, rgb(var(--brand-700) / 0.55) 0%, transparent 70%), linear-gradient(180deg, #101826 0%, #0b1220 100%)",
      }}
      aria-hidden
    >
      {/* faint grid so the stage isn't a flat void */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 100%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-4">
        <span className="pulse-glow w-20 h-20 rounded-full grid place-items-center btn-primary">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
        <span className="glass-pill px-4 py-1.5 rounded-full text-[12.5px] font-semibold text-slate-700">
          {ui.watchDemo}
        </span>
      </div>
    </div>
  );
}

function Hero({ variant }: { variant: HeroVariant }) {
  /* ---- "split": copy left, live chat demo right, no big showcase -------- */
  if (variant === "split") {
    return (
      <section className="relative pt-32 sm:pt-40 pb-10 sm:pb-14">
        <motion.div
          className="relative max-w-6xl mx-auto px-5 sm:px-6"
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.08)}
        >
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-14 items-center">
            <div>
              <HeroBadge center={false} />
              <motion.h1
                variants={fadeUp}
                className="font-grotesk text-3xl sm:text-5xl font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
              >
                {brand.hero.titleA}{" "}
                <span className="grad-text">{brand.hero.titleHighlight}</span>{" "}
                {brand.hero.titleB}
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="text-base sm:text-lg text-slate-600 leading-relaxed mb-8"
              >
                {brand.hero.subhead}
              </motion.p>
              <HeroCtas center={false} />
              <HeroChannelPills center={false} />
            </div>
            <motion.div
              variants={fadeUp}
              transition={{ ...SPRING_SMOOTH, delay: 0.2 }}
              className="glass rounded-3xl p-4 sm:p-5"
            >
              <LiveInboxDemo />
            </motion.div>
          </div>
          <HeroKpis delay={0.4} />
        </motion.div>
      </section>
    );
  }

  /* ---- "video": VSL embed front and center (falls back to showcase) ----- */
  if (variant === "video") {
    return (
      <section className="relative pt-32 sm:pt-40 pb-10 sm:pb-14">
        <motion.div
          className="relative max-w-6xl mx-auto px-5 sm:px-6"
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.08)}
        >
          <HeroBadge />
          <motion.h1
            variants={fadeUp}
            className="font-grotesk text-center text-3xl sm:text-5xl lg:text-[3.5rem] font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
          >
            {brand.hero.titleA}{" "}
            <span className="grad-text">{brand.hero.titleHighlight}</span>{" "}
            {brand.hero.titleB}
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="text-center text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-8"
          >
            {brand.hero.subhead}
          </motion.p>
          <motion.div variants={fadeUp} className="max-w-3xl mx-auto mb-10">
            <div className="glass-lift rounded-[28px] p-2 sm:p-3">
              <div className="rounded-2xl overflow-hidden">
                {brand.hero.videoId ? (
                  <LiteYouTubeEmbed
                    id={brand.hero.videoId}
                    title={`${brand.brandName} — see it in action`}
                  />
                ) : (
                  <VideoPlaceholder />
                )}
              </div>
            </div>
            {!brand.hero.videoId && (
              <p className="text-center text-[12px] text-slate-400 mt-3">
                Placeholder — set{" "}
                <code className="font-mono">hero.videoId</code> in
                brand.config.ts to embed your video.
              </p>
            )}
          </motion.div>
          <HeroCtas />
          <HeroChannelPills />
          <HeroKpis />
        </motion.div>
      </section>
    );
  }

  /* ---- "minimal": centered copy only — no demo, straight to the point --- */
  if (variant === "minimal") {
    return (
      <section className="relative pt-32 sm:pt-40 pb-6 sm:pb-8">
        <motion.div
          className="relative max-w-6xl mx-auto px-5 sm:px-6"
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.08)}
        >
          <HeroBadge />
          <motion.h1
            variants={fadeUp}
            className="font-grotesk text-center text-3xl sm:text-5xl lg:text-[3.5rem] font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
          >
            {brand.hero.titleA}{" "}
            <span className="grad-text">{brand.hero.titleHighlight}</span>{" "}
            {brand.hero.titleB}
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="text-center text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-8"
          >
            {brand.hero.subhead}
          </motion.p>
          <HeroCtas />
          <HeroChannelPills />
          <HeroKpis delay={0.3} />
        </motion.div>
      </section>
    );
  }

  /* ---- "showcase" (default): centered copy + full-width inbox demo ------ */
  return (
    <section className="relative pt-32 sm:pt-40 pb-10 sm:pb-14">
      <motion.div
        className="relative max-w-6xl mx-auto px-5 sm:px-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer(0.08)}
      >
        <HeroBadge />

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          className="font-grotesk text-center text-3xl sm:text-5xl lg:text-[3.5rem] font-bold text-[#213856] leading-[1.05] tracking-tight mb-6 [text-wrap:balance]"
        >
          {brand.hero.titleA}{" "}
          <span className="grad-text">{brand.hero.titleHighlight}</span>{" "}
          {brand.hero.titleB}
        </motion.h1>

        {/* Subhead */}
        <motion.p
          variants={fadeUp}
          className="text-center text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-8"
        >
          {brand.hero.subhead}
        </motion.p>

        <HeroCtas />
        <HeroChannelPills />

        {/* Dashboard showcase */}
        <motion.div
          variants={fadeUp}
          transition={{ ...SPRING_SMOOTH, delay: 0.3 }}
        >
          <HeroShowcase />
        </motion.div>

        <HeroKpis />
      </motion.div>
    </section>
  );
}

function OrbField() {
  // Page-wide decorative blobs. Each is at a unique y so the same shape never recurs as you scroll.
  const orbs: Array<React.CSSProperties> = [
    {
      width: 560,
      height: 560,
      background: "rgb(var(--brand-500) / 0.18)",
      top: "-3%",
      left: -180,
    },
    {
      width: 420,
      height: 420,
      background: "rgba(139,92,246,0.13)",
      top: "2%",
      right: -160,
    },
    {
      width: 360,
      height: 360,
      background: "rgba(244,114,182,0.09)",
      top: "11%",
      left: "48%",
    },
    {
      width: 480,
      height: 480,
      background: "rgb(var(--brand-500) / 0.10)",
      top: "20%",
      right: -120,
    },
    {
      width: 300,
      height: 300,
      background: "rgba(139,92,246,0.14)",
      top: "29%",
      left: -80,
    },
    {
      width: 540,
      height: 540,
      background: "rgb(var(--brand-500) / 0.09)",
      top: "39%",
      left: "35%",
    },
    {
      width: 340,
      height: 340,
      background: "rgba(244,114,182,0.08)",
      top: "49%",
      right: -60,
    },
    {
      width: 440,
      height: 440,
      background: "rgba(139,92,246,0.11)",
      top: "58%",
      left: -140,
    },
    {
      width: 380,
      height: 380,
      background: "rgb(var(--brand-500) / 0.13)",
      top: "68%",
      right: 60,
    },
    {
      width: 320,
      height: 320,
      background: "rgba(244,114,182,0.09)",
      top: "77%",
      left: "22%",
    },
    {
      width: 460,
      height: 460,
      background: "rgba(139,92,246,0.10)",
      top: "86%",
      right: -120,
    },
    {
      width: 380,
      height: 380,
      background: "rgb(var(--brand-500) / 0.12)",
      top: "94%",
      left: -80,
    },
  ];
  return (
    <div
      aria-hidden
      className="orb-field"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {orbs.map((s, i) => (
        <div key={i} className="orb" style={s} />
      ))}
    </div>
  );
}

// ===== sub-components =====

// Renders a hero stat chip. `value` is a pre-formatted string straight from
// config (e.g. "24/7", "<30s") so it stays true for everyone — no
// counting animation that would imply a measured number.
function Kpi({
  value,
  label,
  valueClass = "text-[#213856]",
}: {
  value: string;
  label: string;
  valueClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      className="glass-soft rounded-2xl p-4 text-center"
    >
      <div
        className={`font-clash text-2xl sm:text-3xl font-semibold stat-num ${valueClass}`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </motion.div>
  );
}

function HeroShowcase() {
  const ui = useUi();
  const [activeId, setActiveId] = useState<string>(THREADS[0]!.id);
  const active: Thread = THREADS.find((t) => t.id === activeId) ?? THREADS[0]!;

  return (
    <div className="relative max-w-5xl mx-auto">
      <div className="hero-halo absolute -inset-6 bg-gradient-to-r from-champ-500/12 via-indigo-500/10 to-violet-500/10 blur-3xl rounded-[40px] -z-10" />
      <div className="glass rounded-3xl p-3 sm:p-4">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-3 pb-3 border-b border-slate-200/60">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-xs text-slate-500 bg-white/70 rounded-full px-3 py-1 border border-slate-200/70">
              app.
              <span className="text-champ-700 font-semibold">
                {brand.domain.replace(/\..*$/, "")}
              </span>
              {brand.domain.slice(brand.domain.indexOf("."))} / inbox
            </div>
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">⌘K</div>
        </div>

        {/* Mobile thread switcher - sidebar is hidden under lg, this gives mobile users a way to swap chats */}
        <div className="lg:hidden mt-3 -mx-1 px-1 pb-2 flex gap-2 overflow-x-auto chat-scroll snap-x snap-mandatory">
          {THREADS.map((t) => {
            const isActive = t.id === activeId;
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`snap-start shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                  isActive
                    ? "bg-white border-champ-500/40 text-[#213856] shadow-sm"
                    : "bg-white/50 border-slate-200/70 text-slate-500 hover:bg-white/80"
                }`}
              >
                <Avatar
                  initials={t.inbox.initials}
                  redacted={t.inbox.redacted}
                  size="sm"
                />
                <span className="max-w-[14ch] truncate">{t.inbox.name}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 mt-3">
          {/* Sidebar */}
          <aside className="hidden lg:flex lg:col-span-3 flex-col gap-2 p-3 rounded-2xl bg-white/40 border border-slate-200/60">
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {ui.inbox}
              </span>
              <span className="text-[10px] text-slate-400">
                {THREADS.length} active
              </span>
            </div>
            {THREADS.map((t) => (
              <InboxRow
                key={t.id}
                initials={t.inbox.initials}
                redacted={t.inbox.redacted}
                name={t.inbox.name}
                preview={t.inbox.preview}
                active={t.id === activeId}
                onClick={() => setActiveId(t.id)}
              />
            ))}
            <LiveActivity />
          </aside>

          {/* Conversation */}
          <div className="panel-soft lg:col-span-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200/70 flex flex-col">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/70">
              <Avatar
                redacted={active.header.redactedBadge}
                initials={
                  active.header.redactedBadge
                    ? undefined
                    : initialsFromName(active.header.name)
                }
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-1.5 text-[#213856] flex-wrap">
                  {active.header.name}
                  {active.header.redactedBadge && (
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                      redacted
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-champ-500 shrink-0" />{" "}
                  {active.header.statusText}
                </div>
              </div>
              <button className="hidden sm:inline-flex text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100 shrink-0">
                {ui.handOff}
              </button>
            </div>

            <ConversationStream key={active.id} events={active.events} />
          </div>

          {/* Lead panel */}
          <aside className="lg:col-span-3 p-4 rounded-2xl bg-white/60 border border-slate-200/70">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              {ui.lead}
            </div>
            <div className="text-base font-semibold mb-1 text-[#213856] flex items-center gap-2 flex-wrap">
              {active.lead.displayName}
              {active.lead.redactedBadge && (
                <span className="text-[9px] uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-bold">
                  redacted
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mb-4">{active.lead.sub}</div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-champ-50 border border-champ-500/20">
                <span className="shrink-0 text-champ-700 font-semibold">
                  {active.lead.statusLabel}
                </span>
                <span className="text-champ-700 font-bold text-right">
                  {active.lead.statusValue}
                </span>
              </div>
              {active.lead.rows.map((r) => (
                <LeadRow key={r.label} label={r.label} value={r.value} />
              ))}
            </div>

            <div className="panel-insight mt-4 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-indigo-200/40">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-indigo-700 font-bold mb-1">
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
                  <path d="M12 2 9.1 8.5 2 9.3l5 4.9L5.8 22 12 18.3 18.2 22 17 14.2l5-4.9-7.1-.8z" />
                </svg>
                {ui.aiInsight}
              </div>
              <div className="text-[11px] text-slate-600 leading-snug">
                {active.lead.insight}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function initialsFromName(name: string): string {
  return name
    .replace(/[^A-Za-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Unified avatar: soft pastel bg + matched darker text. Tone derived from initials so each person is stable.
const AVATAR_TONES = [
  {
    bg: "linear-gradient(180deg,rgb(var(--brand-50)) 0%,rgb(var(--brand-100)) 100%)",
    text: "rgb(var(--brand-700))",
    ring: "rgb(var(--brand-700) / 0.18)",
  }, // champ
  {
    bg: "linear-gradient(180deg,#eef2ff 0%,#e0e7ff 100%)",
    text: "#3730a3",
    ring: "rgba(55,48,163,0.18)",
  }, // indigo
  {
    bg: "linear-gradient(180deg,#fff7ed 0%,#fed7aa 100%)",
    text: "#9a3412",
    ring: "rgba(154,52,18,0.18)",
  }, // amber
  {
    bg: "linear-gradient(180deg,#fdf2f8 0%,#fbcfe8 100%)",
    text: "#9d174d",
    ring: "rgba(157,23,77,0.18)",
  }, // rose
  {
    bg: "linear-gradient(180deg,#ecfeff 0%,#cffafe 100%)",
    text: "#155e75",
    ring: "rgba(21,94,117,0.20)",
  }, // cyan
  {
    bg: "linear-gradient(180deg,#f5f3ff 0%,#ddd6fe 100%)",
    text: "#5b21b6",
    ring: "rgba(91,33,182,0.18)",
  }, // violet
];
function toneFor(initials: string) {
  const hash = initials.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function Avatar({
  initials,
  size = "md",
  redacted = false,
  src,
  alt,
}: {
  initials?: string;
  size?: "sm" | "md" | "lg";
  redacted?: boolean;
  src?: string;
  alt?: string;
}) {
  const sz =
    size === "sm"
      ? { box: "w-7 h-7", text: "text-[10px]", icon: 14 }
      : size === "lg"
        ? { box: "w-11 h-11", text: "text-[13px]", icon: 22 }
        : { box: "w-9 h-9", text: "text-[11px]", icon: 18 };
  const t =
    redacted || !initials
      ? {
          bg: "var(--avatar-neutral-bg, linear-gradient(180deg,#f1f5f9 0%,#e2e8f0 100%))",
          text: "#94a3b8",
          ring: "rgba(15,23,42,0.10)",
        }
      : toneFor(initials);
  if (src && !redacted) {
    return (
      <img
        src={src}
        alt={alt || initials || "avatar"}
        className={`${sz.box} rounded-full object-cover shrink-0 select-none`}
        style={{
          boxShadow: `0 0 0 1px ${t.ring}, 0 1px 2px rgba(15,23,42,0.06)`,
        }}
      />
    );
  }
  return (
    <div
      className={`${sz.box} ${sz.text} rounded-full grid place-items-center font-bold shrink-0 select-none tracking-wide`}
      style={{
        background: t.bg,
        color: t.text,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 2px rgba(15,23,42,0.05), 0 0 0 1px ${t.ring}, 0 1px 2px rgba(15,23,42,0.06)`,
      }}
    >
      {redacted || !initials ? (
        <svg
          width={sz.icon}
          height={sz.icon}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
        </svg>
      ) : (
        initials
      )}
    </div>
  );
}

// Capped, user-scrollable conversation stream. Top + bottom fade-masks hint
// there's more content above/below. The `events` prop is whatever conversation
// is currently selected from the inbox - wrap this component with key={threadId}
// so the stagger re-plays when the thread changes.
function ConversationStream({ events }: { events: ConvoEvent[] }) {
  return (
    <div className="relative mt-3">
      <div className="stream-fade-top pointer-events-none absolute inset-x-0 top-0 h-5 z-10 bg-gradient-to-b from-slate-50 to-transparent" />
      <div className="stream-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 h-5 z-10 bg-gradient-to-t from-white to-transparent" />
      <motion.div
        className="flex flex-col max-h-[480px] overflow-y-auto pr-2 pt-6 chat-scroll"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.05 }}
        variants={staggerContainer(0.06, 0.2)}
      >
        {events.map((e, i) => {
          switch (e.type) {
            case "msg":
              return (
                <MessageBubble
                  key={i}
                  text={e.text}
                  direction={e.direction}
                  grouped={e.grouped}
                  leading={e.leading}
                />
              );
            case "date":
              return <DateDivider key={i} label={e.label} />;
            case "system":
              return <SystemCard key={i} tone={e.tone} label={e.label} />;
            case "gap":
              return <ChatGapBadge key={i} label={e.label} />;
            case "win":
              return <WinToast key={i} headline={e.headline} sub={e.sub} />;
          }
        })}
      </motion.div>
    </div>
  );
}

function InboxRow({
  initials,
  name,
  preview,
  active = false,
  redacted = false,
  onClick,
}: {
  initials?: string;
  name: string;
  preview: string;
  active?: boolean;
  redacted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-xl transition text-left ${
        active
          ? "bg-white shadow-sm border border-slate-200/60"
          : "hover:bg-white/70 border border-transparent"
      }`}
    >
      <Avatar initials={initials} redacted={redacted} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold truncate text-[#213856]">
            {name}
          </div>
          {active && <div className="w-1.5 h-1.5 rounded-full bg-champ-500" />}
        </div>
        <div className="text-xs text-slate-500 truncate">{preview}</div>
      </div>
    </button>
  );
}

function LeadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-50">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-[#213856] text-right break-words min-w-0">
        {value}
      </span>
    </div>
  );
}

// ============= Live activity ticker - new entries slide in every few seconds =============
type ActivityEvent = { id: number; tone: "win" | "info" | "hot"; text: string };

const ACTIVITY_POOL: Omit<ActivityEvent, "id">[] = [
  { tone: "win", text: "Marcus O. booked Tues 11am" },
  { tone: "win", text: "Ryan A. paid a deposit" },
  { tone: "info", text: "James K. sent a voice note" },
  { tone: "hot", text: "Samir D. flagged high intent" },
  { tone: "win", text: "Aaron T. booked Fri 3pm" },
  { tone: "win", text: "Tom B. recovered a cart" },
  { tone: "info", text: "Ethan R. asked for pricing" },
  { tone: "win", text: "Noah L. paid a deposit" },
  { tone: "hot", text: "Liam G. ready to close" },
  { tone: "info", text: "Pranav S. uploaded photos" },
];

const TONE: Record<ActivityEvent["tone"], { dot: string; ring: string }> = {
  win: { dot: "bg-champ-500", ring: "ring-champ-500/30" },
  info: { dot: "bg-sky-400", ring: "ring-sky-400/30" },
  hot: { dot: "bg-amber-400", ring: "ring-amber-400/30" },
};

function LiveActivity() {
  const ui = useUi();
  const [items, setItems] = useState<ActivityEvent[]>(() =>
    ACTIVITY_POOL.slice(0, 4).map((e, i) => ({ ...e, id: i })),
  );
  const cursor = useRef(4);

  useEffect(() => {
    const tick = setInterval(() => {
      const idx = cursor.current % ACTIVITY_POOL.length;
      cursor.current += 1;
      const next: ActivityEvent = {
        ...ACTIVITY_POOL[idx]!,
        id: cursor.current,
      };
      setItems((prev) => [next, ...prev].slice(0, 4));
    }, 2800);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="panel-accent mt-3 p-3 rounded-xl bg-gradient-to-br from-champ-50 to-champ-100/60 border border-champ-500/20 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-champ-700 font-bold">
          {ui.live}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-champ-700">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-champ-500 opacity-50 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-champ-500" />
          </span>
          now
        </div>
      </div>
      <div className="space-y-1">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((evt, idx) => {
            const t = TONE[evt.tone];
            return (
              <motion.div
                key={evt.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1 - idx * 0.22, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{
                  layout: SPRING_SMOOTH,
                  scale: SPRING_SMOOTH,
                  opacity: { duration: 0.25, ease: "easeOut" },
                }}
                className="flex items-center gap-2 text-[11px] text-slate-700"
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${t.dot} ring-2 ${t.ring}`}
                />
                <span className="truncate">{evt.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ComparisonTable() {
  const { eyebrow, heading, youLabel, themLabel, rows } = brand.comparison;
  return (
    <section className="relative py-20 sm:py-28">
      <div className="max-w-5xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-12"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight mb-3 text-[#213856]">
            {heading}
          </h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.04)}
          className="glass rounded-3xl overflow-hidden"
        >
          <div className="grid grid-cols-12 text-xs sm:text-sm">
            <div className="col-span-5 sm:col-span-7 p-3 sm:p-5" />
            <div className="col-span-3 sm:col-span-3 p-2 sm:p-5 text-center bg-champ-500/10 border-l border-slate-200/70">
              <div className="inline-flex items-center justify-center gap-1.5 font-clash font-semibold text-champ-700">
                {youLabel}
              </div>
            </div>
            <div className="col-span-4 sm:col-span-2 p-2 sm:p-5 text-center text-slate-500 font-semibold text-[10px] sm:text-xs uppercase tracking-tight sm:tracking-wider border-l border-slate-200/70 leading-tight">
              {themLabel}
            </div>
          </div>
          {rows.map(([label, a, b], i) => (
            <motion.div
              key={label}
              variants={fadeUp}
              className={`grid grid-cols-12 text-xs sm:text-sm border-t border-slate-200/60 ${i % 2 ? "bg-white/40" : ""}`}
            >
              <div className="col-span-5 sm:col-span-7 p-3 sm:p-5 text-slate-700 leading-snug">
                {label}
              </div>
              <div className="col-span-3 sm:col-span-3 p-3 sm:p-5 text-center bg-champ-500/5 border-l border-slate-200/60">
                {renderMark(a)}
              </div>
              <div className="col-span-4 sm:col-span-2 p-3 sm:p-5 text-center border-l border-slate-200/60">
                {renderMark(b)}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { eyebrow, heading, steps } = brand.howItWorks;
  // Clean, generic demo components add visual flair per step. Copy comes from config.
  const STEP_DEMOS = [TypingScanDemo, ChannelToggleDemo, LiveInboxDemo];
  return (
    <section id="how-it-works" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-14"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]">
            {heading}
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.1)}
          className="grid sm:grid-cols-3 gap-4 max-w-5xl mx-auto"
        >
          {steps.map((s, i) => {
            const Demo = STEP_DEMOS[i];
            return (
              <StepCard
                key={s.title}
                step={String(i + 1).padStart(2, "0")}
                title={s.title}
                body={s.body}
              >
                {Demo && <Demo />}
              </StepCard>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  title,
  body,
  children,
}: {
  step: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={SPRING_SMOOTH}
      className="glass rounded-3xl p-6 relative overflow-hidden"
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
        Step {step}
      </div>
      <h3 className="font-clash text-xl font-semibold mt-2 mb-2 text-[#213856]">
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-4">{body}</p>
      {children}
    </motion.div>
  );
}

function Features() {
  const { eyebrow, heading, items } = brand.features;
  return (
    <section id="features" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-14"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]">
            {heading}
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {items.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={SPRING_SMOOTH}
              className="glass rounded-3xl p-6 relative overflow-hidden"
            >
              <div className="mb-3 select-none" aria-hidden>
                {item.emoji.endsWith(".png") ? (
                  <FeatureEmoji src={item.emoji} size="md" />
                ) : (
                  <span className="text-3xl leading-none">{item.emoji}</span>
                )}
              </div>
              <h3 className="font-clash text-xl font-semibold mb-1.5 text-[#213856]">
                {item.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {item.body}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/** Shared centered section header used by the newer sections. */
function SectionHeading({
  eyebrow,
  heading,
  sub,
}: {
  eyebrow: string;
  heading: string;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={SPRING_SMOOTH}
      className="text-center mb-14"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
        {eyebrow}
      </div>
      <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]">
        {heading}
      </h2>
      {sub && (
        <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed mt-4">
          {sub}
        </p>
      )}
    </motion.div>
  );
}

/** Emoji-card grid shared by the problem / guarantee / trust sections. */
function EmojiCardGrid({
  items,
  cols,
}: {
  items: Array<{ emoji: string; title: string; body: string }>;
  cols: 3 | 4;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={staggerContainer(0.08)}
      className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4`}
    >
      {items.map((item) => (
        <motion.div
          key={item.title}
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={SPRING_SMOOTH}
          className="glass rounded-3xl p-6"
        >
          <div className="mb-3 select-none" aria-hidden>
            {item.emoji.endsWith(".png") ? (
              <FeatureEmoji src={item.emoji} size="md" />
            ) : (
              <span className="text-3xl leading-none">{item.emoji}</span>
            )}
          </div>
          <h3 className="font-clash text-lg font-semibold mb-1.5 text-[#213856]">
            {item.title}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">{item.body}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function ProblemSection() {
  const { eyebrow, heading, sub, items } = brand.problem;
  return (
    <section id="problem" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <SectionHeading eyebrow={eyebrow} heading={heading} sub={sub} />
        <EmojiCardGrid items={items} cols={3} />
      </div>
    </section>
  );
}

function GuaranteeSection() {
  const { eyebrow, heading, points } = brand.guarantee;
  return (
    <section id="guarantee" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <SectionHeading eyebrow={eyebrow} heading={heading} />
        <EmojiCardGrid items={points} cols={4} />
      </div>
    </section>
  );
}

function TrustSection() {
  const { eyebrow, heading, items } = brand.trust;
  return (
    <section id="trust" className="relative py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-6 relative">
        <SectionHeading eyebrow={eyebrow} heading={heading} />
        <EmojiCardGrid items={items} cols={4} />
      </div>
    </section>
  );
}

/** Copy + checklist beside an animated deal-closing conversation. Reuses the
 *  same thread data + stream renderer as the hero inbox showcase. */
function ConversationSection() {
  const ui = useUi();
  const { eyebrow, heading, sub, bullets } = brand.conversation;
  const thread = THREADS[1] ?? THREADS[0]!;
  return (
    <section id="conversation" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            variants={staggerContainer(0.08)}
          >
            <motion.div
              variants={fadeUp}
              className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4"
            >
              {eyebrow}
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-clash text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight text-[#213856] mb-4 [text-wrap:balance]"
            >
              {heading}
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-slate-600 leading-relaxed mb-6"
            >
              {sub}
            </motion.p>
            <div className="space-y-3">
              {bullets.map((b) => (
                <motion.div
                  key={b}
                  variants={fadeUp}
                  className="flex items-start gap-3 text-[15px] text-slate-700"
                >
                  <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-champ-100 text-champ-700">
                    <svg
                      width="11"
                      height="11"
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
                  {b}
                </motion.div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT_ONCE}
            transition={SPRING_SMOOTH}
            className="glass-lift rounded-[28px] p-4 sm:p-6"
          >
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200/70 mb-1">
              <Avatar redacted size="sm" />
              <div className="text-[13px] font-semibold text-[#213856]">
                {ui.lead}
                <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  redacted
                </span>
              </div>
              <div className="ml-auto text-[11px] text-slate-400">
                {ui.aiHandling}
              </div>
            </div>
            <ConversationStream events={thread.events} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const { eyebrow, heading, items } = brand.useCases;
  return (
    <section id="use-cases" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-14"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]">
            {heading}
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.07)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {items.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={SPRING_SMOOTH}
              className="glass rounded-3xl p-6 flex items-start gap-4"
            >
              <div className="shrink-0 mt-0.5 select-none" aria-hidden>
                {item.emoji.endsWith(".png") ? (
                  <FeatureEmoji src={item.emoji} size="md" />
                ) : (
                  <span className="text-3xl leading-none">{item.emoji}</span>
                )}
              </div>
              <div>
                <h3 className="font-clash text-lg font-semibold mb-1 text-[#213856]">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {item.body}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function IntegrationsStrip() {
  const { eyebrow, heading, sub, tools } = brand.integrations;
  return (
    <section id="integrations" className="relative py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-10"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-4xl font-semibold leading-tight text-[#213856] mb-3">
            {heading}
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {sub}
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.04)}
          className="flex flex-wrap items-center justify-center gap-2.5"
        >
          {brand.channels.map((c) => {
            const Icon = CHANNEL_ICONS[c.key];
            return (
              <motion.span
                key={c.key}
                variants={popIn}
                className="glass-pill text-sm font-medium inline-flex items-center gap-2 px-4 py-2 rounded-full text-slate-700"
              >
                <Icon /> {c.label}
              </motion.span>
            );
          })}
          {tools.map((t) => (
            <motion.span
              key={t}
              variants={popIn}
              className="glass-pill text-sm font-medium inline-flex items-center gap-2 px-4 py-2 rounded-full text-slate-600"
            >
              <span
                aria-hidden
                className="w-1.5 h-1.5 rounded-full bg-champ-500"
              />
              {t}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/** Compact mid-page CTA band — reuses the finalCta copy so there's nothing
 *  extra to configure. Rendered between sections by longer layouts. */
function MidCta() {
  const { headline, ctaLabel, ctaHref, trustLine } = brand.finalCta;
  return (
    <section className="relative py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="glass-lift rounded-3xl px-6 sm:px-10 py-8 flex flex-col lg:flex-row items-center justify-between gap-6"
        >
          <div className="text-center lg:text-left">
            <h3 className="font-clash text-xl sm:text-2xl font-semibold text-[#213856] [text-wrap:balance]">
              {headline}
            </h3>
            {trustLine.length > 0 && (
              <p className="text-sm text-slate-500 mt-1.5">
                {trustLine.join(" · ")}
              </p>
            )}
          </div>
          <a
            href={ctaHref}
            className="btn-primary shrink-0 text-base font-semibold px-6 py-3.5 rounded-2xl inline-flex items-center gap-2"
          >
            {ctaLabel} <ArrowRight size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function Testimonials() {
  const { eyebrow, heading, items } = brand.testimonials;
  // Ships empty on purpose — hide the whole section until you add your own
  // (permissioned) testimonials in brand.config.
  if (items.length === 0) return null;
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={SPRING_SMOOTH}
          className="text-center mb-10"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4">
            {eyebrow}
          </div>
          <h2 className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]">
            {heading}
          </h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.1)}
          className="grid md:grid-cols-3 gap-5"
        >
          {items.map((t) => (
            <motion.article
              key={t.name}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={SPRING_SMOOTH}
              className="glass rounded-3xl p-6 flex flex-col h-full"
            >
              <div className="flex items-center gap-1 mb-3 text-amber-400">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg
                    key={i}
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 1l2.6 5.4 5.9.9-4.3 4.2 1 5.9L10 14.7 4.8 17.4l1-5.9L1.5 7.3l5.9-.9z" />
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 text-[15px] leading-relaxed mb-5">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-auto">
                <Avatar
                  initials={initialsFromName(t.name)}
                  src={t.avatar}
                  alt={t.name}
                  size="lg"
                />
                <div>
                  <div className="text-sm font-semibold text-[#213856]">
                    {t.name}
                  </div>
                  <div className="text-xs text-slate-500">{t.title}</div>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Pricing() {
  const ui = useUi();
  const { eyebrow, heading, subheading, note, tiers } = brand.pricing;
  return (
    <section id="pricing" className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6 relative">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08)}
          className="text-center mb-14"
        >
          <motion.div
            variants={fadeUp}
            className="text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-4"
          >
            {eyebrow}
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-clash text-3xl sm:text-5xl font-semibold leading-tight text-[#213856]"
          >
            {heading}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-slate-600 max-w-2xl mx-auto mt-5"
          >
            {subheading}
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08, 0.1)}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto"
        >
          {tiers.map((t) => (
            <motion.div
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={SPRING_SMOOTH}
              key={t.name}
              className={`relative rounded-3xl p-6 flex flex-col overflow-hidden ${
                t.featured
                  ? "glass ring-2 ring-champ-500/60 shadow-[0_20px_60px_-20px_rgb(var(--brand-500)_/_0.45)]"
                  : "glass"
              }`}
            >
              {t.featured && (
                <div className="featured-glow absolute -top-16 -right-16 w-48 h-48 rounded-full bg-champ-500/20 blur-3xl pointer-events-none" />
              )}
              <div className="relative flex flex-col h-full">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                    {t.name}
                  </span>
                  {t.featured && (
                    <span className="accent-glow text-[10px] uppercase tracking-wider font-bold bg-champ-500 text-white px-2 py-0.5 rounded-full shadow-sm shadow-champ-500/40">
                      {ui.mostPopular}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 mb-5">{t.blurb}</div>
                <div className="flex items-baseline gap-1.5 mb-6">
                  <span className="font-clash text-4xl font-semibold text-[#213856]">
                    {t.price}
                  </span>
                  <span className="text-slate-400 text-sm">{t.cadence}</span>
                </div>
                <ul className="space-y-2 text-sm text-slate-700 mb-6 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-champ-500">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={t.cta.href}
                  className={`text-sm font-semibold px-4 py-2.5 rounded-xl text-center inline-flex justify-center items-center gap-2 ${
                    t.featured ? "btn-primary" : "btn-ghost"
                  }`}
                >
                  {t.cta.label} {t.featured && <ArrowRight />}
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <p className="text-center text-xs text-slate-500 mt-8">{note}</p>
      </div>
    </section>
  );
}

type FinalCtaProps = {
  eyebrow?: string;
  headline?: React.ReactNode;
  subhead?: React.ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  primaryLabelMobile?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  trustLine?: React.ReactNode;
};

function FinalCta({
  eyebrow: eyebrowProp,
  headline,
  subhead,
  primaryHref = brand.finalCta.ctaHref,
  primaryLabel = brand.finalCta.ctaLabel,
  primaryLabelMobile = brand.finalCta.ctaLabel,
  secondaryHref,
  secondaryLabel,
  trustLine,
}: FinalCtaProps = {}) {
  const ui = useUi();
  const eyebrow = eyebrowProp ?? ui.getStarted;
  const defaultHeadline = brand.finalCta.headline;
  const defaultSubhead = brand.finalCta.subhead;
  const defaultTrust = (
    <>
      {brand.finalCta.trustLine.map((line) => (
        <span key={line} className="inline-flex items-center gap-1.5">
          <span className="text-champ-600">✓</span> {line}
        </span>
      ))}
    </>
  );
  return (
    <section id="cta" className="relative py-20 sm:py-28">
      <div
        className="orb"
        style={{
          width: 480,
          height: 480,
          background: "rgb(var(--brand-500) / 0.22)",
          top: -120,
          left: "8%",
        }}
      />
      <div
        className="orb"
        style={{
          width: 380,
          height: 380,
          background: "rgba(139,92,246,0.16)",
          bottom: -120,
          right: "8%",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          variants={staggerContainer(0.08)}
          className="glass rounded-[28px] sm:rounded-[32px] px-4 py-10 sm:px-16 sm:py-20 text-center relative overflow-hidden"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "var(--cta-wash, radial-gradient(80% 60% at 50% 0%, rgb(var(--brand-500) / 0.10) 0%, transparent 70%))",
            }}
          />

          <div className="relative">
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-champ-700 font-bold mb-5"
            >
              <span className="w-6 h-px bg-champ-500" /> {eyebrow}{" "}
              <span className="w-6 h-px bg-champ-500" />
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-clash text-3xl sm:text-5xl lg:text-6xl font-semibold leading-tight mb-6 text-[#213856] [text-wrap:balance]"
            >
              {headline ?? defaultHeadline}
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-slate-600 text-base sm:text-lg max-w-2xl mx-auto mb-10"
            >
              {subhead ?? defaultSubhead}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <a
                href={primaryHref}
                className="btn-primary inline-flex items-center justify-center gap-2 text-sm sm:text-base font-semibold px-5 sm:px-7 py-3 sm:py-4 rounded-2xl whitespace-nowrap"
              >
                <span className="sm:hidden">{primaryLabelMobile}</span>
                <span className="hidden sm:inline">{primaryLabel}</span>
                <ArrowRight />
              </a>
              {secondaryHref && secondaryLabel && (
                <a
                  href={secondaryHref}
                  className="btn-ghost inline-flex items-center justify-center gap-2 text-sm sm:text-base font-semibold px-5 sm:px-7 py-3 sm:py-4 rounded-2xl whitespace-nowrap"
                >
                  {secondaryLabel}
                </a>
              )}
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500"
            >
              {trustLine ?? defaultTrust}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  const ui = useUi();
  return (
    <footer className="relative text-slate-600 pb-10 pt-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="glass rounded-3xl px-6 sm:px-10 py-12 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
            <div className="col-span-2">
              <img src={brand.logo} alt={brand.logoAlt} className="h-8 mb-4" />
              <p className="text-sm text-slate-500 max-w-xs">
                {brand.footer.tagline}
              </p>
              <div className="flex items-center gap-2 mt-5">
                {brand.footer.social.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="w-9 h-9 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-slate-500 hover:text-champ-600 hover:ring-champ-500/40 transition"
                  >
                    <SocialIcon label={s.label} />
                  </a>
                ))}
              </div>
            </div>

            {brand.footer.columns.map((col) => (
              <FooterCol
                key={col.title}
                title={col.title}
                links={col.links.map(
                  (l) => [l.label, l.href] as [string, string],
                )}
              />
            ))}
            <FooterCol
              title={ui.support}
              links={[[ui.helpCentre, brand.helpUrl]]}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-12 pt-6 border-t border-slate-200/70 text-xs text-slate-500">
            <div>{brand.footer.copyright}</div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-champ-500 animate-pulse" />{" "}
                {ui.allSystemsOperational}
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Maps a social label to a brand glyph. Falls back to a generic link icon.
function SocialIcon({ label }: { label: string }) {
  const key = label.toLowerCase();
  if (key.includes("instagram")) return <IconInstagram size={14} />;
  if (key.includes("twitter") || key === "x") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z" />
      </svg>
    );
  }
  if (key.includes("linkedin")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
      </svg>
    );
  }
  return (
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<[string, string]>;
}) {
  return (
    <div>
      <div className="text-[#213856] text-sm font-semibold mb-3">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-slate-500 hover:text-champ-700 transition"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
