import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { WhatsAppFab } from "./lib/WhatsAppCTA";
import brand from "./brand.config";
import { brandThemeCss, themeCssFor, activeTheme } from "./lib/brandTheme";
import { themes, type ThemeName } from "./themes";
import { homeLayouts, type HomeLayoutName } from "./homeLayouts";
import { previewTheme, previewLayout, exitPreview } from "./lib/previewMode";

export default function Layout() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
    // If the URL has a hash (e.g. /#pricing), let the browser handle the anchor scroll.
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  // Sticky design preview: ?theme=nebula (or a remembered choice from earlier
  // in this browser session — see lib/previewMode.ts) reskins EVERY page until
  // the preview is exited. Pure client-side convenience; the built HTML always
  // carries the configured theme, and a fresh tab shows the configured look.
  const [preview, setPreview] = useState<{
    theme: ThemeName | null;
    layout: HomeLayoutName | null;
  }>({ theme: null, layout: null });

  useEffect(() => {
    const t = previewTheme(search);
    const l = previewLayout(search);
    setPreview({ theme: t, layout: l });
    // The previewed theme's fonts aren't in the static <head> — load them.
    if (t) {
      let link = document.getElementById(
        "theme-preview-fonts",
      ) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.id = "theme-preview-fonts";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = themes[t].fonts.googleHref;
    }
  }, [search, pathname]);

  // React owns the theme <style> tag, so the CSS is DERIVED here: configured
  // theme at build time (preview is always null during SSG), previewed theme
  // after hydration. Never mutate the tag imperatively — React re-renders
  // would silently restore the old CSS.
  const themeCss = preview.theme
    ? themeCssFor(themes[preview.theme])
    : brandThemeCss();

  const previewLabel = [
    preview.theme && `Theme: ${themes[preview.theme].label}`,
    preview.layout && `Layout: ${homeLayouts[preview.layout].label}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const title = `${brand.brandName} — ${brand.tagline}`;
  const ogImageUrl = brand.ogImage.startsWith("http")
    ? brand.ogImage
    : brand.siteUrl + brand.ogImage;

  return (
    <>
      {/* Brand colour theme, server-rendered into static HTML from brand.config.ts.
          Kept OUTSIDE <Head> because the head manager strips <style> children. */}
      <style id="brand-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />
      <Head>
        {/* Fonts for the active theme (see src/themes.ts). The preconnects
            live in index.html; this link swaps per theme at build time. */}
        <link rel="stylesheet" href={activeTheme.fonts.googleHref} />
        <link rel="icon" href={brand.favicon} />
        <link rel="apple-touch-icon" href={brand.favicon} />
        {/* Default meta — individual pages override title/description as needed. */}
        <title>{title}</title>
        <meta name="description" content={brand.tagline} />
        <meta property="og:site_name" content={brand.brandName} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={brand.tagline} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${brand.siteUrl}/`} />
        <meta property="og:image" content={ogImageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={brand.tagline} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <Outlet />
      {/* Floating "you are previewing" chip — client-only, never in the SSG HTML. */}
      {previewLabel && (
        <div className="fixed bottom-4 left-4 z-50">
          <div className="glass-pill rounded-full pl-4 pr-2 py-2 flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 shadow-lg">
            <span className="relative inline-flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-champ-500 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-champ-500" />
            </span>
            Previewing — {previewLabel}
            <button
              type="button"
              onClick={exitPreview}
              className="ml-1 px-2.5 py-1 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-slate-600 text-[11.5px] font-bold transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      )}
      <WhatsAppFab />
    </>
  );
}
