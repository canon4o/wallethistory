"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { forgotPassword } from "@/lib/actions/auth";
import { emailOnlySchema, type EmailOnlyInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { applyFieldErrors } from "./form-errors";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function ForgotPasswordForm() {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailOnlyInput>({ resolver: useZodResolver(emailOnlySchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await forgotPassword(values);
    if (result.ok) {
      setMessage(result.message);
      return;
    }
    applyFieldErrors(result, setError);
    setFormError(result.error);
  });

  if (message) return <Alert tone="success">{message}</Alert>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Input
        id="email"
        label={t("Email")}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("Sending…") : t("Send reset link")}
      </Button>
    </form>
  );
}
