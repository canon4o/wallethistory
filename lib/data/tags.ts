import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { requireHouseholdScope } from "./household";

export type TagItem = { id: string; name: string };

export async function listTags(): Promise<TagItem[]> {
  const user = await requireUser();
  return getDb()
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, user.id))
    .orderBy(asc(tags.name));
}

/** Tag names across the household, each once (case-insensitive), for the Transactions filter. */
export async function listFilterTags(): Promise<string[]> {
  const scope = await requireHouseholdScope();
  const rows = await getDb()
    .select({ name: tags.name })
    .from(tags)
    .where(inArray(tags.userId, scope.memberIds))
    .orderBy(asc(tags.name));
  const seen = new Map<string, string>();
  for (const { name } of rows) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  return [...seen.values()];
}
