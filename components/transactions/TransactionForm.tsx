"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { todayISO } from "@/lib/budget-period";
import { currencySymbol } from "@/lib/format";
import { createRecurringRule } from "@/lib/actions/recurring";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import {
  transactionSchema,
  type TransactionData,
  type TransactionInput,
} from "@/lib/validation/transactions";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { AccountSelect, type AccountSelectItem } from "@/components/accounts/AccountSelect";
import { CategorySelect, type CategorySelectItem } from "@/components/categories/CategorySelect";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { DEFAULT_REPEAT, RepeatFields, splitRepeatErrors, type RepeatErrors, type RepeatValue } from "@/components/recurring/RepeatFields";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useT, useZodResolver } from "@/lib/i18n/client";

export type TransactionFormOptions = {
  accounts: AccountSelectItem[];
  categories: Array<CategorySelectItem & { type: "income" | "expense" }>;
  tags: Array<{ id: string; name: string }>;
  /** Preselected on a new transaction; falls back to the first account. */
  defaultAccountId?: string;
};

type TransactionFormProps = TransactionFormOptions & {
  /** Present when editing. */
  transaction?: { id: string } & TransactionInput;
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong";

export function TransactionForm({ accounts, categories, tags, defaultAccountId, transaction, onDone, onDelete }: TransactionFormProps) {
  const t = useT();
  const { currency, timezone } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatValue>(DEFAULT_REPEAT);
  const [repeatErrors, setRepeatErrors] = useState<RepeatErrors>({});
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransactionInput, unknown, TransactionData>({
    resolver: useZodResolver(transactionSchema),
    defaultValues: transaction ?? {
      type: "expense",
      amount: "",
      date: todayISO(timezone),
      accountId: accounts.find((account) => account.id === defaultAccountId)?.id ?? accounts[0]?.id ?? "",
      categoryId: "",
      tagIds: [],
      note: "",
    },
  });
  const type = useWatch({ control, name: "type" });
  const visibleCategories = categories.filter((category) => category.type === type);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setRepeatErrors({});
    const repeating = !transaction && repeat.enabled;
    const result = transaction
      ? await updateTransaction(transaction.id, values)
      : repeating
        ? await createRecurringRule({
            kind: values.type,
            amount: values.amount,
            accountId: values.accountId,
            categoryId: values.categoryId,
            tagIds: values.tagIds,
            note: values.note,
            frequency: repeat.frequency,
            intervalCount: repeat.intervalCount,
            startDate: values.date,
            endDate: repeat.endDate,
          })
        : await createTransaction(values);
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

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{t("Type")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as const).map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                value={value}
                className="peer sr-only"
                {...register("type", {
                  // A category only fits one type, so picking the other type clears it.
                  onChange: () => setValue("categoryId", ""),
                })}
              />
              <span
                className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-sm font-semibold capitalize peer-checked:border-transparent peer-checked:text-on-accent ${
                  value === "income" ? "peer-checked:bg-income" : "peer-checked:bg-expense"
                } ${focusRing}`}
              >
                {value === "income" ? t("Income") : t("Expense")}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="transaction-amount"
          label={t("Amount ({symbol})", { symbol: currencySymbol(currency) })}
          inputMode="decimal"
          autoComplete="off"
          error={errors.amount?.message}
          {...register("amount")}
        />
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateInput id="transaction-date" label={t("Date")} value={field.value ?? ""} onChange={field.onChange} error={errors.date?.message} />
          )}
        />
      </div>

      <Controller
        control={control}
        name="accountId"
        render={({ field }) => (
          <AccountSelect
            id="transaction-account"
            label={t("Account")}
            accounts={accounts}
            value={field.value}
            onChange={field.onChange}
            error={errors.accountId?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <CategorySelect
            id="transaction-category"
            label={t("Category")}
            categories={visibleCategories}
            emptyLabel={t("No category")}
            value={field.value ?? ""}
            onChange={field.onChange}
            error={errors.categoryId?.message}
          />
        )}
      />

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{t("Tags")}</legend>
        {tags.length === 0 ? (
          <p className="text-xs text-muted">{t("No tags yet. You can create tags under Profile → Tags.")}</p>
        ) : (
          <Controller
            control={control}
            name="tagIds"
            render={({ field }) => {
              const selected = field.value ?? [];
              return (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <label key={tag.id} className="relative">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={selected.includes(tag.id)}
                        onChange={(event) =>
                          field.onChange(
                            event.target.checked
                              ? [...selected, tag.id]
                              : selected.filter((id) => id !== tag.id),
                          )
                        }
                      />
                      <span
                        className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border border-border bg-surface px-3 text-sm peer-checked:border-primary-strong peer-checked:bg-primary-soft peer-checked:font-semibold peer-checked:text-primary-soft-foreground ${focusRing}`}
                      >
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              );
            }}
          />
        )}
        {errors.tagIds?.message ? (
          <p role="alert" className="text-xs font-semibold text-expense-text">
            {errors.tagIds.message}
          </p>
        ) : null}
      </fieldset>

      <Textarea id="transaction-note" label={t("Note")} error={errors.note?.message} {...register("note")} />

      {transaction ? null : <RepeatFields idPrefix="transaction-repeat" value={repeat} onChange={setRepeat} errors={repeatErrors} />}

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : transaction ? t("Save changes") : repeat.enabled ? t("Add recurring transaction") : t("Add transaction")}
      </FormActions>
    </form>
  );
}
