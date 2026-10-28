"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRegion } from "@/components/layout/RegionProvider";
import { createGoal, updateGoal } from "@/lib/actions/goals";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { CATEGORY_ICON_KEYS } from "@/lib/category-icons";
import { currencySymbol } from "@/lib/format";
import { goalSchema, type GoalData, type GoalInput } from "@/lib/validation/goals";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { CategoryBadge, CategoryIcon } from "@/components/categories/CategoryIcon";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useT, useZodResolver } from "@/lib/i18n/client";

type GoalFormProps = {
  /** Present when editing. */
  goal?: { id: string } & Omit<GoalInput, "color" | "icon"> & { color: string; icon: string };
  /** Sharing needs a household; without one the switch is disabled (unless the goal is already shared). */
  inHousehold: boolean;
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

const pickerLegend = "text-sm font-semibold";
const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong";

export function GoalForm({ goal, inHousehold, onDone, onDelete }: GoalFormProps) {
  const t = useT();
  const { currency } = useRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<GoalInput, unknown, GoalData>({
    resolver: useZodResolver(goalSchema),
    // Stored color/icon are strings; anything outside the palette/list fails validation on save.
    defaultValues: (goal as GoalInput | undefined) ?? {
      name: "",
      targetAmount: "",
      deadline: "",
      color: CATEGORY_COLORS[5],
      icon: "piggy-bank",
      shared: false,
      note: "",
    },
  });
  const [color, icon, name] = useWatch({ control, name: ["color", "icon", "name"] });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = goal ? await updateGoal(goal.id, values) : await createGoal(values);
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

      <Input id="goal-name" label={t("Name")} placeholder={t("Travel to Japan")} error={errors.name?.message} {...register("name")} />

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="goal-target"
          label={t("Target ({symbol})", { symbol: currencySymbol(currency) })}
          inputMode="decimal"
          autoComplete="off"
          error={errors.targetAmount?.message}
          {...register("targetAmount")}
        />
        <Controller
          control={control}
          name="deadline"
          render={({ field }) => (
            <DateInput id="goal-deadline" label={t("Deadline (optional)")} value={field.value ?? ""} onChange={field.onChange} clearable error={errors.deadline?.message} />
          )}
        />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className={pickerLegend}>{t("Icon")}</legend>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {CATEGORY_ICON_KEYS.map((key) => (
            <label key={key} className="relative" title={key}>
              <input type="radio" value={key} className="peer sr-only" aria-label={key} {...register("icon")} />
              <span
                className={`flex size-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted hover:bg-background peer-checked:border-primary-strong peer-checked:bg-primary-soft peer-checked:text-primary-soft-foreground ${focusRing}`}
              >
                <CategoryIcon icon={key} />
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
        <CategoryBadge icon={icon} color={color} size="lg" />
        <span className="font-semibold text-text">{name || t("Goal name")}</span>
      </div>

      <div className="flex flex-col gap-1">
        {inHousehold || goal?.shared ? (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
              {...register("shared")}
            />
            {t("Share with my household")}
          </label>
        ) : null}
        <p className="text-xs text-muted">
          {inHousehold || goal?.shared
            ? t("Everyone in your household sees this goal and can add money to it from their own accounts. Only you can edit it.")
            : t("Join a household under Profile → Household to share goals.")}
        </p>
        {errors.shared?.message ? (
          <p role="alert" className="text-xs font-semibold text-expense-text">
            {errors.shared.message}
          </p>
        ) : null}
      </div>

      <Textarea id="goal-note" label={t("Note")} error={errors.note?.message} {...register("note")} />

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : goal ? t("Save changes") : t("Add goal")}
      </FormActions>
    </form>
  );
}
