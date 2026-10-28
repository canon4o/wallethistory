"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, goals, recurringRuleTags, recurringRules, tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getHouseholdScope } from "@/lib/data/household";
import { firstOccurrenceOnOrAfter } from "@/lib/recurring/dates";
import { materializeForUser } from "@/lib/recurring/materialize";
import { idSchema } from "@/lib/validation/common";
import {
  recurringRuleSchema,
  recurringStatusChangeSchema,
  type RecurringRuleData,
} from "@/lib/validation/recurring";
import {
  failure,
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

type CurrentUser = { id: string; name: string };

/** Everything a rule or the entries it creates can affect. */
async function revalidate() {
  for (const path of ["/transactions", "/profile/accounts", "/profile/recurring", "/dashboard", "/budgets", "/reports", "/goals"]) {
    await revalidatePath(path);
  }
}

/**
 * Checks that every id sent by the client belongs to the current user (a transfer's destination
 * may also belong to a household member). The database enforces the same rules with triggers;
 * checking here gives friendly field errors.
 */
async function verifyReferences(user: CurrentUser, data: RecurringRuleData): Promise<ActionFailure | null> {
  const db = getDb();

  if (data.kind === "transfer") {
    const scope = await getHouseholdScope(user.id, user.name);
    const found = await db
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

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, user.id)));
  if (!account) return fieldFailure("accountId", msg("Choose one of your accounts"));

  if (data.kind === "goal") {
    const scope = await getHouseholdScope(user.id, user.name);
    const [goal] = await db
      .select({ userId: goals.userId, shared: goals.shared, archivedAt: goals.archivedAt })
      .from(goals)
      .where(and(eq(goals.id, data.goalId), isNull(goals.deletedAt)));
    const usable = goal && (goal.userId === user.id || (goal.shared && scope.memberIds.includes(goal.userId)));
    if (!usable) return fieldFailure("goalId", msg("Choose one of your goals or a goal shared with you"));
    if (goal.archivedAt) return fieldFailure("goalId", msg("This goal is archived"));
    return null;
  }

  if (data.categoryId) {
    const [category] = await db
      .select({ type: categories.type })
      .from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.userId, user.id)));
    if (!category) return fieldFailure("categoryId", msg("Choose one of your categories"));
    if (category.type !== data.kind) {
      return fieldFailure(
        "categoryId",
        data.kind === "income" ? msg("Choose an income category for an income rule") : msg("Choose an expense category for an expense rule"),
      );
    }
  }

  if (data.tagIds.length > 0) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, data.tagIds), eq(tags.userId, user.id)));
    if (owned.length !== data.tagIds.length) return fieldFailure("tagIds", msg("Choose from your own tags"));
  }

  return null;
}

/** The columns a rule's data sets; the ones that do not apply to its kind are cleared. */
function ruleColumns(data: RecurringRuleData) {
  const common = {
    kind: data.kind,
    amount: data.amount,
    note: data.note,
    frequency: data.frequency,
    intervalCount: data.intervalCount,
    startDate: data.startDate,
    endDate: data.endDate,
  };
  if (data.kind === "transfer") {
    return { ...common, accountId: null, categoryId: null, goalId: null, fromAccountId: data.fromAccountId, toAccountId: data.toAccountId };
  }
  if (data.kind === "goal") {
    return { ...common, accountId: data.accountId, categoryId: null, goalId: data.goalId, fromAccountId: null, toAccountId: null };
  }
  return { ...common, accountId: data.accountId, categoryId: data.categoryId, goalId: null, fromAccountId: null, toAccountId: null };
}

