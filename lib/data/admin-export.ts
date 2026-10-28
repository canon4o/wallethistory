import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  budgets,
  categories,
  householdMembers,
  recurringRuleTags,
  recurringRules,
  tags,
  transactionTags,
  transactions,
  transfers,
  users,
} from "@/db/schema";

/**
 * Everything one user owns, as plain data, for a GDPR-style copy. Columns are listed one by one:
 * no password hash, session or token, and nothing that belongs to another user. The caller
 * (the export route) is responsible for requireAdmin() and for writing the audit row.
 */
export async function buildUserExport(userId: string) {
  const db = getDb();
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      currency: users.currency,
      timezone: users.timezone,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!profile) return null;

  const [accountRows, categoryRows, tagRows, transactionRows, transferRows, budgetRows, ruleRows, membership] =
    await Promise.all([
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          initialBalance: accounts.initialBalance,
          color: accounts.color,
          icon: accounts.icon,
          createdAt: accounts.createdAt,
        })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .orderBy(asc(accounts.createdAt), asc(accounts.id)),
      db
        .select({
          id: categories.id,
          type: categories.type,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          createdAt: categories.createdAt,
        })
        .from(categories)
        .where(eq(categories.userId, userId))
        .orderBy(asc(categories.type), asc(categories.name)),
      db
        .select({ id: tags.id, name: tags.name, createdAt: tags.createdAt })
        .from(tags)
        .where(eq(tags.userId, userId))
        .orderBy(asc(tags.name)),
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          type: transactions.type,
          amount: transactions.amount,
          accountId: transactions.accountId,
          categoryId: transactions.categoryId,
          note: transactions.note,
          recurringDate: transactions.recurringDate,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id)),
      db
        .select({
          id: transfers.id,
          date: transfers.date,
          amount: transfers.amount,
          fromAccountId: transfers.fromAccountId,
          toAccountId: transfers.toAccountId,
          note: transfers.note,
          recurringDate: transfers.recurringDate,
          createdAt: transfers.createdAt,
        })
        .from(transfers)
        .where(eq(transfers.userId, userId))
        .orderBy(asc(transfers.date), asc(transfers.createdAt), asc(transfers.id)),
      db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          amount: budgets.amount,
          period: budgets.period,
          createdAt: budgets.createdAt,
        })
        .from(budgets)
        .where(eq(budgets.userId, userId))
        .orderBy(asc(budgets.createdAt), asc(budgets.id)),
      db
        .select({
          id: recurringRules.id,
          kind: recurringRules.kind,
          amount: recurringRules.amount,
          accountId: recurringRules.accountId,
          categoryId: recurringRules.categoryId,
          fromAccountId: recurringRules.fromAccountId,
          toAccountId: recurringRules.toAccountId,
          note: recurringRules.note,
          frequency: recurringRules.frequency,
          intervalCount: recurringRules.intervalCount,
          startDate: recurringRules.startDate,
          endDate: recurringRules.endDate,
          nextDueDate: recurringRules.nextDueDate,
          status: recurringRules.status,
          pausedReason: recurringRules.pausedReason,
          createdAt: recurringRules.createdAt,
        })
        .from(recurringRules)
        .where(eq(recurringRules.userId, userId))
        .orderBy(asc(recurringRules.createdAt), asc(recurringRules.id)),
      db
        .select({ householdId: householdMembers.householdId, joinedAt: householdMembers.joinedAt })
        .from(householdMembers)
        .where(eq(householdMembers.userId, userId)),
    ]);

  const transactionIds = transactionRows.map((row) => row.id);
  const tagLinks = transactionIds.length
    ? await db
        .select({ transactionId: transactionTags.transactionId, tag: tags.name })
        .from(transactionTags)
        .innerJoin(tags, and(eq(tags.id, transactionTags.tagId), eq(tags.userId, userId)))
        .where(inArray(transactionTags.transactionId, transactionIds))
    : [];
  const tagsByTransaction = new Map<string, string[]>();
  for (const link of tagLinks) {
    tagsByTransaction.set(link.transactionId, [...(tagsByTransaction.get(link.transactionId) ?? []), link.tag]);
  }

  const ruleIds = ruleRows.map((row) => row.id);
  const ruleTagLinks = ruleIds.length
    ? await db
        .select({ ruleId: recurringRuleTags.ruleId, tag: tags.name })
        .from(recurringRuleTags)
        .innerJoin(tags, and(eq(tags.id, recurringRuleTags.tagId), eq(tags.userId, userId)))
        .where(inArray(recurringRuleTags.ruleId, ruleIds))
    : [];
  const tagsByRule = new Map<string, string[]>();
  for (const link of ruleTagLinks) {
    tagsByRule.set(link.ruleId, [...(tagsByRule.get(link.ruleId) ?? []), link.tag]);
  }

  // Household partners appear by name only, never with their data.
  const household = membership[0]
    ? {
        joinedAt: membership[0].joinedAt,
        members: (
          await db
            .select({ name: users.name })
            .from(householdMembers)
            .innerJoin(users, eq(users.id, householdMembers.userId))
            .where(eq(householdMembers.householdId, membership[0].householdId))
            .orderBy(asc(users.name))
        ).map((member) => member.name),
      }
    : null;

  const ownAccountNames = new Map(accountRows.map((row) => [row.id, row.name]));
  const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));
  // The receiving account of a transfer may belong to a household partner: only its owner sees its name.
  const accountLabel = (id: string) => ownAccountNames.get(id) ?? "An account of a household member";

  return {
    exportedAt: new Date(),
    profile,
    household,
    accounts: accountRows,
    categories: categoryRows,
    tags: tagRows,
    transactions: transactionRows.map((row) => ({
      ...row,
      account: ownAccountNames.get(row.accountId) ?? null,
      category: row.categoryId ? (categoryNames.get(row.categoryId) ?? null) : null,
      tags: tagsByTransaction.get(row.id) ?? [],
    })),
    transfers: transferRows.map((row) => ({
      ...row,
      fromAccount: accountLabel(row.fromAccountId),
      toAccount: accountLabel(row.toAccountId),
    })),
    budgets: budgetRows.map((row) => ({ ...row, category: categoryNames.get(row.categoryId) ?? null })),
    recurringRules: ruleRows.map((row) => ({
      ...row,
      account: row.accountId ? (ownAccountNames.get(row.accountId) ?? null) : null,
      category: row.categoryId ? (categoryNames.get(row.categoryId) ?? null) : null,
      fromAccount: row.fromAccountId ? accountLabel(row.fromAccountId) : null,
      toAccount: row.toAccountId ? accountLabel(row.toAccountId) : null,
      tags: tagsByRule.get(row.id) ?? [],
    })),
  };
}
