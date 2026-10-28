"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, Pause, Pencil, Play, Plus, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { deleteRecurringRule, setRecurringRuleStatus } from "@/lib/actions/recurring";
import type { RecurringRuleItem } from "@/lib/data/recurring";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { describeRule, describeSchedule, describeStatus } from "@/lib/recurring/labels";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EntryCard } from "@/components/ui/EntryCard";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { RecurringRuleForm, type RecurringFormOptions } from "./RecurringRuleForm";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; rule: RecurringRuleItem }
  | { kind: "delete"; rule: RecurringRuleItem }
  | null;

const KIND_TONE = { income: "income", expense: "expense", transfer: "accounts", goal: "neutral" } as const;
const KIND_LABEL = { income: msg("Income"), expense: msg("Expense"), transfer: msg("Transfer"), goal: msg("Goal") } as const;

const KIND_ICON = {
  income: { Icon: TrendingUp, className: "bg-income text-on-accent" },
  expense: { Icon: TrendingDown, className: "bg-expense text-on-accent" },
  transfer: { Icon: ArrowLeftRight, className: "bg-accounts text-white" },
  goal: { Icon: Target, className: "bg-goals text-on-accent" },
} as const;

/** Stands in for a category badge: recurring rules show their kind instead. */
export function KindIcon({ kind }: { kind: RecurringRuleItem["kind"] }) {
  const t = useT();
  const { Icon, className } = KIND_ICON[kind];
  return (
    <span title={t(KIND_LABEL[kind])} className={`inline-flex size-8 items-center justify-center rounded-lg ${className}`}>
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{t(KIND_LABEL[kind])}</span>
    </span>
  );
}

