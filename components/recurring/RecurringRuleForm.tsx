"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { todayISO } from "@/lib/budget-period";
import { currencySymbol } from "@/lib/format";
import { createRecurringRule, updateRecurringRule } from "@/lib/actions/recurring";
import {
  recurringRuleSchema,
  type RecurringRuleData,
  type RecurringRuleInput,
} from "@/lib/validation/recurring";
import { FREQUENCY_OPTIONS } from "@/lib/recurring/labels";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { AccountSelect, type AccountSelectItem } from "@/components/accounts/AccountSelect";
import { CategorySelect, type CategorySelectItem } from "@/components/categories/CategorySelect";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useT, useZodResolver } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

export type RecurringFormOptions = {
  accounts: AccountSelectItem[];
  /** Where a recurring transfer can send money: own accounts plus household members' accounts. */
  transferTargets: AccountSelectItem[];
  categories: Array<CategorySelectItem & { type: "income" | "expense" }>;
  tags: Array<{ id: string; name: string }>;
  /** Open goals a recurring deposit can pay into: the user's own plus shared ones. */
  goals: Array<{ id: string; name: string }>;
};

type RecurringRuleFormProps = RecurringFormOptions & {
  /** Present when editing. */
  rule?: { id: string } & RecurringRuleInput;
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

const KINDS = ["expense", "income", "transfer", "goal"] as const;
const KIND_LABELS = { expense: msg("Expense"), income: msg("Income"), transfer: msg("Transfer"), goal: msg("Goal") } as const;
const KIND_COLORS = {
  expense: "peer-checked:bg-expense",
  income: "peer-checked:bg-income",
  transfer: "peer-checked:bg-accounts",
  goal: "peer-checked:bg-goals",
} as const;
const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong";

/** The whole rule: what it creates and how often. Used to add a rule here and to edit one. */
export function RecurringRuleForm({ accounts, transferTargets, categories, tags, goals, rule, onDone, onDelete }: RecurringRuleFormProps) {
  const t = useT();
  const { currency, timezone } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RecurringRuleInput, unknown, RecurringRuleData>({
    resolver: useZodResolver(recurringRuleSchema),
    defaultValues: rule ?? {
      kind: "expense",
      amount: "",
      accountId: accounts[0]?.id ?? "",
      categoryId: "",
      fromAccountId: accounts[0]?.id ?? "",
      toAccountId: transferTargets.find((account) => account.id !== accounts[0]?.id)?.id ?? "",
      goalId: goals[0]?.id ?? "",
      tagIds: [],
      note: "",
      frequency: "monthly",
      intervalCount: "1",
      startDate: todayISO(timezone),
      endDate: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const fromAccountId = useWatch({ control, name: "fromAccountId" });
  const visibleCategories = categories.filter((category) => category.type === kind);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = rule ? await updateRecurringRule(rule.id, values) : await createRecurringRule(values);
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

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{t("Type")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                value={value}
                className="peer sr-only"
                {...register("kind", {
                  // A category only fits one type, so changing the type clears it.
                  onChange: () => setValue("categoryId", ""),
                })}
              />
              <span
                className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-sm font-semibold capitalize peer-checked:border-transparent peer-checked:text-on-accent ${KIND_COLORS[value]} ${focusRing}`}
              >
                {t(KIND_LABELS[value])}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        id="rule-amount"
        label={t("Amount ({symbol})", { symbol: currencySymbol(currency) })}
        inputMode="decimal"
        autoComplete="off"
        error={errors.amount?.message}
        {...register("amount")}
      />

      {kind === "transfer" ? (
        <>
          <Controller
            control={control}
            name="fromAccountId"
            render={({ field }) => (
              <AccountSelect
                id="rule-from"
                label={t("From account")}
                accounts={accounts}
                value={field.value ?? ""}
                onChange={(value) => {
                  field.onChange(value);
                  // The same account can't be on both sides: move "To" to another account.
                  if (getValues("toAccountId") === value) {
                    setValue("toAccountId", transferTargets.find((account) => account.id !== value)?.id ?? "");
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
                id="rule-to"
                label={t("To account")}
                accounts={transferTargets}
                excludeId={fromAccountId ?? undefined}
                value={field.value ?? ""}
                onChange={field.onChange}
                error={errors.toAccountId?.message}
              />
            )}
          />
        </>
      ) : kind === "goal" ? (
        <>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <AccountSelect
                id="rule-goal-account"
                label={t("From account")}
                accounts={accounts}
                value={field.value ?? ""}
                onChange={field.onChange}
                error={errors.accountId?.message}
              />
            )}
          />
          <Select id="rule-goal" label={t("Goal")} error={errors.goalId?.message} {...register("goalId")}>
            {goals.length === 0 ? <option value="">{t("No open goals")}</option> : null}
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </Select>
          <p className="-mt-2 text-xs text-muted">{t("The rule stops by itself once the goal reaches its target.")}</p>
        </>
      ) : (
        <>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <AccountSelect
                id="rule-account"
                label={t("Account")}
                accounts={accounts}
                value={field.value ?? ""}
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
                id="rule-category"
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
                                event.target.checked ? [...selected, tag.id] : selected.filter((id) => id !== tag.id),
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
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="rule-interval"
          label={t("Every")}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          error={errors.intervalCount?.message}
          {...register("intervalCount")}
        />
        <Select id="rule-frequency" label={t("Frequency")} error={errors.frequency?.message} {...register("frequency")}>
          {FREQUENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <DateInput id="rule-start" label={t("First entry on")} value={field.value ?? ""} onChange={field.onChange} error={errors.startDate?.message} />
          )}
        />
        <Controller
          control={control}
          name="endDate"
          render={({ field }) => (
            <DateInput id="rule-end" label={t("Ends on (optional)")} value={field.value ?? ""} onChange={field.onChange} clearable error={errors.endDate?.message} />
          )}
        />
      </div>
      {rule ? (
        <p className="-mt-2 text-xs text-muted">
          {t("Changes apply to future entries only. Entries already created stay as they are.")}
        </p>
      ) : null}

      <Textarea id="rule-note" label={t("Note")} error={errors.note?.message} {...register("note")} />

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : rule ? t("Save changes") : t("Add recurring")}
      </FormActions>
    </form>
  );
}
