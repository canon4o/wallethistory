import { describe, expect, it } from "vitest";
import { goalContributionSchema, goalContributionUpdateSchema, goalSchema } from "@/lib/validation/goals";
import { recurringRuleSchema } from "@/lib/validation/recurring";

const goal = { name: "  Travel to Japan ", targetAmount: "1500", deadline: "2027-05-01", color: "#ffd100", icon: "plane", shared: false, note: "" };
const id = "11111111-1111-4111-8111-111111111111";

describe("goalSchema", () => {
  it("trims, normalizes money and turns blanks into null", () => {
    expect(goalSchema.parse(goal)).toEqual({ ...goal, name: "Travel to Japan", targetAmount: "1500.00", note: null });
    expect(goalSchema.parse({ ...goal, deadline: "", note: "  trip " })).toMatchObject({ deadline: null, note: "trip" });
    expect(goalSchema.parse({ ...goal, deadline: null })).toMatchObject({ deadline: null });
    const { deadline, ...withoutDeadline } = goal;
    expect(deadline).toBeTruthy();
    expect(goalSchema.parse({ ...withoutDeadline, note: null })).toMatchObject({ deadline: null, note: null });
  });

  it.each([
    [{ name: "" }, "name"],
    [{ name: "x".repeat(81) }, "name"],
    [{ targetAmount: "0" }, "targetAmount"],
    [{ targetAmount: "-5" }, "targetAmount"],
    [{ targetAmount: "abc" }, "targetAmount"],
    [{ deadline: "2027-02-30" }, "deadline"],
    [{ color: "#123456" }, "color"],
    [{ icon: "rocket" }, "icon"],
    [{ shared: "yes" }, "shared"],
    [{ note: "x".repeat(501) }, "note"],
  ])("rejects %j", (change, field) => {
    const result = goalSchema.safeParse({ ...goal, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe(field);
  });
});

describe("goal contributions", () => {
  const input = { goalId: id, type: "deposit", accountId: id, amount: "12.5", date: "2026-10-11", note: "" };
  it("accepts a deposit and a withdrawal", () => {
    expect(goalContributionSchema.parse(input)).toMatchObject({ amount: "12.50", note: null });
    expect(goalContributionSchema.parse({ ...input, type: "withdrawal" }).type).toBe("withdrawal");
  });
  it.each([
    [{ type: "income" }, "type"],
    [{ amount: "0" }, "amount"],
    [{ goalId: "x" }, "goalId"],
    [{ accountId: "" }, "accountId"],
    [{ date: "11/10/2026" }, "date"],
  ])("rejects %j", (change, field) => {
    const result = goalContributionSchema.safeParse({ ...input, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe(field);
  });
  it("edits only account, amount, date and note", () => {
    expect(goalContributionUpdateSchema.parse({ ...input, amount: "1" })).toEqual({ accountId: id, amount: "1.00", date: "2026-10-11", note: null });
  });
});

describe("recurring goal rules", () => {
  const rule = { kind: "goal", amount: "50", accountId: id, goalId: id, note: "", frequency: "monthly", intervalCount: 1, startDate: "2026-10-11", endDate: "" };
  it("needs an account and a goal and drops other fields", () => {
    expect(recurringRuleSchema.parse({ ...rule, categoryId: id, tagIds: [id] })).toMatchObject({ kind: "goal", accountId: id, goalId: id, amount: "50.00" });
    expect(recurringRuleSchema.safeParse({ ...rule, goalId: "" }).error?.issues[0]).toMatchObject({ path: ["goalId"], message: "Choose a goal" });
    expect(recurringRuleSchema.safeParse({ ...rule, accountId: "" }).error?.issues[0].path).toEqual(["accountId"]);
  });
});
