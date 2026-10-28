import { z } from "zod";
import { LOCALES } from "@/lib/i18n/locales";

export const localeSchema = z.object({
  locale: z.enum(LOCALES, "Choose a language"),
});

export type LocaleInput = z.input<typeof localeSchema>;