export function RecurringManager({ rules, ...options }: RecurringFormOptions & { rules: RecurringRuleItem[] }) {
  const t = useT();
  const { currency } = useRegion();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setActionError(null);
  }

  async function toggle(rule: RecurringRuleItem) {
    setActionError(null);
    const result = await setRecurringRuleStatus(rule.id, rule.status === "active" ? "paused" : "active");
    if (!result.ok) setActionError(result.error);
  }

  async function confirmDelete(rule: RecurringRuleItem) {
    setPending(true);
    setActionError(null);
    const result = await deleteRecurringRule(rule.id);
    setPending(false);
    if (result.ok) close();
    else setActionError(result.error);
  }

  const hasAccounts = options.accounts.length > 0;
  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add recurring")}
    </Button>
  );
  const describe = (rule: RecurringRuleItem) =>
    t("{kind} of {amount}, {schedule}", {
      kind: t(KIND_LABEL[rule.kind]).toLowerCase(),
      amount: formatMoney(Number(rule.amount), currency),
      schedule: describeSchedule(rule.frequency, rule.intervalCount, t).toLowerCase(),
    });

  // Pause/resume stays on the phone rows; edit and delete are on the row itself and in the edit dialog there.
  const pauseButton = (rule: RecurringRuleItem) =>
    rule.status === "ended" ? null : (
        <IconButton label={t(rule.status === "active" ? "Pause {name}" : "Resume {name}", { name: describe(rule) })} onClick={() => toggle(rule)}>
          {rule.status === "active" ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
        </IconButton>
    );
  const actions = (rule: RecurringRuleItem) => (
    <>
      {pauseButton(rule)}
      <IconButton label={t("Edit {name}", { name: describe(rule) })} onClick={() => setDialog({ kind: "edit", rule })}>
        <Pencil className="size-4" aria-hidden="true" />
      </IconButton>
      <IconButton label={t("Delete {name}", { name: describe(rule) })} onClick={() => setDialog({ kind: "delete", rule })}>
        <Trash2 className="size-4" aria-hidden="true" />
      </IconButton>
    </>
  );
  // "Next Nov 1, 2026" while running; otherwise why it is not running.
  const when = (rule: RecurringRuleItem) =>
    rule.status === "active"
      ? t("Next {date}", { date: formatDate(rule.nextDueDate, t) })
      : describeStatus(rule.status, rule.pausedReason, t);
  const ends = (rule: RecurringRuleItem) => (rule.endDate ? ` · ${t("ends {date}", { date: formatDate(rule.endDate, t) })}` : "");

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {rules.length === 0
              ? hasAccounts
                ? t("Nothing repeats yet. Add rent, salary or savings once and the entries are created for you.")
                : t("Create an account first to set up recurring transactions.")
              : t("Entries are created automatically when they are due.")}
          </p>
          {hasAccounts ? (
            addButton
          ) : (
            <Link href="/profile/accounts" className="text-sm font-semibold text-primary-strong underline">
              {t("Create an account")}
            </Link>
          )}
        </div>
        {actionError && dialog === null ? <Alert tone="error">{actionError}</Alert> : null}

        {rules.length === 0 ? null : (
          <>
            {/* Table on wide screens; compact rows on phones and tablets */}
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t("Recurring transactions")}</caption>
                <thead className="border-b border-border bg-background text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-semibold">{t("What")}</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">{t("Type")}</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">{t("Repeats")}</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">{t("When")}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t("Amount")}</th>
                    <th scope="col" className="px-3 py-1.5"><span className="sr-only">{t("Actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-border last:border-b-0">
                      <td className="max-w-72 px-3 py-1">
                        <span className="block truncate font-semibold">{describeRule(rule, t)}</span>
                        {rule.note ? <span className="block truncate text-xs text-muted">{rule.note}</span> : null}
                      </td>
                      <td className="px-3 py-1"><Badge tone={KIND_TONE[rule.kind]}>{t(KIND_LABEL[rule.kind])}</Badge></td>
                      <td className="whitespace-nowrap px-3 py-1">{describeSchedule(rule.frequency, rule.intervalCount, t)}</td>
                      <td className="px-3 py-1 text-muted">
                        {when(rule)}
                        {ends(rule)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 text-right font-bold tabular-nums">{formatMoney(Number(rule.amount), currency)}</td>
                      <td className="whitespace-nowrap px-1 py-0 text-right">{actions(rule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-1.5 lg:hidden" aria-label={t("Recurring transactions")}>
              {rules.map((rule) => (
                <EntryCard
                  key={rule.id}
                  leading={<KindIcon kind={rule.kind} />}
                  title={describeRule(rule, t)}
                  amount={<span className="font-bold tabular-nums">{formatMoney(Number(rule.amount), currency)}</span>}
                  meta={[
                    describeSchedule(rule.frequency, rule.intervalCount, t),
                    `${when(rule)}${ends(rule)}`,
                  ]}
                  note={rule.note}
                  actions={pauseButton(rule)}
                  selectLabel={t("Edit {name}", { name: describe(rule) })}
                  onSelect={() => setDialog({ kind: "edit", rule })}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal open={dialog?.kind === "create"} title={t("Add recurring transaction")} onClose={close}>
        <RecurringRuleForm {...options} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t("Edit recurring transaction")} onClose={close}>
        {dialog?.kind === "edit" ? (
          <RecurringRuleForm
            key={dialog.rule.id}
            {...options}
            rule={{
              id: dialog.rule.id,
              kind: dialog.rule.kind,
              amount: dialog.rule.amount,
              accountId: dialog.rule.accountId ?? "",
              categoryId: dialog.rule.categoryId ?? "",
              fromAccountId: dialog.rule.fromAccountId ?? "",
              toAccountId: dialog.rule.toAccountId ?? "",
              goalId: dialog.rule.goalId ?? "",
              tagIds: dialog.rule.tagIds,
              note: dialog.rule.note ?? "",
              frequency: dialog.rule.frequency,
              intervalCount: String(dialog.rule.intervalCount),
              startDate: dialog.rule.startDate,
              endDate: dialog.rule.endDate ?? "",
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", rule: dialog.rule })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("Delete recurring transaction")}
        description={
          dialog?.kind === "delete"
            ? t("Delete the {name}? Entries it already created stay in your history. This cannot be undone.", { name: describe(dialog.rule) })
            : ""
        }
        confirmLabel={t("Delete recurring")}
        pending={pending}
        error={actionError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.rule)}
        onClose={close}
      />
    </>
  );
}
