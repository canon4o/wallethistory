import type { Locale } from "@/lib/i18n/locales";

/** Small inline flags (emoji flags do not render on Windows). English uses the UK flag. */
export function Flag({ locale }: { locale: Locale }) {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0 rounded-sm border border-border" aria-hidden="true" focusable="false">
      {locale === "bg" ? (
        <>
          <rect width="24" height="16" fill="#ffffff" />
          <rect y="5.33" width="24" height="5.34" fill="#00966e" />
          <rect y="10.67" width="24" height="5.33" fill="#d62612" />
        </>
      ) : locale === "es" ? (
        <>
          <rect width="24" height="16" fill="#c60b1e" />
          <rect y="4" width="24" height="8" fill="#ffc400" />
        </>
      ) : (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0l24 16M24 0L0 16" stroke="#ffffff" strokeWidth="3.2" />
          <path d="M0 0l24 16M24 0L0 16" stroke="#c8102e" strokeWidth="1.2" />
          <path d="M12 0v16M0 8h24" stroke="#ffffff" strokeWidth="5.2" />
          <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
