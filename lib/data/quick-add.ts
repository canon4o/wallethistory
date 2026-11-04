import { getPreferredAccountId, listAccounts, listHouseholdAccounts } from "./accounts";
import { listBudgets } from "./budgets";
import { listCategories } from "./categories";
import { listGoals } from "./goals";
import { listTags } from "./tags";
import type { AccountSelectItem } from "@/components/accounts/AccountSelect";
import type { CategorySelectItem } from "@/components/categories/CategorySelect";

/** Everything the quick-add forms (transaction, transfer, goal deposit) need, in one read. */
export type QuickAddOptions = {
  /** The user's own accounts. */
  accounts: AccountSelectItem[];
  /** Own accounts plus household members' accounts: where a transfer can send money. */
  transferTargets: AccountSelectItem[];
  categories: Array<CategorySelectItem & { type: "income" | "expense" }>;
  tags: Array<{ id: string; name: string }>;
  defaultAccountId?: string;
  /** Open goals the user can put money into. */
  goals: Array<{ id: string; name: string; completed: boolean }>;
};

/** Same data the Transactions page loads for its forms, plus the open goals. Scoped to the current user. */
export async function getQuickAddOptions(): Promise<QuickAddOptions> {
  const [accounts, sharedAccounts, categories, tags, budgets, defaultAccountId, goals] = await Promise.all([
    listAccounts(),
    listHouseholdAccounts(),
    listCategories(),
    listTags(),
    listBudgets(),
    getPreferredAccountId(),
    listGoals(),
  ]);
  // Budgets are listed most urgent first, so a category with two budgets shows the tighter one.
  const remainingByCategory = new Map<string, string>();
  for (const budget of budgets) {
    if (!remainingByCategory.has(budget.category.id)) remainingByCategory.set(budget.category.id, budget.remaining);
  }
  return {
    accounts,
    transferTargets: [
      ...accounts,
      ...sharedAccounts.map((account) => ({ ...account, name: `${account.ownerName} · ${account.name}` })),
    ],
    categories: categories.map((category) => ({ ...category, budgetRemaining: remainingByCategory.get(category.id) })),
    tags,
    defaultAccountId: defaultAccountId ?? undefined,
    goals: goals
      .filter((goal) => !goal.archived)
      .map((goal) => ({ id: goal.id, name: goal.name, completed: Number(goal.saved) >= Number(goal.targetAmount) })),
  };
}
