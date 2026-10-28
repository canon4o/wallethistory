import { translate } from "@/lib/i18n/translate";
import { describe, expect, it } from "vitest";
import { budgetSchema } from "@/lib/validation/budgets";

const id = "6f1c2d6e-7b0a-4a52-9d6e-0f7a3c1b2d4e";

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), translate("en", i.message)]));
}

describe("budgetSchema", () => {
  const valid = { categoryId: id, amount: "250", period: "weekly" };

  it("normalizes the amount to two decimals", () => {
    expect(budgetSchema.parse(valid)).toEqual({ ...valid, amount: "250.00" });
    expect(budgetSchema.parse({ ...valid, amount: " 99.9 ", period: "monthly" })).toMatchObject({ amount: "99.90", period: "monthly" });
  });

  it("requires a positive amount", () => {
    for (const bad of ["", "0", "0.00", "-5", "abc", "1.234"]) {
      expect(errors(budgetSchema.safeParse({ ...valid, amount: bad })).amount, bad).toBeTruthy();
    }
  });

  it("only allows weekly or monthly", () => {
    expect(errors(budgetSchema.safeParse({ ...valid, period: "yearly" })).period).toBe("Choose weekly or monthly");
    expect(budgetSchema.safeParse({ ...valid, period: undefined }).success).toBe(false);
  });

  it("requires a category id", () => {
    expect(errors(budgetSchema.safeParse({ ...valid, categoryId: "" })).categoryId).toBe("Choose an expense category");
    expect(budgetSchema.safeParse({ ...valid, categoryId: "nope" }).success).toBe(false);
  });
});
