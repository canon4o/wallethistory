"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { createRecurringRule } from "@/lib/actions/recurring";
import { addGoalContribution, updateGoalContribution } from "@/lib/actions/goal-contributions";
import { todayISO } from "@/lib/budget-period";
import { currencySymbol, formatMoney } from "@/lib/format";
import {
  goalContributionSchema,
  type GoalContributionData,
  type GoalContributionInput,
} from "@/lib/validation/goals";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { AccountSelect, type AccountSelectItem } from "@/components/accounts/AccountSelect";
import { DEFAULT_REPEAT, RepeatFields, splitRepeatErrors, type RepeatErrors, type RepeatValue } from "@/components/recurring/RepeatFields";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useT, useZodResolver } from "@/lib/i18n/client";

type GoalContributionFormProps = {
  goal: { id: string; name: string; completed: boolean };
  /** "deposit" puts money in, "withdrawal" takes it back out. */
  type: "deposit" | "withdrawal";
  /** The user's own accounts. */
  accounts: AccountSelectItem[];
  /** What the user can still take out (their own net contributions); shown as a hint for withdrawals. */
  withdrawable?: number;
  /** Present when editing one of my own contributions. */
  contribution?: { id: string; accountId: string; amount: string; date: string; note: string };
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

export function GoalContributionForm({ goal, type, accounts, withdrawable, contribution, onDone, onDelete }: GoalContributionFormProps) {
  const t = useT();
  const { currency, timezone } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatValue>(DEFAULT_REPEAT);
  const [repeatErrors, setRepeatErrors] = useState<RepeatErrors>({});
  const deposit = type === "deposit";
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<GoalContributionInput, unknown, GoalContributionData>({
    resolver: useZodResolver(goalContributionSchema),
    defaultValues: {
      goalId: goal.id,
      type,
      accountId: contribution?.accountId ?? accounts[0]?.id ?? "",
      amount: contribution?.amount ?? "",
      date: contribution?.date ?? todayISO(timezone),
      note: contribution?.note ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setRepeatErrors({});
    const repeating = deposit && !contribution && repeat.enabled;
    const result = contribution
      ? await updateGoalContribution(contribution.id, {
          accountId: values.accountId,
          amount: values.amount,
          date: values.date,
          note: values.note,
        })
      : repeating
        ? await createRecurringRule({
            kind: "goal",
            amount: values.amount,
            accountId: values.accountId,
            goalId: values.goalId,
            note: values.note,
            frequency: repeat.frequency,
            intervalCount: repeat.intervalCount,
            startDate: values.date,
            endDate: repeat.endDate,
          })
        : await addGoalContribution(values);
    if (result.ok) {
      onDone();
      return;
    }
    if (repeating) {
      const split = splitRepeatErrors(result);
      setRepeatErrors(split.repeat);
      applyFieldErrors(split.form, setError);
    } else {
      applyFieldErrors(result, setError);
    }
    setFormError(result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {deposit && goal.completed && !contribution ? (
        <Alert tone="info">{t("{name} has already reached its target. You can still add more.", { name: goal.name })}</Alert>
      ) : null}
      <input type="hidden" {...register("goalId")} />
      <input type="hidden" {...register("type")} />

      <Controller
        control={control}
        name="accountId"
        render={({ field }) => (
          <AccountSelect
            id="contribution-account"
            label={deposit ? t("From account") : t("To account")}
            accounts={accounts}
            value={field.value}
            onChange={field.onChange}
            error={errors.accountId?.message}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="contribution-amount"
          label={t("Amount ({symbol})", { symbol: currencySymbol(currency) })}
          inputMode="decimal"
          autoComplete="off"
          hint={!deposit && withdrawable !== undefined ? t("You can take out up to {amount}.", { amount: formatMoney(withdrawable, currency) }) : undefined}
          error={errors.amount?.message}
          {...register("amount")}
        />
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateInput id="contribution-date" label={t("Date")} value={field.value ?? ""} onChange={field.onChange} error={errors.date?.message} />
          )}
        />
      </div>

      <Textarea id="contribution-note" label={t("Note")} error={errors.note?.message} {...register("note")} />

      {deposit && !contribution ? (
        <RepeatFields idPrefix="contribution-repeat" value={repeat} onChange={setRepeat} errors={repeatErrors} />
      ) : null}

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting
            ? t("Saving…")
            : contribution
              ? t("Save changes")
              : deposit
                ? repeat.enabled
                  ? t("Add recurring deposit")
                  : t("Add money")
                : t("Take money out")}
      </FormActions>
    </form>
  );
}
