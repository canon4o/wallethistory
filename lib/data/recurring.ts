import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { accounts, categories, goals, recurringRuleTags, recurringRules } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { RecurringFrequency } from "@/lib/recurring/dates";

export type RecurringRuleItem = {
  id: string;
  kind: "income" | "expense" | "transfer" | "goal";
  /** numeric(14,2) as a string, e.g. "100.00". */
  amount: string;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  goalId: string | null;
  goalName: string | null;
  tagIds: string[];
  note: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  status: "active" | "paused" | "ended";
  pausedReason: "manual" | "stale" | "household_link" | "goal_closed" | null;
};

/** The current user's own recurring rules, soonest due first. */
export async function listRecurringRules(): Promise<RecurringRuleItem[]> {
  const user = await requireUser();
  const db = getDb();
  const fromAccount = alias(accounts, "from_account");
  const toAccount = alias(accounts, "to_account");

  const rows = await db
    .select({
      rule: recurringRules,
      accountName: accounts.name,
      categoryName: categories.name,
      fromAccountName: fromAccount.name,
      toAccountName: toAccount.name,
      goalName: goals.name,
    })
    .from(recurringRules)
    .leftJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
    .leftJoin(fromAccount, eq(fromAccount.id, recurringRules.fromAccountId))
    // A transfer may go to a household member's account, so the destination is not user-scoped.
    .leftJoin(toAccount, eq(toAccount.id, recurringRules.toAccountId))
    // A goal may belong to a household member (shared goals), so it is not user-scoped either.
    .leftJoin(goals, eq(goals.id, recurringRules.goalId))
    .where(eq(recurringRules.userId, user.id))
    .orderBy(asc(recurringRules.nextDueDate), asc(recurringRules.createdAt));

  const tagRows = rows.length
    ? await db
        .select({ ruleId: recurringRuleTags.ruleId, tagId: recurringRuleTags.tagId })
        .from(recurringRuleTags)
        .where(
          inArray(
            recurringRuleTags.ruleId,
            rows.map((row) => row.rule.id),
          ),
        )
    : [];
  const tagsByRule = new Map<string, string[]>();
  for (const { ruleId, tagId } of tagRows) tagsByRule.set(ruleId, [...(tagsByRule.get(ruleId) ?? []), tagId]);

  return rows.map(({ rule, accountName, categoryName, fromAccountName, toAccountName, goalName }) => ({
    id: rule.id,
    kind: rule.kind,
    amount: rule.amount,
    accountId: rule.accountId,
    accountName,
    categoryId: rule.categoryId,
    categoryName,
    fromAccountId: rule.fromAccountId,
    fromAccountName,
    toAccountId: rule.toAccountId,
    toAccountName,
    goalId: rule.goalId,
    goalName,
    tagIds: tagsByRule.get(rule.id) ?? [],
    note: rule.note,
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    startDate: rule.startDate,
    endDate: rule.endDate,
    nextDueDate: rule.nextDueDate,
    status: rule.status,
    pausedReason: rule.pausedReason,
  }));
}
