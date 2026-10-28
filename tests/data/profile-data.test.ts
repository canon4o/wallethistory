import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { listTags } from "@/lib/data/tags";
import { getDb } from "@/db";
import { accounts, tags } from "@/db/schema";
import { cookieJar } from "../helpers/cookie-jar";
import { categoryIdByName, defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("profile data functions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    await getDb().insert(tags).values([
      { userId: alice.id, name: "alice-trip" },
      { userId: bob.id, name: "bob-work" },
    ]);
    await getDb().insert(accounts).values({ userId: bob.id, name: "Bob Bank", type: "bank", color: "#337ab7", icon: "landmark", initialBalance: "500.00" });
  });
  afterAll(users.cleanup);

  it("every list function requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(listAccounts())).toBe("/login");
    expect(await redirectTarget(listCategories())).toBe("/login");
    expect(await redirectTarget(listTags())).toBe("/login");
  });

  it("lists only the signed-in user's rows", async () => {
    await signInAs(alice.id);
    expect((await listAccounts()).map((a) => a.name)).toEqual(["Cash"]);
    expect((await listTags()).map((t) => t.name)).toEqual(["alice-trip"]);
    const categories = await listCategories();
    expect(categories).toHaveLength(16);

    await signInAs(bob.id);
    expect((await listAccounts()).map((a) => a.name).sort()).toEqual(["Bob Bank", "Cash"]);
    expect((await listTags()).map((t) => t.name)).toEqual(["bob-work"]);
    expect(cookieJar.has("wh_session")).toBe(true);
  });

  it("lists categories by type then name with their icon and color", async () => {
    await signInAs(alice.id);
    const categories = await listCategories();
    // Each type forms one contiguous block (the UI groups by type itself).
    const types = categories.map((c) => c.type);
    expect(types.filter((t, i) => i > 0 && t !== types[i - 1])).toHaveLength(1);
    const salary = categories.find((c) => c.name === "Salary");
    expect(salary).toMatchObject({ type: "income", icon: "banknote", color: "#9cca56" });
    const names = categories.filter((c) => c.type === "expense").map((c) => c.name);
    expect(names[0]).toBe("Education");
    expect(names.at(-1)).toBe("Utilities");
  });

  it("computes the balance as initial balance + income - expense, never mixing users", async () => {
    await signInAs(alice.id);
    const cash = await defaultAccountId(alice.id);
    await getDb().insert(accounts).values({ userId: alice.id, name: "Savings", type: "savings", color: "#1aaaba", icon: "piggy-bank", initialBalance: "100.00" });

    // Unused account: balance equals the initial balance.
    let list = await listAccounts();
    expect(list.find((a) => a.name === "Savings")).toMatchObject({ initialBalance: "100.00", balance: "100.00" });
    expect(list.find((a) => a.name === "Cash")?.balance).toBe("0.00");

    await insertTransaction({ userId: alice.id, accountId: cash, type: "income", amount: "1000.50", categoryId: await categoryIdByName(alice.id, "Salary") });
    await insertTransaction({ userId: alice.id, accountId: cash, type: "expense", amount: "20.25", categoryId: await categoryIdByName(alice.id, "Rent") });
    await insertTransaction({ userId: alice.id, accountId: cash, type: "expense", amount: "0.10" });
    // Another user's activity must not change Alice's numbers.
    await insertTransaction({ userId: bob.id, accountId: await defaultAccountId(bob.id), type: "income", amount: "9999.00" });

    list = await listAccounts();
    expect(list.find((a) => a.name === "Cash")?.balance).toBe("980.15");
    expect(list.find((a) => a.name === "Savings")?.balance).toBe("100.00");
  });

  it("allows a negative balance when expenses exceed income", async () => {
    const carol = await users.create({ label: "carol" });
    await signInAs(carol.id);
    await insertTransaction({ userId: carol.id, accountId: await defaultAccountId(carol.id), type: "expense", amount: "42.00" });
    expect((await listAccounts())[0].balance).toBe("-42.00");
  });
});
