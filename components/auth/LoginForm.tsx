"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { login } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { applyFieldErrors } from "./form-errors";
import { ResendVerification } from "./ResendVerification";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function LoginForm() {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: useZodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setUnverifiedEmail(null);
    // On success the action redirects to /dashboard, so a returned value is always a failure.
    const result = await login(values);
    if (!result || result.ok) return;
    applyFieldErrors(result, setError);
    setFormError(result.error);
    if (result.code === "email_not_verified") setUnverifiedEmail(values.email);
  });

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
      <Input
        id="password"
        label={t("Password")}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("Logging in…") : t("Log in")}
      </Button>
      {unverifiedEmail ? <ResendVerification email={unverifiedEmail} /> : null}
    </form>
  );
}
