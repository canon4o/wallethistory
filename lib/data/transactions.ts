import { and, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { accounts, categories, tags, transactionTags, transactions, transfers } from "@/db/schema";
import { requireHouseholdScope } from "./household";
import type { TransactionFilters } from "@/lib/validation/transactions";

export const PAGE_SIZE = 20;

/** An account with its owner's name, so lists can say whose account it is. */
export type AccountRef = { id: string; name: string; ownerName: string; isMine: boolean };

export type TransactionItem = {
  id: string;
  /** "transfer" rows move money between two accounts; they have no category or tags. */
  type: "income" | "expense" | "transfer";
  /** numeric(14,2) as text, always positive. */
  amount: string;
  /** `YYYY-MM-DD`. */
  date: string;
  note: string | null;
  /** The account the transaction belongs to; for a transfer, the account the money leaves. */
  account: AccountRef;
  /** Only for transfers: the account the money goes to. */
  transferTo: AccountRef | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  tags: Array<{ id: string; name: string }>;
  /** Created automatically by a recurring rule (also true after the rule has been deleted). */
  recurring: boolean;
  /** Whose it is. Household members' rows are read-only: only `isMine` rows can be edited or deleted. */
  owner: { id: string; name: string; isMine: boolean };
};

export type TransactionPage = {
  items: TransactionItem[];
  total: number;
  page: number;
  pageCount: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `expense:Shopping` -> its type and name. */
export function parseCategoryKey(value: string): { type: "income" | "expense"; name: string } | null {
  const separator = value.indexOf(":");
  const type = value.slice(0, separator);
  const name = value.slice(separator + 1).trim();
  return separator > 0 && (type === "income" || type === "expense") && name ? { type, name } : null;
}

/**
 * Categories and tags are personal, so the filter matches by name across the household. Old links
 * carry an id instead: it resolves to a name only when it belongs to someone in the household.
 */
async function resolveCategoryFilter(value: string, memberIds: string[]) {
  if (!UUID.test(value)) return parseCategoryKey(value);
  const [row] = await getDb()
    .select({ type: categories.type, name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, value), inArray(categories.userId, memberIds)));
  return row ?? null;
}

async function resolveTagFilter(value: string, memberIds: string[]): Promise<string | null> {
  if (!UUID.test(value)) return value;
  const [row] = await getDb()
    .select({ name: tags.name })
    .from(tags)
    .where(and(eq(tags.id, value), inArray(tags.userId, memberIds)));
  return row?.name ?? null;
}

/** Escapes LIKE wildcards so a search for "50%" or "a_b" matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** `pageSize` defaults to 20; the dashboard asks for the latest 5. */
export async function listTransactions(
  filters: TransactionFilters,
  pageSize: number = PAGE_SIZE,
): Promise<TransactionPage> {
  const scope = await requireHouseholdScope();
  const db = getDb();

  // Reads cover the user's household (or only the chosen person). A person who is not in the
  // household is ignored, so the list falls back to the household instead of leaking anything.
  const userIds =
    filters.personId && scope.memberIds.includes(filters.personId) ? [filters.personId] : scope.memberIds;
  // Every query is scoped to those ids, so ids in the filters that belong to someone else
  // simply match nothing.
  const conditions: SQL[] = [inArray(transactions.userId, userIds)];
  // A transfer is visible to its sender's readers, and to whoever owns the destination account.
  const transferVisible = or(
    inArray(transfers.userId, userIds),
    inArray(transfers.toAccountId, db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.userId, userIds))),
  )!;
  const transferConditions: SQL[] = [transferVisible];
  if (filters.from) {
    conditions.push(gte(transactions.date, filters.from));
    transferConditions.push(gte(transfers.date, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(transactions.date, filters.to));
    transferConditions.push(lte(transfers.date, filters.to));
  }
  if (filters.type && filters.type !== "transfer") conditions.push(eq(transactions.type, filters.type));
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
    // A transfer shows up under both of its accounts.
    transferConditions.push(
      or(eq(transfers.fromAccountId, filters.accountId), eq(transfers.toAccountId, filters.accountId))!,
    );
  }
  if (filters.category) {
    const category = await resolveCategoryFilter(filters.category, scope.memberIds);
    conditions.push(
      category
        ? sql`exists (select 1 from ${categories} where ${categories.id} = ${transactions.categoryId} and ${categories.type} = ${category.type} and lower(${categories.name}) = lower(${category.name}))`
        : sql`false`,
    );
  }
  if (filters.q) {
    conditions.push(ilike(transactions.note, `%${escapeLike(filters.q)}%`));
    transferConditions.push(ilike(transfers.note, `%${escapeLike(filters.q)}%`));
  }
  if (filters.tag) {
    const tagName = await resolveTagFilter(filters.tag, scope.memberIds);
    conditions.push(
      tagName === null
        ? sql`false`
        : sql`exists (select 1 from ${transactionTags} inner join ${tags} on ${tags.id} = ${transactionTags.tagId} where ${transactionTags.transactionId} = ${transactions.id} and lower(${tags.name}) = lower(${tagName}))`,
    );
  }

  // Transfers have no type of income/expense, no category and no tags.
  const includeTransactions = filters.type !== "transfer";
  const includeTransfers =
    (!filters.type || filters.type === "transfer") && !filters.category && !filters.tag;

  // One ordered list of (kind, id) over both tables, so paging works across them.
  const keySources: SQL[] = [];
  if (includeTransactions) {
    keySources.push(
      sql`select 'transaction' as kind, ${transactions.id} as id, ${transactions.date} as date, ${transactions.createdAt} as created_at from ${transactions} where ${and(...conditions)}`,
    );
  }
  if (includeTransfers) {
    keySources.push(
      sql`select 'transfer' as kind, ${transfers.id} as id, ${transfers.date} as date, ${transfers.createdAt} as created_at from ${transfers} where ${and(...transferConditions)}`,
    );
  }
  if (keySources.length === 0) return { items: [], total: 0, page: 1, pageCount: 1 };
  const keys = sql.join(keySources, sql` union all `);

  const [{ total }] = await db.execute<{ total: number }>(sql`select count(*)::int as total from (${keys}) as k`);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, pageCount);

  const keyRows = await db.execute<{ kind: "transaction" | "transfer"; id: string }>(
    sql`select kind, id from (${keys}) as k order by date desc, created_at desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
  );
  const transactionIds = keyRows.filter((row) => row.kind === "transaction").map((row) => row.id);
  const transferIds = keyRows.filter((row) => row.kind === "transfer").map((row) => row.id);

  const rows =
    transactionIds.length === 0
      ? []
      : await db
          .select({
            id: transactions.id,
            type: transactions.type,
            amount: transactions.amount,
            date: transactions.date,
            note: transactions.note,
            recurring: sql<boolean>`${transactions.recurringDate} is not null`,
            accountId: accounts.id,
            accountName: accounts.name,
            accountOwnerId: accounts.userId,
            ownerId: transactions.userId,
            categoryId: categories.id,
            categoryName: categories.name,
            categoryColor: categories.color,
            categoryIcon: categories.icon,
          })
          .from(transactions)
          .innerJoin(accounts, eq(accounts.id, transactions.accountId))
          .leftJoin(categories, eq(categories.id, transactions.categoryId))
          .where(and(inArray(transactions.id, transactionIds), inArray(transactions.userId, userIds)));

  const fromAccount = alias(accounts, "from_account");
  const toAccount = alias(accounts, "to_account");
  const transferRows =
    transferIds.length === 0
      ? []
      : await db
          .select({
            id: transfers.id,
            amount: transfers.amount,
            date: transfers.date,
            note: transfers.note,
            recurring: sql<boolean>`${transfers.recurringDate} is not null`,
            fromId: fromAccount.id,
            fromName: fromAccount.name,
            fromOwnerId: fromAccount.userId,
            toId: toAccount.id,
            toName: toAccount.name,
            toOwnerId: toAccount.userId,
            ownerId: transfers.userId,
          })
          .from(transfers)
          .innerJoin(fromAccount, eq(fromAccount.id, transfers.fromAccountId))
          .innerJoin(toAccount, eq(toAccount.id, transfers.toAccountId))
          .where(and(inArray(transfers.id, transferIds), transferVisible));

  const tagRows =
    rows.length === 0
      ? []
      : await db
          .select({ transactionId: transactionTags.transactionId, id: tags.id, name: tags.name })
          .from(transactionTags)
          .innerJoin(tags, eq(tags.id, transactionTags.tagId))
          .where(
            and(
              inArray(
                transactionTags.transactionId,
                rows.map((row) => row.id),
              ),
              inArray(tags.userId, userIds),
            ),
          )
          .orderBy(tags.name);

  const tagsByTransaction = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of tagRows) {
    const list = tagsByTransaction.get(row.transactionId) ?? [];
    list.push({ id: row.id, name: row.name });
    tagsByTransaction.set(row.transactionId, list);
  }

  const owner = (id: string) => ({ id, name: scope.names.get(id) ?? "Former member", isMine: id === scope.userId });
  const accountRef = (id: string, name: string, ownerId: string): AccountRef => ({
    id,
    name,
    ownerName: scope.names.get(ownerId) ?? "Former member",
    isMine: ownerId === scope.userId,
  });
  const byId = new Map<string, TransactionItem>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      type: row.type,
      amount: row.amount,
      date: row.date,
      note: row.note,
      recurring: row.recurring,
      account: accountRef(row.accountId, row.accountName, row.accountOwnerId),
      transferTo: null,
      category: row.categoryId
        ? { id: row.categoryId, name: row.categoryName!, color: row.categoryColor!, icon: row.categoryIcon! }
        : null,
      tags: tagsByTransaction.get(row.id) ?? [],
      owner: owner(row.ownerId),
    });
  }
  for (const row of transferRows) {
    byId.set(row.id, {
      id: row.id,
      type: "transfer",
      amount: row.amount,
      date: row.date,
      note: row.note,
      recurring: row.recurring,
      account: accountRef(row.fromId, row.fromName, row.fromOwnerId),
      transferTo: accountRef(row.toId, row.toName, row.toOwnerId),
      category: null,
      tags: [],
      owner: owner(row.ownerId),
    });
  }
  const items = keyRows.flatMap((key) => byId.get(key.id) ?? []);

  return { items, total, page, pageCount };
}
