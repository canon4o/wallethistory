import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";

/** The user's oldest account: the "Cash" account created by the signup trigger. */
export async function defaultAccountId(userId: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt))
    .limit(1);
  return row.id;
}

export async function categoryIdByName(userId: string, name: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, name)));
  return row.id;
}

export async function insertTransaction(input: {
  userId: string;
  accountId: string;
  type: "income" | "expense";
  amount: string;
  categoryId?: string;
  date?: string;
}) {
  await getDb()
    .insert(transactions)
    .values({ date: "2026-01-15", ...input });
}
