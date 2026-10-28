"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { register as registerAccount } from "@/lib/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RegionalFields } from "@/components/settings/RegionalFields";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currencies";
import { DEFAULT_TIMEZONE, normalizeTimezone } from "@/lib/timezones";
import { applyFieldErrors } from "./form-errors";
import { ResendVerification } from "./ResendVerification";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function RegisterForm({ timezones = [DEFAULT_TIMEZONE] }: { timezones?: string[] }) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: useZodResolver(registerSchema),
    defaultValues: { currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE },
  });
  const currency = (useWatch({ control, name: "currency" }) as CurrencyCode | undefined) ?? DEFAULT_CURRENCY;
  const timezone = (useWatch({ control, name: "timezone" }) as string | undefined) ?? DEFAULT_TIMEZONE;

  // Pre-select the browser's timezone; the server still validates whatever is submitted.
  useEffect(() => {
    const detected = normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    if (detected) setValue("timezone", detected);
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Without email verification the action redirects to /dashboard; a returned value means
    // either a failure or "check your email".
    const result = await registerAccount(values);
    if (!result) return;
    if (result.ok) {
      setCheckEmail(result.email);
      return;
    }
    applyFieldErrors(result, setError);
    setFormError(result.error);
  });

  if (checkEmail) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          {t("Check your email. We sent a verification link to")} <strong>{checkEmail}</strong>.
        </Alert>
        <ResendVerification email={checkEmail} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Input
        id="name"
        label={t("Name")}
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />
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
        autoComplete="new-password"
        hint={t("8 to 72 characters")}
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        id="confirmPassword"
        label={t("Confirm password")}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <RegionalFields
        idPrefix="register"
        currency={currency}
        timezone={timezone}
        timezones={timezones}
        onCurrencyChange={(value) => setValue("currency", value)}
        onTimezoneChange={(value) => setValue("timezone", value)}
        errors={{ currency: errors.currency?.message, timezone: errors.timezone?.message }}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("Creating account…") : t("Create account")}
      </Button>
    </form>
  );
}
