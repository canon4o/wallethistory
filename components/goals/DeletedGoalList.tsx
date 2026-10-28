"use client";

import { useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteGoalPermanently, restoreGoal } from "@/lib/actions/goals";
import type { DeletedGoalItem } from "@/lib/data/goals";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

/** Soft-deleted goals: the only things to do are bring one back or, when it changes no balance, remove it permanently. */
export function DeletedGoalList({ goals }: { goals: DeletedGoalItem[] }) {
  const t = useT();
  const [removing, setRemoving] = useState<DeletedGoalItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore(goal: DeletedGoalItem) {
    setError(null);
    const result = await restoreGoal(goal.id);
    if (!result.ok) setError(result.error);
  }

  async function confirmRemove(goal: DeletedGoalItem) {
    setPending(true);
    setError(null);
    const result = await deleteGoalPermanently(goal.id);
    setPending(false);
    if (result.ok) setRemoving(null);
    else setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {t("Deleted goals are hidden everywhere else. Restore one to use it again. A goal can be removed permanently once none of its money movements is on an existing account.")}
      </p>
      {error && removing === null ? <Alert tone="error">{error}</Alert> : null}
      <ul aria-label={t("Deleted goals")} className="grid gap-2 md:grid-cols-2">
        {goals.map((goal) => (
          <li key={goal.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <CategoryBadge icon={goal.icon} color={goal.color} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{goal.name}</span>
              <span className="text-xs text-muted">{t("Deleted {date}", { date: formatDate(goal.deletedAt.toISOString().slice(0, 10), t) })}</span>
            </span>
            <Button variant="secondary" onClick={() => restore(goal)}>
              <ArchiveRestore className="size-4" aria-hidden="true" />
              {t("Restore")}
            </Button>
            {goal.canDeletePermanently ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setRemoving(goal);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t("Delete permanently")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={t("Delete goal permanently")}
        description={t("Delete {name} permanently? Its history is removed and this cannot be undone. No account balance changes.", {
          name: removing?.name ?? t("this goal"),
        })}
        confirmLabel={t("Delete permanently")}
        pending={pending}
        error={error}
        onConfirm={() => removing && confirmRemove(removing)}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
