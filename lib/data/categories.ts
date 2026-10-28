import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { requireHouseholdScope } from "./household";

export type CategoryItem = {
  id: string;
  type: "income" | "expense";
  name: string;
  color: string;
  icon: string;
};

export async function listCategories(): Promise<CategoryItem[]> {
  const user = await requireUser();
  return getDb()
    .select({
      id: categories.id,
      type: categories.type,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
    })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(asc(categories.type), asc(categories.name));
}

export type CategoryFilterOption = { key: string; type: "income" | "expense"; name: string; color: string; icon: string };

/**
 * One option per category name and type across the household (mine win when both have it), for
 * the Transactions filter. `key` is what the filter sends, for example `expense:Shopping`.
 */
export async function listFilterCategories(): Promise<CategoryFilterOption[]> {
  const scope = await requireHouseholdScope();
  const rows = await getDb()
    .select({
      userId: categories.userId,
      type: categories.type,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
    })
    .from(categories)
    .where(inArray(categories.userId, scope.memberIds))
    .orderBy(asc(categories.type), asc(categories.name));
  const byKey = new Map<string, CategoryFilterOption & { mine: boolean }>();
  for (const row of rows) {
    const key = `${row.type}:${row.name.toLowerCase()}`;
    const mine = row.userId === scope.userId;
    const existing = byKey.get(key);
    if (!existing || (mine && !existing.mine)) {
      byKey.set(key, { key: `${row.type}:${row.name}`, type: row.type, name: row.name, color: row.color, icon: row.icon, mine });
    }
  }
  return [...byKey.values()].map((option) => ({
    key: option.key,
    type: option.type,
    name: option.name,
    color: option.color,
    icon: option.icon,
  }));
}
