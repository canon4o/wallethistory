"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { inviteToHousehold } from "@/lib/actions/household";
import { inviteSchema, type InviteInput } from "@/lib/validation/household";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function InviteForm() {
  const t = useT();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({ resolver: useZodResolver(inviteSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    const result = await inviteToHousehold(values);
    if (result.ok) {
      reset();
      // Same text whether or not the email belongs to an account.
      setMessage({
        tone: "success",
        text: t("Invitation sent. If that email belongs to a WalletHistory account, the person can accept it from their profile."),
      });
      return;
    }
    applyFieldErrors(result, setError);
    setMessage({ tone: "error", text: result.error });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Input
        id="invite-email"
        label={t("Invite by email")}
        type="email"
        autoComplete="off"
        hint={t("They must already have a WalletHistory account.")}
        error={errors.email?.message}
        {...register("email")}
      />
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Sending…") : t("Send invitation")}
        </Button>
      </div>
    </form>
  );
}
