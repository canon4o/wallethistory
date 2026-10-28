"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRegion } from "@/components/layout/RegionProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import type { DeletedGoalItem, GoalItem } from "@/lib/data/goals";
import { formatMoney } from "@/lib/format";
import { goalProgress } from "@/lib/goals/progress";
import { fromCents, toCents } from "@/lib/reports/money";
import { DeletedGoalList } from "./DeletedGoalList";
import { GoalCard } from "./GoalCard";
import { GoalForm } from "./GoalForm";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

type StatusFilter = "active" | "completed" | "archived" | "deleted";
type OwnerFilter = "all" | "mine" | "shared";

const STATUS_LABELS: Record<StatusFilter, string> = { active: msg("Active"), completed: msg("Completed"), archived: msg("Archived"), deleted: msg("Deleted") };
const OWNER_LABELS: Record<OwnerFilter, string> = { all: msg("All"), mine: msg("Mine"), shared: msg("Shared with me") };

const segmentClass = (selected: boolean) =>
  `inline-flex min-h-10 items-center rounded px-3 focus-visible:outline-2 focus-visible:outline-primary-strong ${
    selected ? "bg-primary-soft text-primary-soft-foreground" : "text-muted hover:bg-background"
  }`;

function statusOf(goal: GoalItem, today: string): Exclude<StatusFilter, "deleted"> {
  if (goal.archived) return "archived";
  return goalProgress({
    savedCents: toCents(goal.saved),
    targetCents: toCents(goal.targetAmount),
    deadline: goal.deadline,
    today,
  }).completed
    ? "completed"
    : "active";
}

export function GoalsManager({
  goals,
  deletedGoals,
  inHousehold,
  today,
}: {
  goals: GoalItem[];
  deletedGoals: DeletedGoalItem[];
  inHousehold: boolean;
  today: string;
}) {
  const t = useT();
  const { currency } = useRegion();
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [owner, setOwner] = useState<OwnerFilter>("all");

  const open = goals.filter((goal) => !goal.archived);
  const visible = goals.filter(
    (goal) =>
      status !== "deleted" &&
      statusOf(goal, today) === status &&
      (owner === "all" || (owner === "mine" ? goal.owner.isMine : !goal.owner.isMine)),
  );
  const totalSaved = open.reduce((sum, goal) => sum + toCents(goal.saved), 0);
  const totalTarget = open.reduce((sum, goal) => sum + toCents(goal.targetAmount), 0);

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add goal")}
    </Button>
  );

  return (
    <>
      {goals.length === 0 && deletedGoals.length === 0 ? (
        <EmptyState
          title={t("No goals yet")}
          description={t("A goal is something you save towards, like a trip or a new car. Set a target and add money to it over time.")}
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <dl aria-label={t("Goals summary")} className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
              <dt className="text-xs text-muted">{t("Saved in goals")}</dt>
              <dd className="text-xl font-bold tabular-nums">{formatMoney(Number(fromCents(totalSaved)), currency)}</dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
              <dt className="text-xs text-muted">{t("Total target")}</dt>
              <dd className="text-xl font-bold tabular-nums">{formatMoney(Number(fromCents(totalTarget)), currency)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <div role="group" aria-label={t("Goal status")} className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm font-semibold">
                {(Object.keys(STATUS_LABELS) as StatusFilter[])
                  .filter((value) => value !== "deleted" || deletedGoals.length > 0 || status === "deleted")
                  .map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                    className={segmentClass(status === value)}
                  >
                    {t(STATUS_LABELS[value])}
                  </button>
                ))}
              </div>
              {inHousehold && status !== "deleted" ? (
                <div role="group" aria-label={t("Whose goals")} className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm font-semibold">
                  {(Object.keys(OWNER_LABELS) as OwnerFilter[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={owner === value}
                      onClick={() => setOwner(value)}
                      className={segmentClass(owner === value)}
                    >
                      {t(OWNER_LABELS[value])}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {addButton}
          </div>

          {status === "deleted" ? (
            deletedGoals.length === 0 ? (
              <EmptyState title={t("No deleted goals")} description={t("Nothing here yet.")} />
            ) : (
              <DeletedGoalList goals={deletedGoals} />
            )
          ) : visible.length === 0 ? (
            <EmptyState
              title={t("No {status} goals", { status: t(STATUS_LABELS[status]).toLowerCase() })}
              description={status === "active" ? t("Add a goal, or check the other filters.") : t("Nothing here yet.")}
            />
          ) : (
            <ul aria-label={t("Goals")} className="grid gap-2 md:grid-cols-2">
              {visible.map((goal) => (
                <GoalCard key={goal.id} goal={goal} currency={currency} today={today} />
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={creating} title={t("Add goal")} onClose={() => setCreating(false)}>
        <GoalForm inHousehold={inHousehold} onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}

