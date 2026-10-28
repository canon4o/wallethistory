"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import type { BudgetHint } from "@/lib/data/budgets";
import { currencySymbol, formatMoney } from "@/lib/format";
import { createBudget, updateBudget } from "@/lib/actions/budgets";
import { budgetSchema, type BudgetInput } from "@/lib/validation/budgets";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CategorySelect } from "@/components/categories/CategorySelect";
import { useT, useZodResolver } from "@/lib/i18n/client";

type BudgetFormProps = {
  /** Expense categories only: budgets track expenses. */
  categories: Array<{ id: string; name: string; icon: string; color: string }>;
  /** Present when editing. */
  budget?: { id: string } & BudgetInput;
  /** Last period's spending and the forecast per category id, to help choose the limit. */
  hints?: Record<string, BudgetHint>;
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

export function BudgetForm({ categories, budget, hints, onDone, onDelete }: BudgetFormProps) {
  const t = useT();
  const { currency } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BudgetInput>({
    resolver: useZodResolver(budgetSchema),
    defaultValues: budget ?? { categoryId: categories[0]?.id ?? "", amount: "", period: "monthly" },
  });

  const period = useWatch({ control, name: "period" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const hint = hints?.[categoryId]?.[period];
  const limitHint = hint
    ? `${period === "weekly" ? t("Last week") : t("Last month")}: ${formatMoney(Number(hint.lastSpent), currency)} · ${t("Forecast")}: ${
        hint.forecast === null ? "n/a" : formatMoney(Number(hint.forecast), currency)
      }`
    : undefined;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = budget ? await updateBudget(budget.id, values) : await createBudget(values);
    if (result.ok) {
      onDone();
      return;
    }
    applyFieldErrors(result, setError);
    setFormError(result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <CategorySelect
            id="budget-category"
            label={t("Category")}
            categories={categories}
            value={field.value}
            onChange={field.onChange}
            error={errors.categoryId?.message}
          />
        )}
      />
      <Select
        id="budget-period"
        label={t("Period")}
        hint={t("Weekly covers the current week (Monday to Sunday), monthly the current calendar month.")}
        error={errors.period?.message}
        {...register("period")}
      >
        <option value="monthly">{t("Monthly")}</option>
        <option value="weekly">{t("Weekly")}</option>
      </Select>
      <Input
        id="budget-amount"
        label={t("Limit ({symbol})", { symbol: currencySymbol(currency) })}
        inputMode="decimal"
        autoComplete="off"
        hint={limitHint}
        error={errors.amount?.message}
        {...register("amount")}
      />
      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : budget ? t("Save changes") : t("Add budget")}
      </FormActions>
    </form>
  );
}
