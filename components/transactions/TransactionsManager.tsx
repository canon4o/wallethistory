"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { deleteTransaction } from "@/lib/actions/transactions";
import { deleteTransfer } from "@/lib/actions/transfers";
import type { TransactionItem } from "@/lib/data/transactions";
import { accountLabel } from "@/lib/account-label";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Amount, LABEL_KEYS } from "./Amount";
import { TransactionDayList } from "./TransactionDayList";
import { TransactionForm, type TransactionFormOptions } from "./TransactionForm";
import { TransferBadge } from "./TransferBadge";
import { TransferForm } from "./TransferForm";
import { useT } from "@/lib/i18n/client";

type Dialog =
  | { kind: "create" }
  | { kind: "create-transfer" }
  | { kind: "edit"; item: TransactionItem }
  | { kind: "delete"; item: TransactionItem }
  | null;

type TransactionsManagerProps = TransactionFormOptions & {
  items: TransactionItem[];
  /** Own accounts plus household members' accounts: where a transfer can send money. */
  transferTargets?: TransactionFormOptions["accounts"];
  /** True when filters are applied, to tell "nothing yet" from "nothing matches". */
  filtered: boolean;
};

/** Marks entries that a recurring rule created. */
function RecurringMark({ item }: { item: TransactionItem }) {
  const t = useT();
  if (!item.recurring) return null;
  return (
    <span title={t("Recurring")} className="shrink-0 text-muted">
      <Repeat className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{t("Recurring")}</span>
    </span>
  );
}

function CategoryCell({ item }: { item: TransactionItem }) {
  const t = useT();
  if (item.type === "transfer") {
    return (
      <span className="flex items-center gap-2">
        <TransferBadge />
        <span className="truncate text-sm font-semibold">{t("Transfer")}</span>
        <RecurringMark item={item} />
      </span>
    );
  }
  if (!item.category) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-sm text-muted">{t("Uncategorized")}</span>
        <RecurringMark item={item} />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <CategoryBadge icon={item.category.icon} color={item.category.color} />
      <span className="truncate text-sm font-semibold">{item.category.name}</span>
      <RecurringMark item={item} />
    </span>
  );
}

function TagList({ item }: { item: TransactionItem }) {
  const t = useT();
  if (item.tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={t("Tags")}>
      {item.tags.map((tag) => (
        <li key={tag.id} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs">
          {tag.name}
        </li>
      ))}
    </ul>
  );
}

