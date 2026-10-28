"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { isForeignKeyViolation } from "@/db/errors";
import { accounts } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { accountSchema } from "@/lib/validation/accounts";
import { idSchema } from "@/lib/validation/common";
import {
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

const IN_USE_ERROR =
  msg("This account has transactions. Delete or move them before deleting the account.");

/** Account names and balances are shown on transactions and the dashboard too. */
async function revalidate() {
  for (const path of ["/profile/accounts", "/transactions", "/dashboard"]) await revalidatePath(path);
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** At most one default per user: unset the others before another account becomes the default. */
async function clearDefault(tx: Tx, userId: string, exceptId?: string) {
  await tx
    .update(accounts)
    .set({ isDefault: false })
    .where(and(eq(accounts.userId, userId), eq(accounts.isDefault, true), exceptId ? ne(accounts.id, exceptId) : undefined));
}

export async function createAccount(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    await getDb().transaction(async (tx) => {
      if (parsed.data.isDefault) await clearDefault(tx, user.id);
      await tx.insert(accounts).values({ ...parsed.data, userId: user.id });
    });
    await revalidate();
    return { ok: true };
  });
}

export async function updateAccount(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const found = await getDb().transaction(async (tx) => {
      if (parsed.data.isDefault) await clearDefault(tx, user.id, parsedId.data);
      const updated = await tx
        .update(accounts)
        .set(parsed.data)
        .where(and(eq(accounts.id, parsedId.data), eq(accounts.userId, user.id)))
        .returning({ id: accounts.id });
      return updated.length > 0;
    });
    if (!found) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}

export async function deleteAccount(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    try {
      const deleted = await getDb()
        .delete(accounts)
        .where(and(eq(accounts.id, parsedId.data), eq(accounts.userId, user.id)))
        .returning({ id: accounts.id });
      if (deleted.length === 0) return notFoundFailure();
    } catch (error) {
      if (isForeignKeyViolation(error)) return { ok: false, error: IN_USE_ERROR };
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}
