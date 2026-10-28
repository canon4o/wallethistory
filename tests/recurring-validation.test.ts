import { describe, expect, it } from "vitest";
import { recurringRuleSchema, recurringStatusChangeSchema } from "@/lib/validation/recurring";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = {
  kind: "expense",
  amount: "12.5",
  accountId: id(1),
  categoryId: "",
  note: " rent ",
  frequency: "monthly",
  intervalCount: "1",
  startDate: "2026-01-31",
};

describe("recurring rule schema", () => {
  it("normalizes an expense rule", () => {
    const parsed = recurringRuleSchema.safeParse({ ...base, tagIds: [id(2), id(2)], endDate: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      kind: "expense",
      amount: "12.50",
      accountId: id(1),
      categoryId: null,
      tagIds: [id(2)],
      note: "rent",
      frequency: "monthly",
      intervalCount: 1,
      startDate: "2026-01-31",
      endDate: null,
    });
  });

  it("accepts a transfer rule without income/expense fields", () => {
    const parsed = recurringRuleSchema.safeParse({
      ...base,
      kind: "transfer",
      accountId: null,
      fromAccountId: id(1),
      toAccountId: id(2),
      note: null,
      endDate: "2027-01-31",
    });
    expect(parsed.data).toMatchObject({ kind: "transfer", fromAccountId: id(1), toAccountId: id(2), endDate: "2027-01-31" });
    expect(parsed.data).not.toHaveProperty("accountId");
  });

  it("requires the account that fits the kind", () => {
    const noAccount = recurringRuleSchema.safeParse({ ...base, accountId: undefined, note: null });
    expect(noAccount.error?.issues[0]).toMatchObject({ path: ["accountId"] });
    const noTransferAccounts = recurringRuleSchema.safeParse({ ...base, kind: "transfer", note: null });
    expect(noTransferAccounts.error?.issues.map((i) => i.path[0])).toEqual(["fromAccountId", "toAccountId"]);
    const same = recurringRuleSchema.safeParse({
      ...base,
      kind: "transfer",
      fromAccountId: id(1),
      toAccountId: id(1),
      note: null,
    });
    expect(same.error?.issues[0]).toMatchObject({ path: ["toAccountId"] });
  });

  it("rejects an end date before the start date and a bad interval", () => {
    expect(recurringRuleSchema.safeParse({ ...base, note: null, endDate: "2026-01-30" }).error?.issues[0]).toMatchObject({
      path: ["endDate"],
    });
    for (const intervalCount of ["0", "366", "1.5", "abc"]) {
      expect(recurringRuleSchema.safeParse({ ...base, note: null, intervalCount }).success).toBe(false);
    }
  });

  it("limits the status a user can set", () => {
    expect(recurringStatusChangeSchema.safeParse("paused").success).toBe(true);
    expect(recurringStatusChangeSchema.safeParse("ended").success).toBe(false);
  });
});
