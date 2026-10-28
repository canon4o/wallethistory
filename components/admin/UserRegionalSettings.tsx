"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserRegionalSettings } from "@/lib/actions/admin";
import type { CurrencyCode } from "@/lib/currencies";
import { RegionalFields } from "@/components/settings/RegionalFields";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

type Props = { userId: string; currency: CurrencyCode; timezone: string; timezones: string[] };

/** Lets an admin change how one user's amounts and dates are shown. The change is written to the audit log. */
export function UserRegionalSettings({ userId, currency: savedCurrency, timezone: savedTimezone, timezones }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState(savedCurrency);
  const [timezone, setTimezone] = useState(savedTimezone);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<{ currency?: string; timezone?: string }>({});

  function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    startTransition(async () => {
      const result = await updateUserRegionalSettings({ userId, currency, timezone });
      if (result.ok) {
        setMessage({ tone: "success", text: t("Saved.") });
        router.refresh();
        return;
      }
      setErrors({ currency: result.fieldErrors?.currency?.[0], timezone: result.fieldErrors?.timezone?.[0] });
      setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <section aria-label={t("Regional settings")} className="mb-4 rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-3 text-sm font-bold">{t("Regional settings")}</h2>
      <form onSubmit={save} noValidate className="flex max-w-md flex-col gap-3">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        <RegionalFields
          idPrefix="admin-user"
          currency={currency}
          timezone={timezone}
          timezones={timezones}
          onCurrencyChange={setCurrency}
          onTimezoneChange={setTimezone}
          errors={errors}
          disabled={pending}
        />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t("Saving…") : t("Save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
