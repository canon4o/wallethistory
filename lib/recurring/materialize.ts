import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  goalContributions,
  goals,
  recurringRuleTags,
  recurringRules,
  transactionTags,
  transactions,
  transfers,
  users,
} from "@/db/schema";
import { todayISO } from "@/lib/budget-period";
import { bumpUsers, shouldRunCatchUp } from "@/lib/cache";
import { getHouseholdScope } from "@/lib/data/household";
import { toTimezone } from "@/lib/timezones";
import { occurrencesUntil, staleCutoff } from "./dates";

/** The timezone whose calendar date is ahead of every other (UTC+14). */
const LATEST_TIMEZONE = "Pacific/Kiritimati";

type Rule = typeof recurringRules.$inferSelect;
type Database = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Creates the transactions and transfers that recurring rules owe up to today. There is no
 * scheduler: this runs when a user logs in or opens the app, for the rules of everyone in their
 * household, and creates every missed occurrence with its original date.
 *
 * Safe to call at any time and from several requests at once: a rule that another request is
 * already working on is skipped, and a unique key on (rule, occurrence date) stops duplicates.
 *
 * `ownerIds` must come from the server (the signed-in user's household), never from the client.
 * Rows are always created under the rule owner's own user id.
 */
export async function materializeDueRules(
  ownerIds: string[],
  options: { today?: string } = {},
): Promise<{ created: number }> {
  const db = getDb();
  // "Today" is the rule owner's today, so a household member opening the app in another timezone
  // does not shift anyone else's rules. The query uses the furthest-ahead date on Earth as an
  // upper bound; each rule is then checked against its owner's own date.
  const upperBound = options.today ?? todayISO(LATEST_TIMEZONE);
  const due = await db
    .select({ id: recurringRules.id, timezone: users.timezone })
    .from(recurringRules)
    .innerJoin(users, eq(users.id, recurringRules.userId))
    .where(
      and(
        inArray(recurringRules.userId, ownerIds),
        eq(recurringRules.status, "active"),
        lte(recurringRules.nextDueDate, upperBound),
      ),
    );

  let created = 0;
  for (const { id, timezone } of due) {
    const today = options.today ?? todayISO(toTimezone(timezone));
    try {
      created += await db.transaction((tx) => materializeRule(tx, id, ownerIds, today));
    } catch (error) {
      // One broken rule must not stop the others or the page from loading.
      console.error("Recurring rule failed:", id, error);
    }
  }
  // Rows were written for these people, so anything cached about them is out of date.
  if (created > 0) await bumpUsers(ownerIds);
  return { created };
}

/** The signed-in user and their household. Never throws: a failure must not break the page. */
export async function materializeForUser(
  user: { id: string; name: string },
  options: { force?: boolean } = {},
): Promise<void> {
  try {
    // Checked at most every few minutes per user when a cache is configured (see lib/cache).
    if (!options.force && !(await shouldRunCatchUp(user.id))) return;
    const scope = await getHouseholdScope(user.id, user.name);
    await materializeDueRules(scope.memberIds);
  } catch (error) {
    console.error("Recurring catch-up failed:", error);
  }
}

async function materializeRule(tx: Tx, ruleId: string, householdIds: string[], today: string): Promise<number> {
  // Lock the row; a concurrent request that already holds it is doing this work.
  const [rule] = await tx
    .select()
    .from(recurringRules)
    .where(
      and(eq(recurringRules.id, ruleId), eq(recurringRules.status, "active"), lte(recurringRules.nextDueDate, today)),
    )
    .for("update", { skipLocked: true });
  if (!rule) return 0;

  if (rule.nextDueDate < staleCutoff(today)) {
    await pause(tx, rule, "stale");
    return 0;
  }
  if (rule.kind === "transfer" && !(await destinationAllowed(tx, rule, householdIds))) {
    await pause(tx, rule, "household_link");
    return 0;
  }

  let goalSaved = { target: "0", saved: "0" };
  if (rule.kind === "goal") {
    const state = await goalState(tx, rule, householdIds);
    if (state.problem) {
      await pause(tx, rule, state.problem);
      return 0;
    }
    goalSaved = state;
  }

  const until = rule.endDate && rule.endDate < today ? rule.endDate : today;
  const { dates, next } = occurrencesUntil(rule, rule.nextDueDate, until);
  if (rule.kind === "goal") return depositIntoGoal(tx, rule, dates, next, goalSaved);
  const created = rule.kind === "transfer" ? await insertTransfers(tx, rule, dates) : await insertTransactions(tx, rule, dates);

  const ended = rule.endDate !== null && next > rule.endDate;
  await tx
    .update(recurringRules)
    .set({ nextDueDate: next, status: ended ? "ended" : "active" })
    .where(eq(recurringRules.id, rule.id));
  return created;
}

async function pause(tx: Tx, rule: Rule, reason: "stale" | "household_link" | "goal_closed") {
  await tx
    .update(recurringRules)
    .set({ status: "paused", pausedReason: reason })
    .where(eq(recurringRules.id, rule.id));
}

/**
 * A goal rule keeps paying only while the goal is open (not archived or deleted) and still usable
 * by the rule owner: their own, or shared by someone in their household.
 */
async function goalState(
  tx: Tx,
  rule: Rule,
  householdIds: string[],
): Promise<{ problem: "goal_closed" | "household_link" | null; target: string; saved: string }> {
  const empty = { target: "0", saved: "0" };
  if (!rule.goalId) return { problem: "goal_closed", ...empty };
  const [goal] = await tx
    .select({
      userId: goals.userId,
      shared: goals.shared,
      archivedAt: goals.archivedAt,
      deletedAt: goals.deletedAt,
      target: goals.targetAmount,
      // Single-table selects render columns unqualified, so the outer id is spelled out to stay unambiguous.
      saved: sql<string>`coalesce((select sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)
        from ${goalContributions} where ${goalContributions.goalId} = "goals"."id"), 0)::numeric(14,2)::text`,
    })
    .from(goals)
    .where(eq(goals.id, rule.goalId));
  if (!goal || goal.deletedAt || goal.archivedAt) return { problem: "goal_closed", ...empty };
  const usable = goal.userId === rule.userId || (goal.shared && householdIds.includes(goal.userId));
  return { problem: usable ? null : "household_link", target: goal.target, saved: goal.saved };
}

/**
 * Deposits the due occurrences, one by one, and ends the rule as soon as the goal reaches its
 * target (the last deposit may overshoot it). Nothing is added to a goal that is already complete.
 */
async function depositIntoGoal(
  tx: Tx,
  rule: Rule,
  dates: string[],
  next: string,
  { target, saved }: { target: string; saved: string },
): Promise<number> {
  let savedCents = Math.round(Number(saved) * 100);
  const targetCents = Math.round(Number(target) * 100);
  const amountCents = Math.round(Number(rule.amount) * 100);

  const due: string[] = [];
  let reached = savedCents >= targetCents;
  for (const date of dates) {
    if (reached) break;
    due.push(date);
    savedCents += amountCents;
    reached = savedCents >= targetCents;
  }

  let created = 0;
  if (due.length > 0 && rule.accountId && rule.goalId) {
    const rows = await tx
      .insert(goalContributions)
      .values(
        due.map((date) => ({
          goalId: rule.goalId as string,
          userId: rule.userId,
          accountId: rule.accountId as string,
          type: "deposit" as const,
          amount: rule.amount,
          date,
          note: rule.note,
          recurringRuleId: rule.id,
          recurringDate: date,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: goalContributions.id });
    created = rows.length;
  }

  const ended = reached || (rule.endDate !== null && next > rule.endDate);
  await tx
    .update(recurringRules)
    .set({ nextDueDate: next, status: ended ? "ended" : "active" })
    .where(eq(recurringRules.id, rule.id));
  return created;
}

/** A transfer rule may only target the owner's own accounts or a household member's. */
async function destinationAllowed(tx: Tx, rule: Rule, householdIds: string[]): Promise<boolean> {
  if (!rule.toAccountId) return false;
  const [target] = await tx.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.id, rule.toAccountId));
  return Boolean(target) && (target.userId === rule.userId || householdIds.includes(target.userId));
}

async function insertTransfers(tx: Tx, rule: Rule, dates: string[]): Promise<number> {
  if (dates.length === 0 || !rule.fromAccountId || !rule.toAccountId) return 0;
  const rows = await tx
    .insert(transfers)
    .values(
      dates.map((date) => ({
        userId: rule.userId,
        fromAccountId: rule.fromAccountId as string,
        toAccountId: rule.toAccountId as string,
        amount: rule.amount,
        date,
        note: rule.note,
        recurringRuleId: rule.id,
        recurringDate: date,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transfers.id });
  return rows.length;
}

async function insertTransactions(tx: Tx, rule: Rule, dates: string[]): Promise<number> {
  if (dates.length === 0 || !rule.accountId || rule.kind === "transfer") return 0;
  const rows = await tx
    .insert(transactions)
    .values(
      dates.map((date) => ({
        userId: rule.userId,
        type: rule.kind as "income" | "expense",
        amount: rule.amount,
        date,
        accountId: rule.accountId as string,
        categoryId: rule.categoryId,
        note: rule.note,
        recurringRuleId: rule.id,
        recurringDate: date,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id });

  const tags = await tx
    .select({ tagId: recurringRuleTags.tagId })
    .from(recurringRuleTags)
    .where(eq(recurringRuleTags.ruleId, rule.id));
  if (rows.length > 0 && tags.length > 0) {
    await tx
      .insert(transactionTags)
      .values(rows.flatMap((row) => tags.map((tag) => ({ transactionId: row.id, tagId: tag.tagId }))));
  }
  return rows.length;
}
