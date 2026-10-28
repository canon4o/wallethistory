"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { resetPassword } from "@/lib/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { applyFieldErrors } from "./form-errors";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: useZodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // On success the action redirects to /login, so a returned value is always a failure.
    const result = await resetPassword(values);
    if (!result || result.ok) return;
    applyFieldErrors(result, setError);
    setFormError(result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <input type="hidden" {...register("token")} />
      <Input
        id="password"
        label={t("New password")}
        type="password"
        autoComplete="new-password"
        hint={t("8 to 72 characters")}
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        id="confirmPassword"
        label={t("Confirm new password")}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("Saving…") : t("Set new password")}
      </Button>
    </form>
  );
}
