"use client";

import { useState, useTransition } from "react";
import { setSignupEnabled } from "@/lib/actions/admin";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

export function SignupToggle({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-label={t("Signups")} className="mb-4 rounded-lg border border-border bg-surface p-3">
      <h2 className="text-sm font-bold">{t("New signups")}</h2>
      <p className="mt-1 text-sm text-muted">
        {enabled
          ? t("Anyone can create an account.")
          : t("New signups are closed. The register page says so and no account can be created. Existing users are not affected.")}
      </p>
      {error ? (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm font-semibold">{enabled ? t("On") : t("Off")}</span>
        <Button
          variant={enabled ? "secondary" : "primary"}
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await setSignupEnabled({ enabled: !enabled });
              if (!result.ok) setError(result.error);
            });
          }}
        >
          {enabled ? t("Turn signups off") : t("Turn signups on")}
        </Button>
      </div>
    </section>
  );
}
