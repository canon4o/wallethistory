"use client";

import { useState } from "react";
import { resendVerification } from "@/lib/actions/auth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

export function ResendVerification({ email }: { email: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    const result = await resendVerification({ email });
    setMessage(result.ok ? result.message : result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={onClick} disabled={pending}>
        {t("Resend verification email")}
      </Button>
      {message ? <Alert tone="info">{message}</Alert> : null}
    </div>
  );
}