export async function createRecurringRule(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recurringRuleSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const result = await guarded(async (): Promise<ActionResult> => {
    const invalid = await verifyReferences(user, parsed.data);
    if (invalid) return invalid;

    const tagIds = parsed.data.kind === "income" || parsed.data.kind === "expense" ? parsed.data.tagIds : [];
    await getDb().transaction(async (tx) => {
      const [rule] = await tx
        .insert(recurringRules)
        .values({ ...ruleColumns(parsed.data), userId: user.id, nextDueDate: parsed.data.startDate })
        .returning({ id: recurringRules.id });
      if (tagIds.length > 0) {
        await tx.insert(recurringRuleTags).values(tagIds.map((tagId) => ({ ruleId: rule.id, tagId })));
      }
    });
    return { ok: true };
  });

  // Catch up right away so entries that are already due show up without another page load.
  if (result.ok) await materializeForUser(user, { force: true });
  await revalidate();
  return result;
}

export async function updateRecurringRule(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = recurringRuleSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  // Entries that are already due are created under the old terms before anything changes.
  await materializeForUser(user, { force: true });

  const result = await guarded(async (): Promise<ActionResult> => {
    const invalid = await verifyReferences(user, parsed.data);
    if (invalid) return invalid;

    const db = getDb();
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.id, parsedId.data), eq(recurringRules.userId, user.id)));
    if (!rule) return notFoundFailure();

    // Changing the schedule only affects entries from today on; past ones stay as they are.
    const scheduleChanged =
      rule.frequency !== parsed.data.frequency ||
      rule.intervalCount !== parsed.data.intervalCount ||
      rule.startDate !== parsed.data.startDate;
    const nextDueDate = scheduleChanged ? firstOccurrenceOnOrAfter(parsed.data, todayISO(user.timezone)) : rule.nextDueDate;
    const finished = parsed.data.endDate !== null && nextDueDate > parsed.data.endDate;
    const status = rule.status === "paused" ? "paused" : finished ? "ended" : "active";

    const tagIds = parsed.data.kind === "income" || parsed.data.kind === "expense" ? parsed.data.tagIds : [];
    await db.transaction(async (tx) => {
      await tx
        .update(recurringRules)
        .set({ ...ruleColumns(parsed.data), nextDueDate, status })
        .where(eq(recurringRules.id, rule.id));
      await tx.delete(recurringRuleTags).where(eq(recurringRuleTags.ruleId, rule.id));
      if (tagIds.length > 0) {
        await tx.insert(recurringRuleTags).values(tagIds.map((tagId) => ({ ruleId: rule.id, tagId })));
      }
    });
    return { ok: true };
  });

  if (result.ok) await materializeForUser(user, { force: true });
  await revalidate();
  return result;
}

/** Pause an active rule, or resume a paused one. Resuming never backfills the paused period. */
export async function setRecurringRuleStatus(id: unknown, status: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsedStatus = recurringStatusChangeSchema.safeParse(status);
  if (!parsedStatus.success) return failure(msg("Choose active or paused"));

  const result = await guarded(async (): Promise<ActionResult> => {
    const db = getDb();
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.id, parsedId.data), eq(recurringRules.userId, user.id)));
    if (!rule) return notFoundFailure();
    if (rule.status === "ended") {
      return { ok: false, error: msg("This rule has ended. Change its end date to use it again.") };
    }
    if (rule.status === parsedStatus.data) return { ok: true };

    if (parsedStatus.data === "paused") {
      await db
        .update(recurringRules)
        .set({ status: "paused", pausedReason: "manual" })
        .where(eq(recurringRules.id, rule.id));
      return { ok: true };
    }

    const nextDueDate = firstOccurrenceOnOrAfter(rule, todayISO(user.timezone));
    const finished = rule.endDate !== null && nextDueDate > rule.endDate;
    await db
      .update(recurringRules)
      .set({ nextDueDate, status: finished ? "ended" : "active", pausedReason: null })
      .where(eq(recurringRules.id, rule.id));
    return { ok: true };
  });

  if (result.ok) await materializeForUser(user, { force: true });
  await revalidate();
  return result;
}

/** Deletes the rule only. Entries it already created stay in the history. */
export async function deleteRecurringRule(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const deleted = await getDb()
      .delete(recurringRules)
      .where(and(eq(recurringRules.id, parsedId.data), eq(recurringRules.userId, user.id)))
      .returning({ id: recurringRules.id });
    if (deleted.length === 0) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}
