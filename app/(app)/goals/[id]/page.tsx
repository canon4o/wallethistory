import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { GoalDetail } from "@/components/goals/GoalDetail";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { listAccounts } from "@/lib/data/accounts";
import { getGoal, getGoalHistory, listGoalContributions, listGoalContributors } from "@/lib/data/goals";
import { requireHouseholdScope } from "@/lib/data/household";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Goal") };
}

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const goal = await getGoal(id);
  if (!goal) notFound();
  const [contributors, contributions, history, accounts, household] = await Promise.all([
    listGoalContributors(goal.id),
    listGoalContributions(goal.id),
    getGoalHistory(goal.id),
    listAccounts(),
    requireHouseholdScope(),
  ]);

  return (
    <GoalDetail
      goal={goal}
      contributors={contributors}
      contributions={contributions}
      history={history}
      accounts={accounts.map(({ id: accountId, name, icon, color, balance }) => ({ id: accountId, name, icon, color, balance }))}
      inHousehold={household.memberIds.length > 1}
      today={todayISO(user.timezone)}
    />
  );
}
