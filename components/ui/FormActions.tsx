"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { useT } from "@/lib/i18n/client";

/**
 * Buttons at the bottom of a dialog form. On phones: Cancel (and Delete when editing) share the first row and the
 * submit button fills the second; on wide screens they sit together on the right and Delete is hidden (rows have
 * their own delete button there).
 */
export function FormActions({
  onCancel,
  onDelete,
  disabled,
  children,
}: {
  onCancel: () => void;
  /** Edit mode on small screens: opens the delete confirmation. */
  onDelete?: () => void;
  disabled?: boolean;
  /** Label of the submit button. */
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
      <Button
        variant="secondary"
        onClick={onCancel}
        disabled={disabled}
        className={onDelete ? undefined : "col-span-2 lg:col-span-1"}
      >
        {t("Cancel")}
      </Button>
      {onDelete ? (
        <Button variant="secondary" onClick={onDelete} disabled={disabled} className="border-expense text-expense lg:hidden">
          {t("Delete")}
        </Button>
      ) : null}
      <Button type="submit" disabled={disabled} className="col-span-2 lg:col-span-1">
        {children}
      </Button>
    </div>
  );
}
