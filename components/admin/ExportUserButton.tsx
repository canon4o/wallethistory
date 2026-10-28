"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useT } from "@/lib/i18n/client";

/**
 * Button and dialog that start a download of one user's data. A plain form POST (not a Server Action) so the browser
 * saves the file; the reason is required and goes into the audit log.
 */
export function ExportUserButton({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Download className="size-4" aria-hidden="true" />
        {t("Export data")}
      </Button>
      <Modal open={open} title={t("Export this user's data?")} onClose={() => setOpen(false)}>
        <form
          method="post"
          action={`/admin/users/${userId}/export`}
          // The browser handles the download; the dialog just closes after the form is sent.
          onSubmit={() => setTimeout(() => setOpen(false), 0)}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted">
            {t("Export file for")} <strong className="text-text">{name}</strong>:{" "}
            {t("accounts, categories, tags, transactions, transfers and budgets. It contains personal financial data: send it only to the user, and do not keep a copy. It is not stored on the server.")}
          </p>
          <Textarea
            id="export-reason"
            name="reason"
            label={t("Why is this export needed?")}
            hint={t("Saved in the audit log, for example: user asked by email on 10 Oct.")}
            required
            minLength={3}
            maxLength={300}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit">{t("Download export")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
