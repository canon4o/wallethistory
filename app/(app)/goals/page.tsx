import type { Metadata } from "next";
import { GoalsManager } from "@/components/goals/GoalsManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { listDeletedGoals, listGoals } from "@/lib/data/goals";
import { requireHouseholdScope } from "@/lib/data/household";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Goals") };
}

export default async function GoalsPage() {
  const t = await getT();
  const user = await requireUser();
  const [goals, deletedGoals, household] = await Promise.all([listGoals(), listDeletedGoals(), requireHouseholdScope()]);
  return (
    <>
      <PageHeader title={t("Goals")} />
      <GoalsManager goals={goals} deletedGoals={deletedGoals} inHousehold={household.memberIds.length > 1} today={todayISO(user.timezone)} />
    </>
  );
}
