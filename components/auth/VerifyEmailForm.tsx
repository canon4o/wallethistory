"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyEmail } from "@/lib/actions/auth";
import { Alert } from "@/components/ui/Alert";
import { ResendVerificationForm } from "./ResendVerificationForm";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

// Opening the link only shows this form; the token is used when the person presses the button,
// so mail scanners and link prefetchers that merely load the page cannot consume it.
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result = await verifyEmail(token);
    if (result.ok) {
      router.push("/login?verified=1");
      return;
    }
    setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <>
          <Alert tone="error">{error}</Alert>
          <ResendVerificationForm />
        </>
      ) : null}
      <p className="text-sm text-muted">{t("Press the button to confirm your email address.")}</p>
      <Button onClick={onConfirm} disabled={pending}>
        {t("Confirm email")}
      </Button>
    </div>
  );
}
