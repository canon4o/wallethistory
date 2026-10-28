import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { FiltersToggleButton, FiltersToggleProvider } from "@/components/ui/CollapsibleFilters";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionsManager } from "@/components/transactions/TransactionsManager";
import { TransactionsPagination } from "@/components/transactions/TransactionsPagination";
import { getPreferredAccountId, listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { listBudgets } from "@/lib/data/budgets";
import { listCategories, listFilterCategories } from "@/lib/data/categories";
import { getHouseholdOverview } from "@/lib/data/household";
import { listFilterTags, listTags } from "@/lib/data/tags";
import { listTransactions } from "@/lib/data/transactions";
import { activeFilterCount, hasActiveFilters, parseTransactionFilters } from "@/lib/validation/transactions";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Transactions") };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const t = await getT();
  const filters = parseTransactionFilters(await searchParams);
  const [result, accounts, sharedAccounts, categories, tags, filterCategories, filterTags, household, budgets, defaultAccountId] = await Promise.all([
    listTransactions(filters),
    listAccounts(),
    listHouseholdAccounts(),
    listCategories(),
    listTags(),
    listFilterCategories(),
    listFilterTags(),
    getHouseholdOverview(),
    listBudgets(),
    getPreferredAccountId(filters.accountId),
  ]);
  // Budgets are listed most urgent first, so a category with two budgets shows the tighter one.
  const remainingByCategory = new Map<string, string>();
  for (const budget of budgets) {
    if (!remainingByCategory.has(budget.category.id)) remainingByCategory.set(budget.category.id, budget.remaining);
  }
  const formCategories = categories.map((category) => ({ ...category, budgetRemaining: remainingByCategory.get(category.id) }));
  // The Account filter also offers household members' accounts; forms only get my own.
  const filterAccounts = [
    ...accounts,
    ...sharedAccounts.map((account) => ({ ...account, name: `${account.ownerName} · ${account.name}` })),
  ];

  return (
    <>
      <FiltersToggleProvider>
        <PageHeader title={t("Transactions")} actions={<FiltersToggleButton activeCount={activeFilterCount(filters)} />} />
        <TransactionFilters
          filters={filters}
          accounts={filterAccounts}
          categories={filterCategories}
          tags={filterTags}
          people={household.members}
        />
      </FiltersToggleProvider>
      <TransactionsManager
        items={result.items}
        accounts={accounts}
        transferTargets={filterAccounts}
        categories={formCategories}
        tags={tags}
        defaultAccountId={defaultAccountId ?? undefined}
        filtered={hasActiveFilters(filters)}
      />
      <TransactionsPagination
        filters={filters}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
      />
    </>
  );
}
