"use client";

import { useState, useTransition } from "react";
import { clearAnnouncement, publishAnnouncement } from "@/lib/actions/admin";
import { ANNOUNCEMENT_MAX } from "@/lib/validation/admin";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useT } from "@/lib/i18n/client";

type Props = { current: { message: string; level: "info" | "warning" } | null };

export function AnnouncementForm({ current }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(current?.message ?? "");
  const [level, setLevel] = useState<"info" | "warning">(current?.level ?? "info");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted">
        {current
          ? t("This banner is showing to every signed-in user. Publishing a new one replaces it.")
          : t("No banner is showing. Write a short message to show one to every signed-in user.")}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setFieldError(undefined);
          setSaved(null);
          startTransition(async () => {
            const result = await publishAnnouncement({ message, level });
            if (!result.ok) {
              setFieldError(result.fieldErrors?.message?.[0]);
              setError(result.error);
              return;
            }
            setSaved(t("Banner published."));
          });
        }}
      >
        <Textarea
          id="announcement-message"
          label={t("Message")}
          hint={t("Plain text, {count} of {max} characters.", { count: message.trim().length, max: ANNOUNCEMENT_MAX })}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          error={fieldError}
          rows={3}
        />
        <div className="w-44">
          <Select
            id="announcement-level"
            label={t("Style")}
            value={level}
            onChange={(event) => setLevel(event.target.value as "info" | "warning")}
          >
            <option value="info">{t("Information")}</option>
            <option value="warning">{t("Warning")}</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {t("Publish banner")}
          </Button>
          {current ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setSaved(null);
                startTransition(async () => {
                  const result = await clearAnnouncement();
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("");
                  setSaved(t("Banner removed."));
                });
              }}
            >
              {t("Remove banner")}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
