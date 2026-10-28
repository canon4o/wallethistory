import { z } from "zod";
import { isoDate } from "./dates";
import { positiveMoney } from "./money";
import { msg, msgWith } from "@/lib/i18n/translate";

const NOTE_MAX = 500;

export const transferSchema = z
  .object({
    fromAccountId: z.uuid(msg("Choose the account to move money from")),
    toAccountId: z.uuid(msg("Choose the account to move money to")),
    amount: positiveMoney,
    date: isoDate,
    note: z
      .string()
      .trim()
      .max(NOTE_MAX, msgWith("Note must be at most {max} characters", { max: NOTE_MAX }))
      .nullable()
      .transform((value) => (value === "" ? null : value)),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: msg("Choose two different accounts"),
    path: ["toAccountId"],
  });

export type TransferInput = z.input<typeof transferSchema>;
export type TransferData = z.output<typeof transferSchema>;
