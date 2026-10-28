import { z } from "zod";
import { BUDGET_PERIODS } from "@/lib/budget-period";
import { positiveMoney } from "./money";
import { msg } from "@/lib/i18n/translate";

export const budgetSchema = z.object({
  categoryId: z.uuid(msg("Choose an expense category")),
  amount: positiveMoney,
  period: z.enum(BUDGET_PERIODS, msg("Choose weekly or monthly")),
});

export type BudgetInput = z.input<typeof budgetSchema>;
