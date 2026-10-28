import { z } from "zod";
import { RECURRING_FREQUENCIES } from "@/lib/recurring/dates";
import { idSchema } from "./common";
import { isoDate } from "./dates";
import { positiveMoney } from "./money";
import { msg, msgWith } from "@/lib/i18n/translate";

const KINDS = ["income", "expense", "transfer", "goal"] as const;
const NOTE_MAX = 500;
const MAX_TAGS = 20;
export const MAX_INTERVAL = 365;

/** An optional id from a select: "" means "none". `null`/`undefined` are accepted too. */
const optionalId = z
  .union([idSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const rawRule = z.object({
  kind: z.enum(KINDS, msg("Choose income, expense, transfer or goal")),
  amount: positiveMoney,
  accountId: optionalId,
  categoryId: optionalId,
  fromAccountId: optionalId,
  toAccountId: optionalId,
  goalId: optionalId,
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS, msgWith("Use at most {max} tags", { max: MAX_TAGS }))
    .transform((ids) => [...new Set(ids)])
    .default([]),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, msgWith("Note must be at most {max} characters", { max: NOTE_MAX }))
    .nullable()
    .transform((value) => (value === "" ? null : value)),
  frequency: z.enum(RECURRING_FREQUENCIES, msg("Choose how often it repeats")),
  intervalCount: z.coerce
    .number(msg("Enter a whole number"))
    .int(msg("Enter a whole number"))
    .min(1, msg("Must be at least 1"))
    .max(MAX_INTERVAL, msgWith("Must be at most {max}", { max: MAX_INTERVAL })),
  startDate: isoDate,
  endDate: z
    .union([isoDate, z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
});

type RawRule = z.output<typeof rawRule>;

type RuleCommon = Omit<RawRule, "kind" | "accountId" | "categoryId" | "fromAccountId" | "toAccountId" | "goalId" | "tagIds">;

/** A validated rule. The fields that do not apply to the kind are absent, not null. */
export type RecurringRuleData =
  | (RuleCommon & { kind: "income" | "expense"; accountId: string; categoryId: string | null; tagIds: string[] })
  | (RuleCommon & { kind: "transfer"; fromAccountId: string; toAccountId: string })
  /** Pays `accountId` money into the goal on a schedule. */
  | (RuleCommon & { kind: "goal"; accountId: string; goalId: string });

export const recurringRuleSchema = rawRule
  .superRefine((data, ctx) => {
    if (data.kind === "transfer") {
      if (!data.fromAccountId) ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: msg("Choose the account to move money from") });
      if (!data.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: msg("Choose the account to move money to") });
      if (data.fromAccountId && data.fromAccountId === data.toAccountId) {
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: msg("Choose two different accounts") });
      }
    } else if (!data.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: msg("Choose an account") });
    }
    if (data.kind === "goal" && !data.goalId) {
      ctx.addIssue({ code: "custom", path: ["goalId"], message: msg("Choose a goal") });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: msg("End date must be on or after the start date") });
    }
  })
  .transform((data): RecurringRuleData => {
    const { kind, accountId, categoryId, fromAccountId, toAccountId, goalId, tagIds, ...common } = data;
    if (kind === "transfer") {
      return { ...common, kind, fromAccountId: fromAccountId as string, toAccountId: toAccountId as string };
    }
    if (kind === "goal") return { ...common, kind, accountId: accountId as string, goalId: goalId as string };
    return { ...common, kind, accountId: accountId as string, categoryId, tagIds };
  });

export type RecurringRuleInput = z.input<typeof recurringRuleSchema>;

/** The statuses a user can switch a rule to; "ended" is only ever set by the system. */
export const recurringStatusChangeSchema = z.enum(["active", "paused"]);
