"use client";

import { useState } from "react";
import { updateRegionalSettings } from "@/lib/actions/users";
import type { CurrencyCode } from "@/lib/currencies";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { RegionalFields } from "./RegionalFields";
import { useT } from "@/lib/i18n/client";

type Props = { currency: CurrencyCode; timezone: string; timezones: string[] };

export function RegionalForm({ currency: savedCurrency, timezone: savedTimezone, timezones }: Props) {
  const t = useT();
  const [currency, setCurrency] = useState(savedCurrency);
  const [timezone, setTimezone] = useState(savedTimezone);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<{ currency?: string; timezone?: string }>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    setPending(true);
    try {
      const result = await updateRegionalSettings({ currency, timezone });
      if (result.ok) {
        setMessage({ tone: "success", text: t("Settings saved.") });
        return;
      }
      setErrors({ currency: result.fieldErrors?.currency?.[0], timezone: result.fieldErrors?.timezone?.[0] });
      setMessage({ tone: "error", text: result.error });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <RegionalFields
        idPrefix="settings"
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
  );
}
