"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteAccount } from "@/lib/actions/accounts";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import type { AccountWithBalance } from "@/lib/data/accounts";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { RowTapTarget } from "@/components/ui/RowTapTarget";
import { AccountForm } from "./AccountForm";
import { AccountBadge } from "./AccountIcon";
import { useT } from "@/lib/i18n/client";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; account: AccountWithBalance }
  | { kind: "delete"; account: AccountWithBalance }
  | null;

export function AccountsManager({ accounts }: { accounts: AccountWithBalance[] }) {
  const t = useT();
  const { currency } = useRegion();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setDeleteError(null);
  }

  async function confirmDelete(account: AccountWithBalance) {
    setPending(true);
    setDeleteError(null);
    const result = await deleteAccount(account.id);
    setPending(false);
    if (result.ok) close();
    else setDeleteError(result.error);
  }

  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add account")}
    </Button>
  );

  return (
    <>
      {accounts.length === 0 ? (
        <EmptyState
          title={t("No accounts yet")}
          description={t("Accounts hold your money: cash, a bank account, a card. Add one to start recording transactions.")}
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">{addButton}</div>
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="relative flex items-center gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <AccountBadge icon={account.icon} color={account.color} />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <p className="max-w-full truncate text-sm font-bold">{account.name}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone="accounts">{t(ACCOUNT_TYPE_LABELS[account.type])}</Badge>
                    {account.isDefault ? <Badge>{t("Default")}</Badge> : null}
                  </div>
                </div>
                <p
                  className={`text-sm font-bold tabular-nums ${Number(account.balance) < 0 ? "text-expense-text" : ""}`}
                >
                  {formatMoney(Number(account.balance), currency)}
                </p>
                <IconButton
                  label={t("Edit {name}", { name: account.name })}
                  className="max-lg:hidden"
                  onClick={() => setDialog({ kind: "edit", account })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t("Delete {name}", { name: account.name })}
                  className="max-lg:hidden"
                  onClick={() => setDialog({ kind: "delete", account })}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </IconButton>
                <RowTapTarget label={t("Edit {name}", { name: account.name })} onClick={() => setDialog({ kind: "edit", account })} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={dialog?.kind === "create"} title={t("Add account")} onClose={close}>
        <AccountForm onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t("Edit account")} onClose={close}>
        {dialog?.kind === "edit" ? (
          <AccountForm
            key={dialog.account.id}
            account={{
              id: dialog.account.id,
              name: dialog.account.name,
              type: dialog.account.type,
              color: dialog.account.color,
              icon: dialog.account.icon,
              initialBalance: dialog.account.initialBalance,
              isDefault: dialog.account.isDefault,
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", account: dialog.account })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("Delete account")}
        description={
          dialog?.kind === "delete"
            ? t("Delete \"{name}\"? An account that has transactions cannot be deleted.", { name: dialog.account.name })
            : ""
        }
        confirmLabel={t("Delete account")}
        pending={pending}
        error={deleteError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.account)}
        onClose={close}
      />
    </>
  );
}
