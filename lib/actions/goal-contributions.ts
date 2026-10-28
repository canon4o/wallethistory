"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isCheckViolation } from "@/db/errors";
import { accounts, goalContributions, goals } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/currencies";
import { getHouseholdScope } from "@/lib/data/household";
import { formatMoney } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import {
  goalContributionSchema,
  goalContributionUpdateSchema,
  type GoalContributionData,
} from "@/lib/validation/goals";
import {
  failure,
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg, msgWith } from "@/lib/i18n/translate";

type CurrentUser = { id: string; name: string; currency: CurrencyCode };

const NOT_ALLOWED = msg("This goal cannot take that change any more.");
const BREAKS_WITHDRAWALS = msg("That would leave less in the goal than you already took out.");

/** Contributions change account balances, the goal and the dashboard. */
async function revalidate(goalId: string) {
  for (const path of ["/goals", `/goals/${goalId}`, "/profile/accounts", "/dashboard", "/reports"]) {
    await revalidatePath(path);
  }
}

async function myAccountExists(userId: string, accountId: string): Promise<boolean> {
  const [account] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  return Boolean(account);
}

/** What the user put into a goal and has not taken out, in cents. */
async function netContributed(userId: string, goalId: string): Promise<number> {
  const [row] = await getDb()
    .select({
      net: sql<string>`coalesce(sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end), 0)::numeric(14,2)::text`,
    })
    .from(goalContributions)
    .where(and(eq(goalContributions.goalId, goalId), eq(goalContributions.userId, userId)));
  return Math.round(Number(row.net) * 100);
}

/**
 * Checks the ids sent by the client. The account must be the user's own. A deposit needs a goal the
 * user may use (their own, or a shared one in their household) that is not archived; a withdrawal
 * only needs enough of the user's own money in it. The database enforces the same with triggers;
 * checking here gives friendly field errors.
 */
async function verify(user: CurrentUser, data: GoalContributionData): Promise<ActionFailure | null> {
  if (!(await myAccountExists(user.id, data.accountId))) return fieldFailure("accountId", msg("Choose one of your accounts"));

  const scope = await getHouseholdScope(user.id, user.name);
  const [goal] = await getDb()
    .select({ userId: goals.userId, shared: goals.shared, archivedAt: goals.archivedAt })
    .from(goals)
    .where(and(eq(goals.id, data.goalId), isNull(goals.deletedAt)));
  if (!goal) return notFoundFailure(msg("This goal no longer exists."));

  if (data.type === "deposit") {
    const usable = goal.userId === user.id || (goal.shared && scope.memberIds.includes(goal.userId));
    if (!usable) return notFoundFailure(msg("This goal no longer exists."));
    if (goal.archivedAt) return failure(msg("This goal is archived. Restore it to add money."));
    return null;
  }

  const mine = await netContributed(user.id, data.goalId);
  if (Math.round(Number(data.amount) * 100) > mine) {
    return fieldFailure(
      "amount",
      mine > 0
        ? msgWith("You can take out at most {amount}, what you put into this goal", { amount: formatMoney(mine / 100, user.currency) })
        : msg("You have no money in this goal"),
    );
  }
  return null;
}

export async function addGoalContribution(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = goalContributionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const invalid = await verify(user, parsed.data);
    if (invalid) return invalid;
    try {
      await getDb().insert(goalContributions).values({ ...parsed.data, userId: user.id });
    } catch (error) {
      if (isCheckViolation(error)) return { ok: false, error: NOT_ALLOWED };
      throw error;
    }
    await revalidate(parsed.data.goalId);
    return { ok: true };
  });
}

/** Changes the amount, account, date or note of one of my own contributions. The goal and the direction stay. */
export async function updateGoalContribution(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = goalContributionUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    if (!(await myAccountExists(user.id, parsed.data.accountId))) {
      return fieldFailure("accountId", msg("Choose one of your accounts"));
    }
    try {
      const updated = await getDb()
        .update(goalContributions)
        .set(parsed.data)
        .where(
          and(
            eq(goalContributions.id, parsedId.data),
            eq(goalContributions.userId, user.id),
            inArray(
              goalContributions.goalId,
              getDb().select({ id: goals.id }).from(goals).where(isNull(goals.deletedAt)),
            ),
          ),
        )
        .returning({ goalId: goalContributions.goalId });
      if (updated.length === 0) return notFoundFailure();
      await revalidate(updated[0].goalId);
    } catch (error) {
      if (isCheckViolation(error)) return { ok: false, error: BREAKS_WITHDRAWALS };
      throw error;
    }
    return { ok: true };
  });
}

export async function deleteGoalContribution(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    try {
      const deleted = await getDb()
        .delete(goalContributions)
        .where(and(eq(goalContributions.id, parsedId.data), eq(goalContributions.userId, user.id)))
        .returning({ goalId: goalContributions.goalId });
      if (deleted.length === 0) return notFoundFailure();
      await revalidate(deleted[0].goalId);
    } catch (error) {
      if (isCheckViolation(error)) return { ok: false, error: BREAKS_WITHDRAWALS };
      throw error;
    }
    return { ok: true };
  });
}
