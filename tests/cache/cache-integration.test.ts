import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTransaction } from "@/lib/actions/transactions";
import { setCacheAdapter, MemoryAdapter } from "@/lib/cache";
import { getDashboard } from "@/lib/data/dashboard";
import { getCashFlow } from "@/lib/data/reports";
import { listAccounts } from "@/lib/data/accounts";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const TODAY = "2026-10-08";

describe.skipIf(!TEST_DATABASE_URL)("cached reads", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let cash: string;
  let food: string;

  beforeAll(async () => {
    alice = await users.create({ name: "Alice" });
    cash = await defaultAccountId(alice.id);
    food = await categoryIdByName(alice.id, "Shopping");
  });
  afterEach(() => {
    signOut();
    setCacheAdapter(undefined);
  });
  afterAll(() => users.cleanup());

  const range = { start: "2026-10-01", end: "2026-10-31" };
  const spend = (amount: string) =>
    createTransaction({ type: "expense", amount, date: TODAY, accountId: cash, categoryId: food, tagIds: [], note: "" });

  it("shows a new transaction right away, in reports, dashboard and balances", async () => {
    setCacheAdapter(new MemoryAdapter());
    await signInAs(alice.id);

    expect((await getCashFlow({ range })).expense).toBe("0.00");
    expect((await getDashboard(TODAY)).totalBalance).toBe("0.00");

    expect(await spend("12.50")).toEqual({ ok: true });

    expect((await getCashFlow({ range })).expense).toBe("12.50");
    const dashboard = await getDashboard(TODAY);
    expect(dashboard.expense).toBe("12.50");
    expect(dashboard.totalBalance).toBe("-12.50");
    expect((await listAccounts())[0].balance).toBe("-12.50");
  });

  it("serves the stored value when nothing was written", async () => {
    const store = new MemoryAdapter();
    setCacheAdapter(store);
    await signInAs(alice.id);
    await getCashFlow({ range });
    const keys = store.size();
    await getCashFlow({ range });
    expect(store.size()).toBe(keys);
  });

  it("gives the same numbers with and without a cache", async () => {
    await signInAs(alice.id);
    setCacheAdapter(undefined);
    const plain = await getDashboard(TODAY);
    setCacheAdapter(new MemoryAdapter());
    const first = await getDashboard(TODAY);
    const second = await getDashboard(TODAY);
    expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(plain)));
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(plain)));
  });
});
