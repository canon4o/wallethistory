"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { translator, type Translate } from "./translate";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Gives client components the request's language (mounted once in the root layout). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Translate function for client components. */
export function useT(): Translate {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}

/** `zodResolver` whose error messages are translated, so shared schemas stay language-neutral. */
export function useZodResolver<Schema extends z.ZodType<FieldValues, FieldValues>>(
  schema: Schema,
): Resolver<z.input<Schema>, unknown, z.output<Schema>> {
  const t = useT();
  return useMemo(() => {
    const resolve = zodResolver(schema) as unknown as Resolver<z.input<Schema>, unknown, z.output<Schema>>;
    return async (values, context, options) => {
      const result = await resolve(values, context, options);
      translateErrors(result.errors, t, new Set());
      return result;
    };
  }, [schema, t]);
}

function translateErrors(errors: unknown, t: Translate, seen: Set<unknown>): void {
  if (!errors || typeof errors !== "object" || seen.has(errors)) return;
  seen.add(errors);
  const record = errors as { message?: unknown } & Record<string, unknown>;
  if (typeof record.message === "string") record.message = t(record.message);
  for (const [key, value] of Object.entries(record)) {
    if (key !== "ref" && value && typeof value === "object") translateErrors(value, t, seen);
  }
}