export function TransactionsManager({
  items,
  accounts,
  transferTargets = accounts,
  categories,
  tags,
  defaultAccountId,
  filtered,
}: TransactionsManagerProps) {
  const t = useT();
  const { currency } = useRegion();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setDeleteError(null);
  }

  async function confirmDelete(item: TransactionItem) {
    setPending(true);
    setDeleteError(null);
    const result = item.type === "transfer" ? await deleteTransfer(item.id) : await deleteTransaction(item.id);
    setPending(false);
    if (result.ok) close();
    else setDeleteError(result.error);
  }

  const hasAccounts = accounts.length > 0;
  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })} disabled={!hasAccounts}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add transaction")}
    </Button>
  );
  // Money leaves one of my accounts and needs somewhere else to go.
  const canTransfer = hasAccounts && transferTargets.length >= 2;
  const transferButton = (
    <Button variant="secondary" onClick={() => setDialog({ kind: "create-transfer" })} disabled={!canTransfer}>
      <ArrowLeftRight className="size-4" aria-hidden="true" />
      {t("Add transfer")}
    </Button>
  );
  const describe = (item: TransactionItem) =>
    t(LABEL_KEYS[item.type], {
      amount: formatMoney(Number(item.amount), currency),
      date: formatDate(item.date, t),
    });
  // Household members' transactions are read-only.
  const actions = (item: TransactionItem) =>
    !item.owner.isMine ? null : (
    <>
      <IconButton label={t("Edit {name}", { name: describe(item) })} onClick={() => setDialog({ kind: "edit", item })}>
        <Pencil className="size-4" aria-hidden="true" />
      </IconButton>
      <IconButton label={t("Delete {name}", { name: describe(item) })} onClick={() => setDialog({ kind: "delete", item })}>
        <Trash2 className="size-4" aria-hidden="true" />
      </IconButton>
    </>
    );

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasAccounts ? null : (
            <p className="text-sm text-muted">
              {t("Create an account first under")}{" "}
              <Link href="/profile/accounts" className="font-semibold text-primary-strong underline">
                {t("Profile → Accounts")}
              </Link>
              .
            </p>
          )}
          {hasAccounts && !canTransfer ? (
            <p className="text-sm text-muted">{t("Add a second account to move money between accounts.")}</p>
          ) : null}
          {transferButton}
          {addButton}
        </div>

        {items.length === 0 ? (
          filtered ? (
            <EmptyState
              title={t("No transactions match your filters")}
              description={t("Try a different date range or clear the filters.")}
              action={
                <Link
                  href="/transactions"
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong"
                >
                  {t("Clear filters")}
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={t("No transactions yet")}
              description={t("Record your income and expenses to see where your money goes.")}
              action={hasAccounts ? addButton : undefined}
            />
          )
        ) : (
          <>
            {/* Table on wide screens; cards on phones and tablets, where the sidebar leaves little room */}
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t("Transactions, newest first")}</caption>
                <thead className="border-b border-border bg-background text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">{t("Date")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t("Category")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t("Account")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t("Note")}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{t("Amount")}</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">{t("Actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(item.date, t)}</td>
                      <td className="max-w-48 px-3 py-2"><CategoryCell item={item} /></td>
                      <td className="px-3 py-2">{accountLabel(item)}</td>
                      <td className="max-w-72 px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {item.note ? <span className="truncate">{item.note}</span> : null}
                          <TagList item={item} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right"><Amount type={item.type} amount={item.amount} currency={currency} /></td>
                      <td className="whitespace-nowrap px-1 py-1 text-right">{actions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones and tablets: grouped by day, tap a row to edit */}
            <TransactionDayList items={items} onSelect={(item) => setDialog({ kind: "edit", item })} />
          </>
        )}
      </div>

      <Modal open={dialog?.kind === "create"} title={t("Add transaction")} onClose={close}>
        <TransactionForm accounts={accounts} categories={categories} tags={tags} defaultAccountId={defaultAccountId} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "create-transfer"} title={t("Add transfer")} onClose={close}>
        <TransferForm accounts={accounts} toAccounts={transferTargets} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={dialog?.kind === "edit" && dialog.item.type === "transfer" ? t("Edit transfer") : t("Edit transaction")} onClose={close}>
        {dialog?.kind === "edit" && dialog.item.type === "transfer" && dialog.item.transferTo ? (
          <TransferForm
            key={dialog.item.id}
            accounts={accounts}
            toAccounts={transferTargets}
            transfer={{
              id: dialog.item.id,
              fromAccountId: dialog.item.account.id,
              toAccountId: dialog.item.transferTo.id,
              amount: dialog.item.amount,
              date: dialog.item.date,
              note: dialog.item.note ?? "",
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", item: dialog.item })}
          />
        ) : dialog?.kind === "edit" && dialog.item.type !== "transfer" ? (
          <TransactionForm
            key={dialog.item.id}
            accounts={accounts}
            categories={categories}
            tags={tags}
            transaction={{
              id: dialog.item.id,
              type: dialog.item.type,
              amount: dialog.item.amount,
              date: dialog.item.date,
              accountId: dialog.item.account.id,
              categoryId: dialog.item.category?.id ?? "",
              tagIds: dialog.item.tags.map((tag) => tag.id),
              note: dialog.item.note ?? "",
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", item: dialog.item })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={dialog?.kind === "delete" && dialog.item.type === "transfer" ? t("Delete transfer") : t("Delete transaction")}
        description={
          dialog?.kind === "delete"
            ? t(dialog.item.type === "transfer" ? "Delete the {name}? This cannot be undone." : "Delete the {name} transaction? This cannot be undone.", {
                name: describe(dialog.item),
              })
            : ""
        }
        confirmLabel={dialog?.kind === "delete" && dialog.item.type === "transfer" ? t("Delete transfer") : t("Delete transaction")}
        pending={pending}
        error={deleteError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.item)}
        onClose={close}
      />
    </>
  );
}
