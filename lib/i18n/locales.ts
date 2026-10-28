export const LOCALES = ["en", "bg", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that remembers the language, for signed-in and signed-out pages alike. */
export const LOCALE_COOKIE = "wh_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Each language in its own name, so a lost user can always find theirs. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  bg: "Български",
  es: "Español",
};

/** Narrows a stored or cookie value to a known locale, or `undefined`. */
export function parseLocale(value: unknown): Locale | undefined {
  return LOCALES.find((locale) => locale === value);
}

/** Picks the best supported language from an `Accept-Language` header (`bg-BG,bg;q=0.9,en;q=0.5`). */
export function matchAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { language: tag.trim().toLowerCase().split("-")[0], quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter((entry) => entry.language && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { language } of ranked) {
    const locale = parseLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
