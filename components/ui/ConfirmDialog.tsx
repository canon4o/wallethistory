"use client";

import type { ReactNode } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useT } from "@/lib/i18n/client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/** Destructive confirmation: explains what will happen and shows the failure reason, if any. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted">{description}</div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>
            {t("Cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? t("Working…") : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
