"use client";

import { useState } from "react";
import type { AccountSelectItem } from "@/components/accounts/AccountSelect";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/client";
import { GoalContributionForm } from "./GoalContributionForm";

type QuickGoalDepositFormProps = {
  goals: Array<{ id: string; name: string; completed: boolean }>;
  accounts: AccountSelectItem[];
  onDone: () => void;
};

/** A goal picker on top of the normal deposit form, for adding money to a goal from anywhere in the app. */
export function QuickGoalDepositForm({ goals, accounts, onDone }: QuickGoalDepositFormProps) {
  const t = useT();
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const goal = goals.find((item) => item.id === goalId) ?? goals[0];
  if (!goal) return null;
  return (
    <div className="flex flex-col gap-4">
      <Select id="quick-goal" label={t("Goal")} value={goal.id} onChange={(event) => setGoalId(event.target.value)}>
        {goals.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
      <GoalContributionForm key={goal.id} goal={goal} type="deposit" accounts={accounts} onDone={onDone} />
    </div>
  );
}
