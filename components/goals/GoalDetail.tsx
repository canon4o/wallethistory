"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Archive, ArchiveRestore, CalendarClock, Pencil, Repeat, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { AccountSelectItem } from "@/components/accounts/AccountSelect";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { useRegion } from "@/components/layout/RegionProvider";
import { GoalHistoryChart } from "@/components/reports/charts";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EntryCard } from "@/components/ui/EntryCard";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { deleteGoalContribution } from "@/lib/actions/goal-contributions";
import { deleteGoal, setGoalArchived } from "@/lib/actions/goals";
import type { GoalContributionItem, GoalContributor, GoalItem } from "@/lib/data/goals";
import { formatDate, formatMoney } from "@/lib/format";
import { goalProgress, recentMonthlyPaceCents } from "@/lib/goals/progress";
import { toCents } from "@/lib/reports/money";
import { deadlineText } from "./GoalCard";
import { GoalContributionForm } from "./GoalContributionForm";
import { GoalForm } from "./GoalForm";
import { DayGroupList } from "@/components/ui/DayGroupList";
import { RowTapTarget } from "@/components/ui/RowTapTarget";
import { useT } from "@/lib/i18n/client";

type Dialog =
  | { kind: "deposit" }
  | { kind: "withdrawal" }
  | { kind: "edit-goal" }
  | { kind: "edit-contribution"; item: GoalContributionItem }
  | { kind: "delete-contribution"; item: GoalContributionItem }
  | { kind: "delete-goal" }
  | null;

type GoalDetailProps = {
  goal: GoalItem;
  contributors: GoalContributor[];
  contributions: GoalContributionItem[];
  history: Array<{ date: string; saved: string }>;
  /** The user's own accounts. */
  accounts: AccountSelectItem[];
  inHousehold: boolean;
  today: string;
};

