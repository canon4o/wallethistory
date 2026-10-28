"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { changePassword } from "@/lib/actions/users";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/users";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function ChangePasswordForm() {
  const t = useT();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: useZodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    const result = await changePassword(values);
    if (result.ok) {
      reset();
      setMessage({
        tone: "success",
        text: t("Password changed. Your other devices have been signed out."),
      });
      return;
    }
    applyFieldErrors(result, setError);
    setMessage({ tone: "error", text: result.error });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Input
        id="current-password"
        label={t("Current password")}
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />
      <Input
        id="new-password"
        label={t("New password")}
        type="password"
        autoComplete="new-password"
        hint={t("8 to 72 characters")}
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <Input
        id="confirm-new-password"
        label={t("Confirm new password")}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : t("Change password")}
        </Button>
      </div>
    </form>
  );
}
