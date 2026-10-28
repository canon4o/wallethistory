import { z } from "zod";
import { BUDGET_ALERT_LEVELS, MAX_ALERT_THRESHOLD, MIN_ALERT_THRESHOLD } from "@/lib/budget-alerts";
import { isoDate } from "./dates";
import { msg } from "@/lib/i18n/translate";

const THRESHOLD_MESSAGE = msg("Choose a warning level between 50% and 99%");

export const budgetAlertSettingsSchema = z.object({
  enabled: z.boolean(msg("Choose whether budget alerts are on")),
  threshold: z
    .number(THRESHOLD_MESSAGE)
    .int(THRESHOLD_MESSAGE)
    .min(MIN_ALERT_THRESHOLD, THRESHOLD_MESSAGE)
    .max(MAX_ALERT_THRESHOLD, THRESHOLD_MESSAGE),
});

export const dismissBudgetAlertSchema = z.object({
  budgetId: z.uuid(msg("Invalid id")),
  level: z.enum(BUDGET_ALERT_LEVELS, msg("Invalid alert")),
  periodStart: isoDate,
});

export type BudgetAlertSettingsInput = z.input<typeof budgetAlertSettingsSchema>;
export type DismissBudgetAlertInput = z.input<typeof dismissBudgetAlertSchema>;
