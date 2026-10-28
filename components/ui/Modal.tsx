"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** Native <dialog>: focus trap, Escape to close and backdrop come from the browser. */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Closing because `open` turned false also fires the dialog's close event; that must not call onClose, or a manager
  // that swaps one dialog for another (edit → delete confirmation) would have its new state wiped.
  const closedByProp = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // No field is focused on open. Only the element marked data-autofocus (the safe choice in a
      // confirmation) gets focus; otherwise the dialog itself does, so the keyboard stays inside it.
      (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog).focus();
    }
    if (!open && dialog.open) {
      closedByProp.current = true;
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      tabIndex={-1}
      onClose={() => {
        if (closedByProp.current) closedByProp.current = false;
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-0 text-text outline-none backdrop:bg-scrim"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-base font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
