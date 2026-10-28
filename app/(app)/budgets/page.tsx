import type { Metadata } from "next";
import { BudgetsManager } from "@/components/budgets/BudgetsManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { SharedBudgets } from "@/components/household/SharedBudgets";
import { requireUser } from "@/lib/auth/session";
import { getBudgetHints, listBudgets, listHouseholdBudgets } from "@/lib/data/budgets";
import { listCategories } from "@/lib/data/categories";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Budgets") };
}

export default async function BudgetsPage() {
  const t = await getT();
  const user = await requireUser();
  const [budgets, shared, categories, hints] = await Promise.all([
    listBudgets(),
    listHouseholdBudgets(),
    listCategories(),
    getBudgetHints(),
  ]);
  const expenseCategories = categories
    .filter((category) => category.type === "expense")
    .map(({ id, name, icon, color }) => ({ id, name, icon, color }));

  return (
    <>
      <PageHeader title={t("Budgets")} />
      <BudgetsManager budgets={budgets} categories={expenseCategories} hints={hints} threshold={user.budgetAlertThreshold} />
      <SharedBudgets budgets={shared} currency={user.currency} />
    </>
  );
}
