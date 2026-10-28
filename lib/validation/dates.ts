import { z } from "zod";
import { msg } from "@/lib/i18n/translate";

/** A real calendar date as `YYYY-MM-DD` (the format of a Postgres `date` and `<input type="date">`). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, msg("Enter a valid date"))
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, msg("Enter a valid date"));
