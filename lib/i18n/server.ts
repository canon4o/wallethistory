import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, DEFAULT_LOCALE, matchAcceptLanguage, parseLocale, type Locale } from "./locales";
import { translator, type Translate } from "./translate";

/** The request's language: the `wh_locale` cookie, else the browser's `Accept-Language`, else English. */
export async function getLocale(): Promise<Locale> {
  try {
    const saved = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    if (saved) return saved;
    return matchAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    // Outside a request (for example a background job) there is no browser to ask.
    return DEFAULT_LOCALE;
  }
}

/** Translate function for Server Components, Server Actions and emails sent from them. */
export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
