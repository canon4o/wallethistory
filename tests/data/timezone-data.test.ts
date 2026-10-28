import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { budgets, recurringRules, transactions } from "@/db/schema";
import { listBudgets } from "@/lib/data/budgets";
import { getDashboard } from "@/lib/data/dashboard";
import { materializeDueRules } from "@/lib/recurring/materialize";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

// 2026-09-30 22:00 UTC: still September 30 in UTC and in Los Angeles, already October 1 in Sofia
// (UTC+3) and on Kiritimati (UTC+14).
const NOW = new Date("2026-09-30T22:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("'today' follows the user's timezone", () => {
  const users = useTestUsers();
  let sofia: { id: string };
  let utc: { id: string };
  let kiritimati: { id: string };

  beforeAll(async () => {
    sofia = await users.create({ label: "sofia", timezone: "Europe/Sofia" });
    utc = await users.create({ label: "utc" });
    kiritimati = await users.create({ label: "kiri", timezone: "Pacific/Kiritimati" });
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  });
  afterEach(async () => {
    const ids = [sofia.id, utc.id, kiritimati.id];
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, ids));
    await getDb().delete(transactions).where(inArray(transactions.userId, ids));
    await getDb().delete(budgets).where(inArray(budgets.userId, ids));
  });
  afterAll(async () => {
    vi.useRealTimers();
    await users.cleanup();
  });

  async function spendAndBudget(userId: string, date: string) {
    const groceries = await categoryIdByName(userId, "Groceries");
    await getDb().insert(budgets).values({ userId, categoryId: groceries, amount: "100.00", period: "monthly" });
    await getDb()
      .insert(transactions)
      .values({ userId, accountId: await defaultAccountId(userId), categoryId: groceries, amount: "30.00", date, type: "expense" });
  }

  it("budgets use the month the user is in", async () => {
    // A purchase on October 1 counts for the current month only where it is already October.
    await spendAndBudget(sofia.id, "2026-10-01");
    await spendAndBudget(utc.id, "2026-10-01");

    await signInAs(sofia.id);
    const [inSofia] = await listBudgets();
    expect(inSofia.range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(inSofia.spent).toBe("30.00");

    await signInAs(utc.id);
    const [inUtc] = await listBudgets();
    expect(inUtc.range).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(inUtc.spent).toBe("0.00");
  });

  it("the dashboard covers the user's current month", async () => {
    await signInAs(sofia.id);
    expect((await getDashboard()).month).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    await signInAs(utc.id);
    expect((await getDashboard()).month).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });

  it("an explicit date still wins", async () => {
    await signInAs(sofia.id);
    expect((await getDashboard("2026-01-15")).month).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  it("recurring rules run on their owner's date, whoever opens the app", async () => {
    const rule = (userId: string) =>
      defaultAccountId(userId).then((accountId) =>
        getDb().insert(recurringRules).values({
          userId,
          kind: "expense",
          amount: "10.00",
          accountId,
          frequency: "monthly",
          intervalCount: 1,
          startDate: "2026-10-01",
          nextDueDate: "2026-10-01",
        }),
      );
    await Promise.all([rule(sofia.id), rule(utc.id), rule(kiritimati.id)]);

    // The same call, as if the UTC user opened the app: only owners whose date reached Oct 1 get entries.
    expect(await materializeDueRules([sofia.id, utc.id, kiritimati.id])).toEqual({ created: 2 });

    const created = (userId: string) =>
      getDb().select().from(transactions).where(eq(transactions.userId, userId)).orderBy(asc(transactions.date));
    expect((await created(sofia.id)).map((t) => t.date)).toEqual(["2026-10-01"]);
    expect((await created(kiritimati.id)).map((t) => t.date)).toEqual(["2026-10-01"]);
    expect(await created(utc.id)).toHaveLength(0);
  });
});