export function GoalDetail({ goal, contributors, contributions, history, accounts, inHousehold, today }: GoalDetailProps) {
  const t = useT();
  const { currency } = useRegion();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const savedCents = toCents(goal.saved);
  const targetCents = toCents(goal.targetAmount);
  const progress = goalProgress({ savedCents, targetCents, deadline: goal.deadline, today });
  const mySaved = Number(goal.mySaved);
  const saved = savedCents / 100;
  const target = targetCents / 100;
  const due = deadlineText(goal.deadline, progress.overdue, t);
  const pace = recentMonthlyPaceCents(
    contributions.map((item) => ({
      date: item.date,
      deltaCents: (item.type === "deposit" ? 1 : -1) * toCents(item.amount),
    })),
    today,
  );
  // Money still in the goal blocks deleting it; the owner takes it out (everyone their own share) or archives.
  const canDelete = goal.owner.isMine && savedCents === 0;
  const canDeposit = !goal.archived && accounts.length > 0;

  function close() {
    setDialog(null);
    setActionError(null);
  }

  async function toggleArchive() {
    setActionError(null);
    const result = await setGoalArchived(goal.id, !goal.archived);
    if (!result.ok) setActionError(result.error);
  }

  async function confirmDeleteGoal() {
    setPending(true);
    setActionError(null);
    const result = await deleteGoal(goal.id);
    setPending(false);
    if (result.ok) router.push("/goals");
    else setActionError(result.error);
  }

  async function confirmDeleteContribution(item: GoalContributionItem) {
    setPending(true);
    setActionError(null);
    const result = await deleteGoalContribution(item.id);
    setPending(false);
    if (result.ok) close();
    else setActionError(result.error);
  }

  const chartData = [
    ...history.map((point) => ({ label: formatDate(point.date, t), saved: Number(point.saved) })),
    ...(history.length > 0 && history[history.length - 1].date < today
      ? [{ label: formatDate(today, t), saved: Number(history[history.length - 1].saved) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/goals"
        className="inline-flex min-h-10 items-center gap-1 self-start text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("All goals")}
      </Link>

      <section aria-labelledby="goal-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <CategoryBadge icon={goal.icon} color={goal.color} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h1 id="goal-title" className="max-w-full truncate text-xl font-bold">
              {goal.name}
            </h1>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {progress.completed ? <Badge tone="income">{t("Completed")}</Badge> : null}
              {goal.archived ? <Badge>{t("Archived")}</Badge> : null}
              {goal.shared ? <Badge tone="accounts">{t("Shared")}</Badge> : null}
              {goal.owner.isMine ? null : <span>{t("{name}'s goal", { name: goal.owner.name })}</span>}
            </p>
          </div>
          <span className="text-xl font-bold tabular-nums">{progress.percent}%</span>
        </div>

        <ProgressBar tone="goal" value={saved} max={target} label={t("{name} progress", { name: goal.name })} />

        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">{t("Saved")}</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(saved, currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("Target")}</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(target, currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">{progress.completed ? t("Over target by") : t("Remaining")}</dt>
            <dd className="text-sm font-bold tabular-nums">
              {formatMoney(progress.completed ? (savedCents - targetCents) / 100 : progress.remainingCents / 100, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t("Deadline")}</dt>
            <dd className={`text-sm font-bold ${progress.overdue ? "text-expense-text" : ""}`}>
              {due ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {due}
                </span>
              ) : (
                t("None")
              )}
            </dd>
          </div>
        </dl>

        {progress.monthlyNeededCents !== null ? (
          <p className="text-sm">
            {t("Put aside")} <strong className="tabular-nums">{formatMoney(progress.monthlyNeededCents / 100, currency)}</strong> {t("a month to reach the target by the deadline.")}{" "}
            <span className="text-muted">
              {pace > 0
                ? t("Recently the goal gets about {amount} a month.", { amount: formatMoney(pace / 100, currency) })
                : t("Nothing was added in the last 3 months.")}
            </span>
          </p>
        ) : null}
        {goal.note ? <p className="text-sm">{goal.note}</p> : null}

        {actionError && dialog === null ? <Alert tone="error">{actionError}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          {canDeposit ? (
            <Button onClick={() => setDialog({ kind: "deposit" })}>
              <TrendingUp className="size-4" aria-hidden="true" />
              {t("Add money")}
            </Button>
          ) : null}
          {mySaved > 0 ? (
            <Button variant="secondary" onClick={() => setDialog({ kind: "withdrawal" })}>
              <TrendingDown className="size-4" aria-hidden="true" />
              {t("Take money out")}
            </Button>
          ) : null}
          {goal.owner.isMine ? (
            <>
              <Button variant="secondary" onClick={() => setDialog({ kind: "edit-goal" })}>
                <Pencil className="size-4" aria-hidden="true" />
                {t("Edit")}
              </Button>
              <Button variant="secondary" onClick={toggleArchive}>
                {goal.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                {goal.archived ? t("Restore") : t("Archive")}
              </Button>
              {canDelete ? (
                <Button variant="secondary" onClick={() => setDialog({ kind: "delete-goal" })} className="max-lg:hidden">
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("Delete")}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {accounts.length === 0 && !goal.archived ? (
          <p className="text-xs text-muted">
            {t("Create an account under")}{" "}
            <Link href="/profile/accounts" className="font-semibold text-primary-strong underline">
              {t("Profile → Accounts")}
            </Link>{" "}
            {t("to add money.")}
          </p>
        ) : null}
        {goal.archived ? <p className="text-xs text-muted">{t("Archived goals do not take new money. Restore it to add more.")}</p> : null}
        {goal.owner.isMine && !canDelete ? (
          <p className="text-xs text-muted">
            {goal.shared
              ? t("To delete this goal, take all the money out first (each person takes out their own share), or archive it.")
              : t("To delete this goal, take all the money out first, or archive it.")}
          </p>
        ) : null}
      </section>

      {contributors.length > 1 || (contributors.length === 1 && !contributors[0].isMe) ? (
        <section aria-labelledby="goal-contributors" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h2 id="goal-contributors" className="text-sm font-bold">
            {t("Who saved")}
          </h2>
          <ul className="flex flex-col gap-2">
            {contributors.map((person) => (
              <li key={person.userId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{person.isMe ? t("You") : person.name}</span>
                  <span className="tabular-nums">{formatMoney(Number(person.saved), currency)}</span>
                </div>
                <ProgressBar tone="goal" value={Number(person.saved)} max={Math.max(saved, 0.01)} label={t("{name}'s share of the goal", { name: person.name })} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="goal-history" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="goal-history" className="text-sm font-bold">
          {t("Progress over time")}
        </h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted">{t("Nothing saved yet. Add money to see the progress here.")}</p>
        ) : (
          <GoalHistoryChart data={chartData} target={target} />
        )}
      </section>

      <section aria-labelledby="goal-contributions" className="flex flex-col gap-2">
        <h2 id="goal-contributions" className="text-sm font-bold">
          {t("Contributions")}
        </h2>
        {contributions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
            {t("No money has been added to this goal yet.")}
          </p>
        ) : (
          <ul className="hidden flex-col gap-1.5 lg:flex" aria-label={t("Contributions")}>
            {contributions.map((item) => {
              const label =
                item.type === "deposit"
                  ? t("deposit of {amount} on {date}", { amount: formatMoney(Number(item.amount), currency), date: formatDate(item.date, t) })
                  : t("withdrawal of {amount} on {date}", { amount: formatMoney(Number(item.amount), currency), date: formatDate(item.date, t) });
              return (
                <EntryCard
                  key={item.id}
                  leading={
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-lg ${
                        "bg-goals text-on-accent"
                      }`}
                    >
                      {item.type === "deposit" ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                      <span className="sr-only">{item.type === "deposit" ? t("Deposit") : t("Withdrawal")}</span>
                    </span>
                  }
                  title={item.by.isMine ? t("You") : item.by.name}
                  amount={
                    <span className="font-bold tabular-nums">
                      {item.type === "deposit" ? "+" : ""}
                      {formatMoney(Number(item.amount), currency)}
                    </span>
                  }
                  meta={[
                    <span key="d" className="inline-flex items-center gap-1">
                      {formatDate(item.date, t)}
                      {item.account ? ` · ${item.account.name}` : ""}
                      {item.recurring ? <Repeat className="size-3" aria-label={t("Recurring")} /> : null}
                    </span>,
                  ]}
                  note={item.note}
                  actions={
                    item.by.isMine ? (
                      <>
                        <IconButton label={t("Edit {name}", { name: label })} onClick={() => setDialog({ kind: "edit-contribution", item })}>
                          <Pencil className="size-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton label={t("Delete {name}", { name: label })} onClick={() => setDialog({ kind: "delete-contribution", item })}>
                          <Trash2 className="size-4" aria-hidden="true" />
                        </IconButton>
                      </>
                    ) : null
                  }
                />
              );
            })}
          </ul>
        )}
        {contributions.length > 0 ? (
          <DayGroupList
            items={contributions}
            label={t("Contributions")}
            dayTotal={(items) =>
              items.reduce((sum, item) => sum + (item.type === "deposit" ? 1 : -1) * toCents(item.amount), 0)
            }
            renderRow={(item) => (
              <ContributionRow
                item={item}
                onSelect={() => setDialog({ kind: "edit-contribution", item })}
              />
            )}
          />
        ) : null}
      </section>

      <Modal open={dialog?.kind === "deposit"} title={t("Add money")} onClose={close}>
        <GoalContributionForm
          goal={{ id: goal.id, name: goal.name, completed: progress.completed }}
          type="deposit"
          accounts={accounts}
          onDone={close}
        />
      </Modal>
      <Modal open={dialog?.kind === "withdrawal"} title={t("Take money out")} onClose={close}>
        <GoalContributionForm
          goal={{ id: goal.id, name: goal.name, completed: progress.completed }}
          type="withdrawal"
          accounts={accounts}
          withdrawable={mySaved}
          onDone={close}
        />
      </Modal>
      <Modal open={dialog?.kind === "edit-goal"} title={t("Edit goal")} onClose={close}>
        <GoalForm
          goal={{
            id: goal.id,
            name: goal.name,
            targetAmount: goal.targetAmount,
            deadline: goal.deadline ?? "",
            color: goal.color,
            icon: goal.icon,
            shared: goal.shared,
            note: goal.note ?? "",
          }}
          inHousehold={inHousehold}
          onDone={close}
          onDelete={canDelete ? () => setDialog({ kind: "delete-goal" }) : undefined}
        />
      </Modal>
      <Modal open={dialog?.kind === "edit-contribution"} title={t("Edit contribution")} onClose={close}>
        {dialog?.kind === "edit-contribution" && dialog.item.account ? (
          <GoalContributionForm
            key={dialog.item.id}
            goal={{ id: goal.id, name: goal.name, completed: progress.completed }}
            type={dialog.item.type}
            accounts={accounts}
            withdrawable={dialog.item.type === "withdrawal" ? mySaved + Number(dialog.item.amount) : undefined}
            contribution={{
              id: dialog.item.id,
              accountId: dialog.item.account.id ?? "",
              amount: dialog.item.amount,
              date: dialog.item.date,
              note: dialog.item.note ?? "",
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete-contribution", item: dialog.item })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete-contribution"}
        title={t("Delete contribution")}
        description={
          dialog?.kind === "delete-contribution"
            ? t(dialog.item.type === "deposit" ? "Delete this deposit of {amount}? {effect}" : "Delete this withdrawal of {amount}? {effect}", {
                amount: formatMoney(Number(dialog.item.amount), currency),
                effect: dialog.item.account?.id
                  ? t("The balance of {account} is corrected.", { account: dialog.item.account.name })
                  : t("{account} no longer exists, so no balance changes.", { account: dialog.item.account?.name ?? t("The account") }),
              })
            : ""
        }
        confirmLabel={t("Delete contribution")}
        pending={pending}
        error={actionError}
        onConfirm={() => dialog?.kind === "delete-contribution" && confirmDeleteContribution(dialog.item)}
        onClose={close}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete-goal"}
        title={t("Delete goal")}
        description={
          goal.used
            ? t("Delete {name}? It is removed from your goals. Its history is kept.", { name: goal.name })
            : t("Delete {name}? This cannot be undone.", { name: goal.name })
        }
        confirmLabel={t("Delete goal")}
        pending={pending}
        error={actionError}
        onConfirm={confirmDeleteGoal}
        onClose={close}
      />
    </div>
  );
}

/** One contribution on phones: tap to edit your own; other people's are read-only. */
function ContributionRow({ item, onSelect }: { item: GoalContributionItem; onSelect: () => void }) {
  const t = useT();
  const { currency } = useRegion();
  const deposit = item.type === "deposit";
  const details = [item.by.isMine ? t("You") : item.by.name, item.account?.name, item.note].filter(Boolean).join(" · ");
  const label = t(deposit ? "deposit of {amount} on {date}" : "withdrawal of {amount} on {date}", {
    amount: formatMoney(Number(item.amount), currency),
    date: formatDate(item.date, t),
  });
  return (
    <div className="relative flex min-h-14 items-center gap-3 px-3 py-2">
      <span
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${
          "bg-goals text-on-accent"
        }`}
      >
        {deposit ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
        <span className="sr-only">{deposit ? t("Deposit") : t("Withdrawal")}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{deposit ? t("Deposit") : t("Withdrawal")}</span>
          {item.recurring ? <Repeat className="size-3.5 shrink-0 text-muted" aria-label={t("Recurring")} /> : null}
        </span>
        {details ? <span className="truncate text-xs text-muted">{details}</span> : null}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {deposit ? "+" : ""}
        {formatMoney(Number(item.amount), currency)}
      </span>
      {item.by.isMine && item.account ? <RowTapTarget label={t("Edit {name}", { name: label })} onClick={onSelect} /> : null}
    </div>
  );
}
