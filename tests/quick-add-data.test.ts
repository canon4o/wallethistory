import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listHouseholdAccounts: vi.fn(),
  getPreferredAccountId: vi.fn(),
  listBudgets: vi.fn(),
  listCategories: vi.fn(),
  listGoals: vi.fn(),
  listTags: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/data/accounts", () => ({
  listAccounts: mocks.listAccounts,
  listHouseholdAccounts: mocks.listHouseholdAccounts,
  getPreferredAccountId: mocks.getPreferredAccountId,
}));
vi.mock("@/lib/data/budgets", () => ({ listBudgets: mocks.listBudgets }));
vi.mock("@/lib/data/categories", () => ({ listCategories: mocks.listCategories }));
vi.mock("@/lib/data/goals", () => ({ listGoals: mocks.listGoals }));
vi.mock("@/lib/data/tags", () => ({ listTags: mocks.listTags }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));

import { loadQuickAddOptions } from "@/lib/actions/quick-add";
import { getQuickAddOptions } from "@/lib/data/quick-add";

const cash = { id: "a1", name: "Cash", icon: "wallet", color: "#000000" };
const shared = { id: "a2", name: "Joint", icon: "wallet", color: "#000000", ownerName: "Sam" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "u1" });
  mocks.listAccounts.mockResolvedValue([cash]);
  mocks.listHouseholdAccounts.mockResolvedValue([shared]);
  mocks.listCategories.mockResolvedValue([
    { id: "c1", type: "expense", name: "Food", color: "#111111", icon: "utensils" },
    { id: "c2", type: "income", name: "Pay", color: "#222222", icon: "banknote" },
  ]);
  mocks.listTags.mockResolvedValue([{ id: "t1", name: "trip" }]);
  mocks.listBudgets.mockResolvedValue([
    { category: { id: "c1" }, remaining: "10.00" },
    { category: { id: "c1" }, remaining: "99.00" },
  ]);
  mocks.getPreferredAccountId.mockResolvedValue("a1");
  mocks.listGoals.mockResolvedValue([
    { id: "g1", name: "Trip", archived: false, saved: "50.00", targetAmount: "100.00" },
    { id: "g2", name: "Done", archived: false, saved: "100.00", targetAmount: "100.00" },
    { id: "g3", name: "Old", archived: true, saved: "0.00", targetAmount: "10.00" },
  ]);
});

describe("getQuickAddOptions", () => {
  it("combines the form data, with the tightest budget per category and open goals only", async () => {
    const options = await getQuickAddOptions();
    expect(options.accounts).toEqual([cash]);
    expect(options.transferTargets.map((account) => account.name)).toEqual(["Cash", "Sam · Joint"]);
    expect(options.categories.find((category) => category.id === "c1")?.budgetRemaining).toBe("10.00");
    expect(options.categories.find((category) => category.id === "c2")?.budgetRemaining).toBeUndefined();
    expect(options.defaultAccountId).toBe("a1");
    expect(options.goals).toEqual([
      { id: "g1", name: "Trip", completed: false },
      { id: "g2", name: "Done", completed: true },
    ]);
  });

  it("leaves the default account out when there is none", async () => {
    mocks.getPreferredAccountId.mockResolvedValue(null);
    expect((await getQuickAddOptions()).defaultAccountId).toBeUndefined();
  });
});

describe("loadQuickAddOptions", () => {
  it("requires a signed-in user and returns the options", async () => {
    const result = await loadQuickAddOptions();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("returns a failure instead of leaking an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listAccounts.mockRejectedValue(new Error("db down"));
    const result = await loadQuickAddOptions();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("db down");
  });
});
