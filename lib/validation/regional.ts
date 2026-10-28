import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";
import { normalizeTimezone } from "@/lib/timezones";
import { msg } from "@/lib/i18n/translate";

export const currencyField = z.enum(CURRENCY_CODES, msg("Choose a currency"));

export const timezoneField = z
  .string(msg("Choose a timezone"))
  .trim()
  .transform((value, ctx) => {
    const timezone = normalizeTimezone(value);
    if (!timezone) {
      ctx.addIssue({ code: "custom", message: msg("Choose a valid timezone") });
      return z.NEVER;
    }
    return timezone;
  });

export const regionalSettingsSchema = z.object({
  currency: currencyField,
  timezone: timezoneField,
});

/** Admin edit of one user's settings. */
export const adminRegionalSettingsSchema = regionalSettingsSchema.extend({ userId: z.uuid() });

export type RegionalSettingsInput = z.input<typeof regionalSettingsSchema>;
export type AdminRegionalSettingsInput = z.input<typeof adminRegionalSettingsSchema>;
