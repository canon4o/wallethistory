import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecurringManager } from "@/components/recurring/RecurringManager";
import { listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { listBudgets } from "@/lib/data/budgets";
import { listCategories } from "@/lib/data/categories";
import { listGoals } from "@/lib/data/goals";
import { listRecurringRules } from "@/lib/data/recurring";
import { listTags } from "@/lib/data/tags";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Recurring") };
}

export default async function RecurringPage() {
  const t = await getT();
  const [rules, accounts, sharedAccounts, categories, tags, goals, budgets] = await Promise.all([
    listRecurringRules(),
    listAccounts(),
    listHouseholdAccounts(),
    listCategories(),
    listTags(),
    listGoals(),
    listBudgets(),
  ]);
  // Budgets are listed most urgent first, so a category with two budgets shows the tighter one.
  const remainingByCategory = new Map<string, string>();
  for (const budget of budgets) {
    if (!remainingByCategory.has(budget.category.id)) remainingByCategory.set(budget.category.id, budget.remaining);
  }
  const formCategories = categories.map((category) => ({ ...category, budgetRemaining: remainingByCategory.get(category.id) }));
  // A recurring transfer may also go to a household member's account.
  const transferTargets = [
    ...accounts,
    ...sharedAccounts.map((account) => ({ ...account, name: `${account.ownerName} · ${account.name}` })),
  ];

  return (
    <>
      <PageHeader title={t("Recurring")} />
      <RecurringManager
        rules={rules}
        accounts={accounts}
        transferTargets={transferTargets}
        categories={formCategories}
        tags={tags}
        goals={goals.filter((goal) => !goal.archived).map(({ id, name }) => ({ id, name }))}
      />
    </>
  );
}
