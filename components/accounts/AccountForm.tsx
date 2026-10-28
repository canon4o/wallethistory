"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { currencySymbol } from "@/lib/format";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { ACCOUNT_ICON_KEYS } from "@/lib/account-icons";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_DEFAULTS, ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { accountSchema, type AccountInput } from "@/lib/validation/accounts";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AccountBadge, AccountIcon } from "./AccountIcon";
import { useT, useZodResolver } from "@/lib/i18n/client";

const pickerLegend = "text-sm font-semibold";
const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong";

type AccountFormProps = {
  /** Present when editing. */
  account?: { id: string } & Omit<AccountInput, "color" | "icon"> & { color: string; icon: string };
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

export function AccountForm({ account, onDone, onDelete }: AccountFormProps) {
  const t = useT();
  const { currency } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AccountInput>({
    resolver: useZodResolver(accountSchema),
    // Stored color/icon are strings; anything outside the palette/list fails validation on save.
    defaultValues: (account as AccountInput | undefined) ?? {
      name: "",
      type: "bank",
      ...(ACCOUNT_TYPE_DEFAULTS.bank as Pick<AccountInput, "color" | "icon">),
      initialBalance: "0",
      isDefault: false,
    },
  });
  const [color, icon, name] = useWatch({ control, name: ["color", "icon", "name"] });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = account ? await updateAccount(account.id, values) : await createAccount(values);
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
      <Input id="account-name" label={t("Name")} error={errors.name?.message} {...register("name")} />
      <Select id="account-type" label={t("Type")} error={errors.type?.message} {...register("type")}>
        {ACCOUNT_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(ACCOUNT_TYPE_LABELS[type])}
          </option>
        ))}
      </Select>
      <fieldset className="flex flex-col gap-1">
        <legend className={pickerLegend}>{t("Icon")}</legend>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {ACCOUNT_ICON_KEYS.map((key) => (
            <label key={key} className="relative" title={key}>
              <input type="radio" value={key} className="peer sr-only" aria-label={key} {...register("icon")} />
              <span
                className={`flex size-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted hover:bg-background peer-checked:border-primary-strong peer-checked:bg-primary-soft peer-checked:text-primary-soft-foreground ${focusRing}`}
              >
                <AccountIcon icon={key} />
              </span>
            </label>
          ))}
        </div>
        {errors.icon?.message ? (
          <p role="alert" className="text-xs font-semibold text-expense-text">
            {errors.icon.message}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className={pickerLegend}>{t("Color")}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((value) => (
            <label key={value} className="relative">
              <input type="radio" value={value} className="peer sr-only" aria-label={value} {...register("color")} />
              <span
                className={`flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-transparent peer-checked:border-text ${focusRing}`}
                style={{ backgroundColor: value }}
              />
            </label>
          ))}
        </div>
        {errors.color?.message ? (
          <p role="alert" className="text-xs font-semibold text-expense-text">
            {errors.color.message}
          </p>
        ) : null}
      </fieldset>

      <div className="flex items-center gap-2 text-sm text-muted">
        {t("Preview")}
        <AccountBadge icon={icon} color={color} size="lg" />
        <span className="font-semibold text-text">{name || t("Account name")}</span>
      </div>

      <Input
        id="account-initial-balance"
        label={t("Initial balance ({symbol})", { symbol: currencySymbol(currency) })}
        inputMode="decimal"
        hint={t("The balance before any transactions. The current balance is calculated.")}
        error={errors.initialBalance?.message}
        {...register("initialBalance")}
      />
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
          {...register("isDefault")}
        />
        {t("Use as default account")}
      </label>
      <p className="-mt-3 text-xs text-muted">{t("Preselected when you add a transaction. Only one account can be the default.")}</p>
      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : account ? t("Save changes") : t("Add account")}
      </FormActions>
    </form>
  );
}
