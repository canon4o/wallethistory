"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { deleteCurrentUser } from "@/lib/actions/users";
import { deleteAccountSchema, type DeleteAccountInput } from "@/lib/validation/users";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useT, useZodResolver } from "@/lib/i18n/client";

function DeleteAccountForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountInput>({ resolver: useZodResolver(deleteAccountSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // On success the action signs you out and redirects to /login.
    const result = await deleteCurrentUser(values);
    if (!result || result.ok) return;
    applyFieldErrors(result, setError);
    setFormError(result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {t("This permanently deletes your account and all of your accounts, categories, tags, transactions, and budgets. This cannot be undone.")}
      </p>
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Input
        id="delete-password"
        label={t("Enter your password to confirm")}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          {t("Cancel")}
        </Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>
          {isSubmitting ? t("Deleting…") : t("Delete my account")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccountSection() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t("Delete account")}
      </Button>
      <Modal open={open} title={t("Delete account")} onClose={() => setOpen(false)}>
        <DeleteAccountForm onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
