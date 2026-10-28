"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { goalContributions, goals, recurringRules } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getHouseholdScope } from "@/lib/data/household";
import { idSchema } from "@/lib/validation/common";
import { goalSchema } from "@/lib/validation/goals";
import {
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

const SHARE_NEEDS_HOUSEHOLD = msg("Join a household to share goals");
const DEADLINE_IN_PAST = msg("Deadline must be today or later");

/** Goals show up on their own pages, the dashboard panel and (through recurring rules) the recurring list. */
async function revalidate(goalId?: string) {
  await revalidatePath("/goals");
  if (goalId) await revalidatePath(`/goals/${goalId}`);
  for (const path of ["/dashboard", "/profile/recurring"]) await revalidatePath(path);
}

export async function createGoal(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  if (parsed.data.deadline && parsed.data.deadline < todayISO(user.timezone)) {
    return fieldFailure("deadline", DEADLINE_IN_PAST);
  }

  return guarded(async () => {
    if (parsed.data.shared) {
      const scope = await getHouseholdScope(user.id, user.name);
      if (scope.memberIds.length < 2) return fieldFailure("shared", SHARE_NEEDS_HOUSEHOLD);
    }
    await getDb().insert(goals).values({ ...parsed.data, userId: user.id });
    await revalidate();
    return { ok: true };
  });
}

/** Only the owner edits a goal. The deadline is only checked when it changes, so old goals stay editable. */
export async function updateGoal(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const db = getDb();
    const [goal] = await db
      .select({ deadline: goals.deadline, shared: goals.shared })
      .from(goals)
      .where(and(eq(goals.id, parsedId.data), eq(goals.userId, user.id), isNull(goals.deletedAt)));
    if (!goal) return notFoundFailure();
    if (parsed.data.deadline && parsed.data.deadline !== goal.deadline && parsed.data.deadline < todayISO(user.timezone)) {
      return fieldFailure("deadline", DEADLINE_IN_PAST);
    }
    if (parsed.data.shared && !goal.shared) {
      const scope = await getHouseholdScope(user.id, user.name);
      if (scope.memberIds.length < 2) return fieldFailure("shared", SHARE_NEEDS_HOUSEHOLD);
    }
    await db
      .update(goals)
      .set(parsed.data)
      .where(and(eq(goals.id, parsedId.data), eq(goals.userId, user.id)));
    await revalidate(parsedId.data);
    return { ok: true };
  });
}

/**
 * Archiving keeps the goal and its money; the goal just stops taking deposits. Recurring rules
 * that pay into it are paused. Restoring does not resume them: the user does that from Recurring.
 */
export async function setGoalArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const found = await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(goals)
        .set({ archivedAt: archived ? new Date() : null })
        .where(and(eq(goals.id, parsedId.data), eq(goals.userId, user.id), isNull(goals.deletedAt)))
        .returning({ id: goals.id });
      if (updated.length === 0) return false;
      if (archived) {
        await tx
          .update(recurringRules)
          .set({ status: "paused", pausedReason: "goal_closed" })
          .where(and(eq(recurringRules.goalId, parsedId.data), eq(recurringRules.status, "active")));
      }
      return true;
    });
    if (!found) return notFoundFailure();
    await revalidate(parsedId.data);
    return { ok: true };
  });
}

const MONEY_LEFT = msg("This goal still has money in it. Take the money out first, or archive the goal.");

/**
 * A goal with money in it cannot be deleted. An empty goal that never had any contribution is
 * really deleted; one that did is only hidden (soft delete), so the history stays intact.
 */
export async function deleteGoal(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const result = await getDb().transaction(async (tx): Promise<ActionResult> => {
      // Locking the goal makes a deposit that lands at the same moment wait (see migration 0013).
      const locked = await tx.execute<{ id: string }>(
        sql`select id from goals where id = ${parsedId.data} and user_id = ${user.id} and deleted_at is null for update`,
      );
      if (locked.length === 0) return notFoundFailure();

      const [totals] = await tx
        .select({
          rows: sql<number>`count(*)::int`,
          saved: sql<string>`coalesce(sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end), 0)::numeric(14,2)::text`,
        })
        .from(goalContributions)
        .where(eq(goalContributions.goalId, parsedId.data));
      if (Number(totals.saved) > 0) return { ok: false, error: MONEY_LEFT };

      if (totals.rows === 0) {
        await tx.delete(goals).where(eq(goals.id, parsedId.data));
      } else {
        await tx.update(goals).set({ deletedAt: new Date() }).where(eq(goals.id, parsedId.data));
        await tx
          .update(recurringRules)
          .set({ status: "ended", pausedReason: null })
          .where(eq(recurringRules.goalId, parsedId.data));
      }
      return { ok: true };
    });
    if (result.ok) await revalidate(parsedId.data);
    return result;
  });
}

/** Brings a soft-deleted goal back. Its recurring rules stay ended; the user can set up new ones. */
export async function restoreGoal(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const restored = await getDb()
      .update(goals)
      .set({ deletedAt: null })
      .where(and(eq(goals.id, parsedId.data), eq(goals.userId, user.id), isNotNull(goals.deletedAt)))
      .returning({ id: goals.id });
    if (restored.length === 0) return notFoundFailure();
    await revalidate(parsedId.data);
    return { ok: true };
  });
}

const STILL_LINKED = msg("This goal still has movements on an existing account. Restore it, or delete those accounts first.");

/**
 * Removes a soft-deleted goal permanently. Allowed only when none of its movements points at an existing
 * account: deleting those rows would change the history of account balances.
 */
export async function deleteGoalPermanently(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const result = await getDb().transaction(async (tx): Promise<ActionResult> => {
      const locked = await tx.execute<{ id: string }>(
        sql`select id from goals where id = ${parsedId.data} and user_id = ${user.id} and deleted_at is not null for update`,
      );
      if (locked.length === 0) return notFoundFailure();
      const [linked] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(goalContributions)
        .where(and(eq(goalContributions.goalId, parsedId.data), isNotNull(goalContributions.accountId)));
      if (linked.n > 0) return { ok: false, error: STILL_LINKED };
      await tx.delete(goals).where(eq(goals.id, parsedId.data));
      return { ok: true };
    });
    if (result.ok) await revalidate(parsedId.data);
    return result;
  });
}
