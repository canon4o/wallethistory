import translations from "./translations.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";

type Entry = { bg: string; es: string };
const TRANSLATIONS: Record<string, Entry | undefined> = translations;

export type Values = Record<string, string | number>;

/** Translates a message. The English text is the key; `{name}` placeholders are filled from `values`. */
export type Translate = ((text: string, values?: Values) => string) & {
  /** The language this function translates into (used to format dates). */
  locale?: Locale;
};

/**
 * Marks a string that is translated later (labels in constants, option lists). It returns its
 * input unchanged; the translation check finds it by name.
 */
export function msg<T extends string>(text: T): T {
  return text;
}

const SEPARATOR = "\u241f";

/**
 * A translatable message that carries its values (for example a limit used in a shared zod
 * schema). `translate` splits them off again, so the key in translations.json stays one text.
 */
export function msgWith(text: string, values: Values): string {
  return `${text}${SEPARATOR}${JSON.stringify(values)}`;
}

const PLURAL = /\{(\w+), plural,((?:\s*[\w=]+ \{[^{}]*\})+)\s*\}/g;
const PLURAL_CASE = /([\w=]+) \{([^{}]*)\}/g;

function plural(locale: Locale, source: string, values: Values): string {
  return source.replace(PLURAL, (_match, name: string, cases: string) => {
    const count = Number(values[name]);
    const options = new Map<string, string>();
    for (const found of cases.matchAll(PLURAL_CASE)) options.set(found[1], found[2]);
    const category = new Intl.PluralRules(locale).select(count);
    const chosen = options.get(`=${count}`) ?? options.get(category) ?? options.get("other") ?? "";
    return chosen.replaceAll("#", String(values[name]));
  });
}

export function translate(locale: Locale, source: string, extra?: Values): string {
  const [text, carried] = source.split(SEPARATOR);
  const values = carried ? { ...(JSON.parse(carried) as Values), ...extra } : extra;
  const entry = locale === DEFAULT_LOCALE ? undefined : TRANSLATIONS[text];
  let result = entry ? entry[locale as "bg" | "es"] || text : text;
  if (values) {
    result = plural(locale, result, values);
    result = result.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
  }
  return result;
}

export function translator(locale: Locale): Translate {
  return Object.assign((text: string, values?: Values) => translate(locale, text, values), { locale });
}
