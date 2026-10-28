"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, tags, transactionTags, transactions } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { clearDismissalsForSpendingChanges } from "./budget-alert-reset";
import { idSchema } from "@/lib/validation/common";
import { transactionSchema, type TransactionData } from "@/lib/validation/transactions";
import {
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

/** Everything a transaction change can affect. */
async function revalidate() {
  for (const path of ["/transactions", "/profile/accounts", "/dashboard", "/budgets"]) {
    await revalidatePath(path);
  }
}

/**
 * Checks that every id sent by the client belongs to the current user, and that the category
 * matches the transaction type. The database enforces the same rules with triggers; checking
 * here gives friendly field errors.
 */
async function verifyReferences(userId: string, data: TransactionData): Promise<ActionFailure | null> {
  const db = getDb();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, userId)));
  if (!account) return fieldFailure("accountId", msg("Choose one of your accounts"));

  if (data.categoryId) {
    const [category] = await db
      .select({ type: categories.type })
      .from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)));
    if (!category) return fieldFailure("categoryId", msg("Choose one of your categories"));
    if (category.type !== data.type) {
      return fieldFailure(
        "categoryId",
        data.type === "income"
          ? msg("Choose an income category for an income transaction")
          : msg("Choose an expense category for an expense transaction"),
      );
    }
  }

  if (data.tagIds.length > 0) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, data.tagIds), eq(tags.userId, userId)));
    if (owned.length !== data.tagIds.length) return fieldFailure("tagIds", msg("Choose from your own tags"));
  }

  return null;
}

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { tagIds, ...values } = parsed.data;

  return guarded(async () => {
    const invalid = await verifyReferences(user.id, parsed.data);
    if (invalid) return invalid;

    await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(transactions)
        .values({ ...values, userId: user.id })
        .returning({ id: transactions.id });
      if (tagIds.length > 0) {
        await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId: created.id, tagId })));
      }
    });
    await revalidate();
    return { ok: true };
  });
}

export async function updateTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { tagIds, ...values } = parsed.data;

  return guarded(async () => {
    const invalid = await verifyReferences(user.id, parsed.data);
    if (invalid) return invalid;

    const found = await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select({ categoryId: transactions.categoryId, date: transactions.date })
        .from(transactions)
        .where(and(eq(transactions.id, parsedId.data), eq(transactions.userId, user.id)));
      const updated = await tx
        .update(transactions)
        .set(values)
        .where(and(eq(transactions.id, parsedId.data), eq(transactions.userId, user.id)))
        .returning({ id: transactions.id });
      if (updated.length === 0) return false;

      // Spending changed in the old and the new period and category: dismissed alerts there may apply again.
      await clearDismissalsForSpendingChanges(
        user.id,
        [{ categoryId: before?.categoryId, date: before?.date ?? values.date }, { categoryId: values.categoryId, date: values.date }],
        tx,
      );
      await tx.delete(transactionTags).where(eq(transactionTags.transactionId, parsedId.data));
      if (tagIds.length > 0) {
        await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId: parsedId.data, tagId })));
      }
      return true;
    });
    if (!found) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}

export async function deleteTransaction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const deleted = await getDb()
      .delete(transactions)
      .where(and(eq(transactions.id, parsedId.data), eq(transactions.userId, user.id)))
      .returning({ id: transactions.id, categoryId: transactions.categoryId, date: transactions.date });
    if (deleted.length === 0) return notFoundFailure();
    await clearDismissalsForSpendingChanges(user.id, [deleted[0]]);
    await revalidate();
    return { ok: true };
  });
}
