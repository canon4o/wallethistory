"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, transfers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getHouseholdScope } from "@/lib/data/household";
import { idSchema } from "@/lib/validation/common";
import { transferSchema, type TransferData } from "@/lib/validation/transfers";
import {
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

/** Everything a transfer can affect: lists, account balances and the dashboard. */
async function revalidate() {
  for (const path of ["/transactions", "/profile/accounts", "/dashboard"]) {
    await revalidatePath(path);
  }
}

/**
 * Checks the account ids sent by the client: the From account must be the user's own; the To
 * account may also belong to someone in the user's household. The database enforces the same
 * rule with a trigger; checking here gives friendly field errors.
 */
async function verifyAccounts(user: { id: string; name: string }, data: TransferData): Promise<ActionFailure | null> {
  const scope = await getHouseholdScope(user.id, user.name);
  const found = await getDb()
    .select({ id: accounts.id, userId: accounts.userId })
    .from(accounts)
    .where(inArray(accounts.id, [data.fromAccountId, data.toAccountId]));
  const owner = new Map(found.map((row) => [row.id, row.userId]));
  if (owner.get(data.fromAccountId) !== user.id) return fieldFailure("fromAccountId", msg("Choose one of your accounts"));
  const toOwner = owner.get(data.toAccountId);
  if (!toOwner || !scope.memberIds.includes(toOwner)) {
    return fieldFailure("toAccountId", msg("Choose one of your accounts or a household member's account"));
  }
  return null;
}

export async function createTransfer(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const invalid = await verifyAccounts(user, parsed.data);
    if (invalid) return invalid;

    await getDb().insert(transfers).values({ ...parsed.data, userId: user.id });
    await revalidate();
    return { ok: true };
  });
}

export async function updateTransfer(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const invalid = await verifyAccounts(user, parsed.data);
    if (invalid) return invalid;

    const updated = await getDb()
      .update(transfers)
      .set(parsed.data)
      .where(and(eq(transfers.id, parsedId.data), eq(transfers.userId, user.id)))
      .returning({ id: transfers.id });
    if (updated.length === 0) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}

export async function deleteTransfer(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const deleted = await getDb()
      .delete(transfers)
      .where(and(eq(transfers.id, parsedId.data), eq(transfers.userId, user.id)))
      .returning({ id: transfers.id });
    if (deleted.length === 0) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}
