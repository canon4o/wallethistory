import type { Translate } from "@/lib/i18n/translate";

/** Browser name and OS from a user agent, good enough to tell devices apart. */
export function describeUserAgent(userAgent: string | null, t: Translate): string {
  if (!userAgent) return t("Unknown");
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\/|Opera/.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : t("Other browser");
  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "";
  return os ? t("{browser} on {os}", { browser, os }) : browser;
}
