import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql as sqlTemplate } from "drizzle-orm";
import { getDb } from "@/db";
import { budgets, householdMembers, households, tags, transactionTags, transactions } from "@/db/schema";
import { listFilterCategories, listCategories } from "@/lib/data/categories";
import { listFilterTags } from "@/lib/data/tags";
import { parseCategoryKey } from "@/lib/data/transactions";
import { listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { listBudgets, listHouseholdBudgets } from "@/lib/data/budgets";
import { getDashboard } from "@/lib/data/dashboard";
import { listTransactions } from "@/lib/data/transactions";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const none = { page: 1 };
const today = "2026-10-15";

describe.skipIf(!TEST_DATABASE_URL)("household read access", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let cat: { id: string };
  let outsider: { id: string };
  let householdId: string;

  async function addExpense(userId: string, amount: string, note: string) {
    await getDb().insert(transactions).values({
      userId,
      type: "expense",
      amount,
      date: "2026-10-10",
      accountId: await defaultAccountId(userId),
      categoryId: await categoryIdByName(userId, "Groceries"),
      note,
    });
  }

  beforeAll(async () => {
    ann = await users.create({ label: "ann", name: "Ann" });
    ben = await users.create({ label: "ben", name: "Ben" });
    cat = await users.create({ label: "cat", name: "Cat" });
    outsider = await users.create({ label: "out", name: "Outsider" });
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: ann.id },
      { householdId, userId: ben.id },
      { householdId, userId: cat.id },
    ]);
    await addExpense(ann.id, "10.00", "ann groceries");
    await addExpense(ben.id, "20.00", "ben groceries");
    await addExpense(cat.id, "40.00", "cat groceries");
    await addExpense(outsider.id, "80.00", "outsider groceries");
    await getDb().insert(budgets).values([
      { userId: ann.id, categoryId: await categoryIdByName(ann.id, "Groceries"), period: "monthly", amount: "100.00" },
      { userId: ben.id, categoryId: await categoryIdByName(ben.id, "Groceries"), period: "monthly", amount: "50.00" },
    ]);
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  describe("transactions", () => {
    it("lists the whole household, newest first, with owners, and never outsiders", async () => {
      await signInAs(ann.id);
      const { items, total } = await listTransactions(none);
      expect(total).toBe(3);
      expect(items.map((i) => [i.note, i.owner.name, i.owner.isMine]).sort()).toEqual([
        ["ann groceries", "Ann", true],
        ["ben groceries", "Ben", false],
        ["cat groceries", "Cat", false],
      ]);
    });

    it("filters by person and ignores people outside the household", async () => {
      await signInAs(ann.id);
      expect((await listTransactions({ page: 1, personId: ben.id })).items.map((i) => i.note)).toEqual(["ben groceries"]);
      expect((await listTransactions({ page: 1, personId: ann.id })).items.map((i) => i.note)).toEqual(["ann groceries"]);
      // A stranger's id falls back to the household instead of exposing (or hiding) anything.
      const stranger = await listTransactions({ page: 1, personId: outsider.id });
      expect(stranger.items.map((i) => i.note)).not.toContain("outsider groceries");
      expect(stranger.total).toBe(3);
    });

    it("shows an outsider only their own transactions", async () => {
      await signInAs(outsider.id);
      expect((await listTransactions(none)).items.map((i) => i.note)).toEqual(["outsider groceries"]);
    });

    it("filters by a partner's account", async () => {
      await signInAs(ann.id);
      const benAccount = await defaultAccountId(ben.id);
      expect((await listTransactions({ page: 1, accountId: benAccount })).items.map((i) => i.note)).toEqual(["ben groceries"]);
    });
  });

  describe("accounts", () => {
    it("keeps listAccounts to my own accounts", async () => {
      await signInAs(ann.id);
      expect((await listAccounts()).map((a) => a.id)).toEqual([await defaultAccountId(ann.id)]);
    });

    it("lists the other members' accounts with owner and computed balance", async () => {
      await signInAs(ann.id);
      const shared = await listHouseholdAccounts();
      expect(shared.map((a) => a.ownerName).sort()).toEqual(["Ben", "Cat"]);
      expect(shared.find((a) => a.ownerName === "Ben")).toMatchObject({ balance: "-20.00" });
      expect(shared.find((a) => a.ownerName === "Cat")).toMatchObject({ balance: "-40.00" });
      expect(await listHouseholdAccounts([ben.id])).toHaveLength(1);
      expect(await listHouseholdAccounts([outsider.id])).toEqual([]);
    });

    it("is empty without a household", async () => {
      await signInAs(outsider.id);
      expect(await listHouseholdAccounts()).toEqual([]);
    });
  });

  describe("budgets", () => {
    it("keeps listBudgets personal and lists partners' budgets read-only with their own spending", async () => {
      await signInAs(ann.id);
      expect((await listBudgets(today)).map((b) => b.spent)).toEqual(["10.00"]);
      const shared = await listHouseholdBudgets(today);
      expect(shared).toHaveLength(1);
      expect(shared[0]).toMatchObject({ ownerName: "Ben", spent: "20.00", amount: "50.00", remaining: "30.00" });
      expect(shared[0].category.name).toBe("Groceries");
    });

    it("is empty without a household", async () => {
      await signInAs(outsider.id);
      expect(await listHouseholdBudgets(today)).toEqual([]);
    });
  });

  describe("dashboard", () => {
    it("adds up the household by default", async () => {
      await signInAs(ann.id);
      const data = await getDashboard(today);
      expect(data).toMatchObject({ scope: "household", inHousehold: true, expense: "70.00", totalBalance: "-70.00" });
      expect(data.accounts.map((a) => a.ownerName).sort()).toEqual(["Ben", "Cat", undefined]);
      expect(data.recent).toHaveLength(3);
      // Budgets stay personal.
      expect(data.budgets.map((b) => b.spent)).toEqual(["10.00"]);
    });

    it("shows only my own numbers in the Mine view", async () => {
      await signInAs(ann.id);
      const data = await getDashboard(today, "mine");
      expect(data).toMatchObject({ scope: "mine", inHousehold: true, expense: "10.00", totalBalance: "-10.00" });
      expect(data.accounts).toHaveLength(1);
      expect(data.recent.map((r) => r.note)).toEqual(["ann groceries"]);
    });

    it("ignores the household view when I am not in a household", async () => {
      await signInAs(outsider.id);
      expect(await getDashboard(today, "household")).toMatchObject({ scope: "mine", inHousehold: false, expense: "80.00" });
    });

    it("stops showing a member's data right after they leave", async () => {
      await getDb().delete(householdMembers).where(inArray(householdMembers.userId, [cat.id]));
      await signInAs(ann.id);
      expect((await getDashboard(today)).expense).toBe("30.00");
      expect((await listTransactions(none)).items.map((i) => i.note).sort()).toEqual(["ann groceries", "ben groceries"]);
      await getDb().insert(householdMembers).values({ householdId, userId: cat.id });
    });
  });

  describe("category and tag filters", () => {
    it("match by name and type across the household, case-insensitively", async () => {
      await signInAs(ann.id);
      const notes = async (category: string) =>
        (await listTransactions({ page: 1, category })).items.map((i) => i.note).sort();
      expect(await notes("expense:Groceries")).toEqual(["ann groceries", "ben groceries", "cat groceries"]);
      expect(await notes("expense:groceries")).toEqual(["ann groceries", "ben groceries", "cat groceries"]);
      expect(await notes("income:Groceries")).toEqual([]);
      expect(await notes("expense:Nope")).toEqual([]);
      expect(await notes("nonsense")).toEqual([]);
      // Combines with the Person filter.
      expect((await listTransactions({ page: 1, category: "expense:Groceries", personId: ben.id })).items).toHaveLength(1);
    });

    it("still accept an old category id, only inside the household", async () => {
      await signInAs(ann.id);
      const benGroceries = await categoryIdByName(ben.id, "Groceries");
      expect((await listTransactions({ page: 1, category: benGroceries })).total).toBe(3);
      const outsiderGroceries = await categoryIdByName(outsider.id, "Groceries");
      expect((await listTransactions({ page: 1, category: outsiderGroceries })).total).toBe(0);
    });

    it("match tags by name across the household and accept old tag ids", async () => {
      await signInAs(ann.id);
      const [annTag] = await getDb().insert(tags).values({ userId: ann.id, name: "Trip" }).returning({ id: tags.id });
      const [benTag] = await getDb().insert(tags).values({ userId: ben.id, name: "trip" }).returning({ id: tags.id });
      const [outsiderTag] = await getDb().insert(tags).values({ userId: outsider.id, name: "trip" }).returning({ id: tags.id });
      const tagTransaction = async (userId: string, tagId: string) => {
        const [row] = await getDb().select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, userId));
        await getDb().insert(transactionTags).values({ transactionId: row.id, tagId });
      };
      await tagTransaction(ann.id, annTag.id);
      await tagTransaction(ben.id, benTag.id);
      await tagTransaction(outsider.id, outsiderTag.id);
      expect((await listTransactions({ page: 1, tag: "TRIP" })).items.map((i) => i.note).sort()).toEqual(["ann groceries", "ben groceries"]);
      expect((await listTransactions({ page: 1, tag: benTag.id })).total).toBe(2);
      expect((await listTransactions({ page: 1, tag: outsiderTag.id })).total).toBe(0);
      expect((await listTransactions({ page: 1, tag: "unknown" })).total).toBe(0);
      expect(await listFilterTags()).toEqual(["Trip"]);
    });

    it("list each category name once, grouped by type", async () => {
      await signInAs(ann.id);
      const options = await listFilterCategories();
      const own = await listCategories();
      expect(options).toHaveLength(own.length);
      expect(options.filter((o) => o.name === "Groceries")).toEqual([
        expect.objectContaining({ key: "expense:Groceries", type: "expense" }),
      ]);
    });

    it("include a category only a partner has", async () => {
      await getDb().execute(
        sqlTemplate`insert into categories (user_id, type, name, color, icon) values (${ben.id}, 'expense', 'Pets', '#1aaaba', 'heart-pulse')`,
      );
      await signInAs(ann.id);
      expect((await listFilterCategories()).map((o) => o.key)).toContain("expense:Pets");
      await signInAs(outsider.id);
      expect((await listFilterCategories()).map((o) => o.key)).not.toContain("expense:Pets");
    });
  });

  it("parses category keys", () => {
    expect(parseCategoryKey("expense:Shopping")).toEqual({ type: "expense", name: "Shopping" });
    expect(parseCategoryKey("income:A:B")).toEqual({ type: "income", name: "A:B" });
    expect(parseCategoryKey("transfer:X")).toBeNull();
    expect(parseCategoryKey("expense:")).toBeNull();
    expect(parseCategoryKey("noseparator")).toBeNull();
  });
});
