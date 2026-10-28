import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalContributions, transactions, transfers } from "@/db/schema";
import type { AccountType } from "@/lib/account-types";
import { cached } from "@/lib/cache";
import { requireHouseholdScope, type HouseholdScope } from "./household";

export type AccountWithBalance = {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  /** Preselected on new transactions; at most one account per user. */
  isDefault: boolean;
  /** numeric(14,2) as a string, e.g. "100.00". */
  initialBalance: string;
  /** initial_balance + income - expense + transfers in - transfers out - goal deposits + goal withdrawals, computed here and never stored. */
  balance: string;
};

/** Balances are sums over the whole history, so the rows are cached per household (see lib/cache). */
function selectAccounts(scope: HouseholdScope, userIds: string[]) {
  return cached({ name: "accounts", memberIds: scope.memberIds, args: { userIds } }, () => queryAccounts(userIds));
}

function queryAccounts(userIds: string[]) {
  return getDb()
    .select({
      id: accounts.id,
      ownerId: accounts.userId,
      name: accounts.name,
      type: accounts.type,
      color: accounts.color,
      icon: accounts.icon,
      isDefault: accounts.isDefault,
      initialBalance: accounts.initialBalance,
      // Correlated subqueries (not joins) so transactions and transfers can't multiply each other's rows.
      // Single-table selects render columns unqualified, so the outer columns are spelled out to stay unambiguous.
      // Transactions and outgoing transfers on an account always belong to its owner (database triggers).
      // Incoming transfers may come from a household member, so they are matched by destination only.
      balance: sql<string>`(${accounts.initialBalance}
        + coalesce((select sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end)
            from ${transactions} where ${transactions.accountId} = "accounts"."id" and ${transactions.userId} = "accounts"."user_id"), 0)
        + coalesce((select sum(${transfers.amount}) from ${transfers}
            where ${transfers.toAccountId} = "accounts"."id"), 0)
        - coalesce((select sum(${transfers.amount}) from ${transfers}
            where ${transfers.fromAccountId} = "accounts"."id" and ${transfers.userId} = "accounts"."user_id"), 0)
        - coalesce((select sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)
            from ${goalContributions} where ${goalContributions.accountId} = "accounts"."id"), 0)
      )::text`,
    })
    .from(accounts)
    .where(inArray(accounts.userId, userIds))
    .orderBy(asc(accounts.createdAt), asc(accounts.name));
}

/** The current user's own accounts (the ones they can record transactions on). */
export async function listAccounts(): Promise<AccountWithBalance[]> {
  const scope = await requireHouseholdScope();
  const rows = await selectAccounts(scope, [scope.userId]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    isDefault: row.isDefault,
    initialBalance: row.initialBalance,
    balance: row.balance,
  }));
}

export type SharedAccount = AccountWithBalance & { ownerId: string; ownerName: string };

/**
 * Accounts of the other people in the user's household, read-only. `userIds` defaults to every
 * member; it is always intersected with the household so it can never reach strangers.
 */
export async function listHouseholdAccounts(userIds?: string[]): Promise<SharedAccount[]> {
  const scope = await requireHouseholdScope();
  const wanted = scope.memberIds.filter((id) => id !== scope.userId && (!userIds || userIds.includes(id)));
  if (wanted.length === 0) return [];
  const rows = await selectAccounts(scope, wanted);
  return rows.map((row) => ({ ...row, ownerName: scope.names.get(row.ownerId) ?? "Member" }));
}

/** How many of the latest transactions decide the fallback account. */
const RECENT_TRANSACTIONS = 5;

/**
 * The account to preselect on a new transaction: the account being viewed (when it is mine), else
 * the default account, else the account used most in my last few transactions, else the first account.
 */
export async function getPreferredAccountId(viewedAccountId?: string): Promise<string | null> {
  const scope = await requireHouseholdScope();
  const own = await listAccounts();
  const viewed = own.find((account) => account.id === viewedAccountId);
  if (viewed) return viewed.id;
  const preferred = own.find((account) => account.isDefault);
  if (preferred) return preferred.id;
  const recent = await getDb()
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(eq(transactions.userId, scope.userId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(RECENT_TRANSACTIONS);
  // The most used account among the latest transactions; a tie goes to the more recent one.
  const counts = new Map<string, number>();
  for (const { accountId } of recent) counts.set(accountId, (counts.get(accountId) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const mostUsedId = recent.find(({ accountId }) => counts.get(accountId) === top)?.accountId;
  const last = own.find((account) => account.id === mostUsedId);
  return (last ?? own[0])?.id ?? null;
}
