// One conversion mechanic, site-wide: a floating WhatsApp (or any contact)
// button. The destination is set once in brand.config.ts → whatsAppLink.
import brand from "../brand.config";

const WA_LINK = brand.whatsAppLink;

function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WhatsAppCTA({
  label = "Chat with us",
  variant = "primary",
  className = "",
}: {
  label?: string;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-base font-semibold transition-all";
  const styles =
    variant === "ghost"
      ? "ring-1 ring-slate-200 bg-white text-[#213856] hover:ring-champ-500/40 hover:text-champ-700"
      : "btn-primary pulse-glow text-white";
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener"
      className={`${base} ${styles} ${className}`}
    >
      <WhatsAppGlyph />
      <span>{label}</span>
      <span aria-hidden>→</span>
    </a>
  );
}

export function WhatsAppFab() {
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener"
      aria-label="Chat with the AI"
      className="accent-glow fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 inline-flex items-center justify-center gap-2 rounded-full bg-champ-500 text-white shadow-lg shadow-champ-500/40 w-14 h-14 sm:w-auto sm:h-auto sm:px-5 sm:py-3 hover:scale-105 transition-transform"
    >
      <WhatsAppGlyph size={24} />
      <span className="hidden sm:inline font-semibold text-sm whitespace-nowrap">
        Chat with the AI
      </span>
    </a>
  );
}
