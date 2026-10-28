"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from "@/lib/category-colors";
import { CATEGORY_ICON_KEYS, DEFAULT_CATEGORY_ICON } from "@/lib/category-icons";
import {
  createCategorySchema,
  type CreateCategoryInput,
} from "@/lib/validation/categories";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { FormActions } from "@/components/ui/FormActions";
import { Input } from "@/components/ui/Input";
import { CategoryBadge, CategoryIcon } from "./CategoryIcon";
import { useT, useZodResolver } from "@/lib/i18n/client";

type CategoryFormProps = {
  /** Present when editing; the type is then locked. */
  category?: { id: string; type: "income" | "expense"; name: string; color: string; icon: string };
  /** Preselected type when creating. */
  defaultType?: "income" | "expense";
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

const pickerLegend = "text-sm font-semibold";
const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong";

export function CategoryForm({ category, defaultType = "expense", onDone, onDelete }: CategoryFormProps) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateCategoryInput>({
    resolver: useZodResolver(createCategorySchema),
    // Stored color/icon are strings; anything outside the palette/list fails validation on save.
    defaultValues: (category as CreateCategoryInput | undefined) ?? {
      type: defaultType,
      name: "",
      color: DEFAULT_CATEGORY_COLOR,
      icon: DEFAULT_CATEGORY_ICON,
    },
  });
  const [color, icon, name] = useWatch({ control, name: ["color", "icon", "name"] });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = category
      ? await updateCategory(category.id, {
          name: values.name,
          color: values.color,
          icon: values.icon,
        })
      : await createCategory(values);
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
        <legend className={pickerLegend}>{t("Type")}</legend>
        {category ? (
          <div className="flex items-center gap-2">
            <Badge tone={category.type}>{category.type === "income" ? t("Income") : t("Expense")}</Badge>
            <span className="text-xs text-muted">{t("The type cannot be changed after creation.")}</span>
            <input type="hidden" {...register("type")} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((type) => (
              <label key={type} className="relative">
                <input type="radio" value={type} className="peer sr-only" {...register("type")} />
                <span
                  className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-sm font-semibold capitalize peer-checked:border-transparent peer-checked:text-on-accent ${
                    type === "income" ? "peer-checked:bg-income" : "peer-checked:bg-expense"
                  } ${focusRing}`}
                >
                  {type === "income" ? t("Income") : t("Expense")}
                </span>
              </label>
            ))}
          </div>
        )}
        {errors.type?.message ? (
          <p role="alert" className="text-xs font-semibold text-expense-text">
            {errors.type.message}
          </p>
        ) : null}
      </fieldset>

      <Input
        id="category-name"
        label={t("Name")}
        error={errors.name?.message}
        {...register("name")}
      />

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
        <span className="font-semibold text-text">{name || t("Category name")}</span>
      </div>

      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : category ? t("Save changes") : t("Add category")}
      </FormActions>
    </form>
  );
}
