import { z } from "zod";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { CATEGORY_ICON_KEYS } from "@/lib/category-icons";
import { isoDate } from "./dates";
import { positiveMoney } from "./money";
import { msg, msgWith } from "@/lib/i18n/translate";

export const GOAL_NAME_MAX = 80;
const NOTE_MAX = 500;

const note = z
  .string()
  .trim()
  .max(NOTE_MAX, msgWith("Note must be at most {max} characters", { max: NOTE_MAX }))
  .nullable()
  .transform((value) => (value === "" ? null : value));

export const goalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg("Name is required"))
    .max(GOAL_NAME_MAX, msgWith("Name must be at most {max} characters", { max: GOAL_NAME_MAX })),
  targetAmount: positiveMoney,
  /** Optional. A blank date means no deadline. */
  deadline: z
    .union([isoDate, z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  color: z.enum(CATEGORY_COLORS, msg("Choose a color")),
  icon: z.enum(CATEGORY_ICON_KEYS, msg("Choose an icon")),
  shared: z.boolean(),
  note,
});

export type GoalInput = z.input<typeof goalSchema>;
export type GoalData = z.output<typeof goalSchema>;

const contributionFields = {
  accountId: z.uuid(msg("Choose an account")),
  amount: positiveMoney,
  date: isoDate,
  note,
};

/** Adds money to a goal ("deposit") or takes it back out to an account ("withdrawal"). */
export const goalContributionSchema = z.object({
  goalId: z.uuid(msg("Choose a goal")),
  type: z.enum(["deposit", "withdrawal"], msg("Choose deposit or withdrawal")),
  ...contributionFields,
});

/** The goal and the direction of an existing contribution never change. */
export const goalContributionUpdateSchema = z.object(contributionFields);

export type GoalContributionInput = z.input<typeof goalContributionSchema>;
export type GoalContributionData = z.output<typeof goalContributionSchema>;
export type GoalContributionUpdateData = z.output<typeof goalContributionUpdateSchema>;
