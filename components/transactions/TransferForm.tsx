"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { todayISO } from "@/lib/budget-period";
import { currencySymbol } from "@/lib/format";
import { createRecurringRule } from "@/lib/actions/recurring";
import { createTransfer, updateTransfer } from "@/lib/actions/transfers";
import { transferSchema, type TransferData, type TransferInput } from "@/lib/validation/transfers";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { AccountSelect, type AccountSelectItem } from "@/components/accounts/AccountSelect";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { DEFAULT_REPEAT, RepeatFields, splitRepeatErrors, type RepeatErrors, type RepeatValue } from "@/components/recurring/RepeatFields";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useT, useZodResolver } from "@/lib/i18n/client";

type TransferFormProps = {
  /** The user's own accounts: where money can come from. */
  accounts: AccountSelectItem[];
  /** Where money can go: own accounts plus household members' accounts. Defaults to `accounts`. */
  toAccounts?: AccountSelectItem[];
  /** Present when editing. */
  transfer?: { id: string } & TransferInput;
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

export function TransferForm({ accounts, toAccounts = accounts, transfer, onDone, onDelete }: TransferFormProps) {
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
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransferInput, unknown, TransferData>({
    resolver: useZodResolver(transferSchema),
    defaultValues: transfer ?? {
      fromAccountId: accounts[0]?.id ?? "",
      toAccountId: toAccounts.find((account) => account.id !== accounts[0]?.id)?.id ?? "",
      amount: "",
      date: todayISO(timezone),
      note: "",
    },
  });

  const fromAccountId = useWatch({ control, name: "fromAccountId" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setRepeatErrors({});
    const repeating = !transfer && repeat.enabled;
    const result = transfer
      ? await updateTransfer(transfer.id, values)
      : repeating
        ? await createRecurringRule({
            kind: "transfer",
            amount: values.amount,
            fromAccountId: values.fromAccountId,
            toAccountId: values.toAccountId,
            note: values.note,
            frequency: repeat.frequency,
            intervalCount: repeat.intervalCount,
            startDate: values.date,
            endDate: repeat.endDate,
          })
        : await createTransfer(values);
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

      <Controller
        control={control}
        name="fromAccountId"
        render={({ field }) => (
          <AccountSelect
            id="transfer-from"
            label={t("From account")}
            accounts={accounts}
            value={field.value}
            onChange={(value) => {
              field.onChange(value);
              // The same account can't be on both sides: move "To" to another account.
              if (getValues("toAccountId") === value) {
                setValue("toAccountId", toAccounts.find((account) => account.id !== value)?.id ?? "");
              }
            }}
            error={errors.fromAccountId?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="toAccountId"
        render={({ field }) => (
          <AccountSelect
            id="transfer-to"
            label={t("To account")}
            accounts={toAccounts}
            excludeId={fromAccountId}
            value={field.value}
            onChange={field.onChange}
            error={errors.toAccountId?.message}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="transfer-amount"
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
            <DateInput id="transfer-date" label={t("Date")} value={field.value ?? ""} onChange={field.onChange} error={errors.date?.message} />
          )}
        />
      </div>

      <Textarea id="transfer-note" label={t("Note")} error={errors.note?.message} {...register("note")} />

      {transfer ? null : <RepeatFields idPrefix="transfer-repeat" value={repeat} onChange={setRepeat} errors={repeatErrors} />}

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : transfer ? t("Save changes") : repeat.enabled ? t("Add recurring transfer") : t("Add transfer")}
      </FormActions>
    </form>
  );
}
