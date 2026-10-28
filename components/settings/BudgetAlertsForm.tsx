"use client";

import { useState } from "react";
import { updateBudgetAlertSettings } from "@/lib/actions/budget-alerts";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/client";

type Props = { enabled: boolean; threshold: number };

// 50, 55, ... 95. A stored value outside the steps (the action accepts 50..99) is still offered.
const STEPS = Array.from({ length: 10 }, (_, index) => 50 + index * 5);

export function BudgetAlertsForm({ enabled: savedEnabled, threshold: savedThreshold }: Props) {
  const t = useT();
  const [enabled, setEnabled] = useState(savedEnabled);
  const [threshold, setThreshold] = useState(savedThreshold);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  const options = STEPS.includes(threshold) ? STEPS : [...STEPS, threshold].sort((a, b) => a - b);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(undefined);
    setPending(true);
    try {
      const result = await updateBudgetAlertSettings({ enabled, threshold });
      if (result.ok) {
        setMessage({ tone: "success", text: t("Settings saved.") });
        return;
      }
      setError(result.fieldErrors?.threshold?.[0]);
      setMessage({ tone: "error", text: result.error });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={pending}
          className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
        />
        {t("Show budget alerts")}
      </label>
      <Select
        id="budget-alert-threshold"
        label={t("Warn me at")}
        value={threshold}
        onChange={(event) => setThreshold(Number(event.target.value))}
        error={error}
        hint={t("Share of a budget's limit that triggers a warning. Going over the limit always shows an alert.")}
        disabled={pending || !enabled}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value}%
          </option>
        ))}
      </Select>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("Saving…") : t("Save")}
        </Button>
      </div>
    </form>
  );
}
