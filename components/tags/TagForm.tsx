"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { createTag, updateTag } from "@/lib/actions/tags";
import { tagSchema, type TagInput } from "@/lib/validation/tags";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { FormActions } from "@/components/ui/FormActions";
import { Input } from "@/components/ui/Input";
import { useT, useZodResolver } from "@/lib/i18n/client";

type TagFormProps = {
  tag?: { id: string; name: string };
  onDone: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
};

export function TagForm({ tag, onDone, onDelete }: TagFormProps) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TagInput>({
    resolver: useZodResolver(tagSchema),
    defaultValues: { name: tag?.name ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = tag ? await updateTag(tag.id, values) : await createTag(values);
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
      <Input id="tag-name" label={t("Name")} error={errors.name?.message} {...register("name")} />
      <FormActions onCancel={onDone} onDelete={onDelete} disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : tag ? t("Save changes") : t("Add tag")}
      </FormActions>
    </form>
  );
}
