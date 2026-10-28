"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { updateProfile } from "@/lib/actions/users";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validation/users";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useT, useZodResolver } from "@/lib/i18n/client";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useT();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: useZodResolver(updateProfileSchema),
    defaultValues: { name },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    const result = await updateProfile(values);
    if (result.ok) {
      setMessage({ tone: "success", text: t("Profile saved.") });
      return;
    }
    applyFieldErrors(result, setError);
    setMessage({ tone: "error", text: result.error });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Input id="profile-name" label={t("Name")} autoComplete="name" error={errors.name?.message} {...register("name")} />
      <Input
        id="profile-email"
        label={t("Email")}
        type="email"
        value={email}
        readOnly
        hint={t("Your email cannot be changed.")}
      />
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : t("Save profile")}
        </Button>
      </div>
    </form>
  );
}
