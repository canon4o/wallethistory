import { describe, expect, it } from "vitest";
import { transferSchema } from "@/lib/validation/transfers";

const from = "11111111-1111-4111-8111-111111111111";
const to = "22222222-2222-4222-8222-222222222222";
const valid = { fromAccountId: from, toAccountId: to, amount: "10", date: "2026-03-04", note: null };

describe("transferSchema", () => {
  it("accepts a valid transfer and normalizes amount and note", () => {
    const parsed = transferSchema.parse({ ...valid, amount: "12.5", note: "  rent share " });
    expect(parsed).toMatchObject({ amount: "12.50", note: "rent share" });
    expect(transferSchema.parse({ ...valid, note: "  " }).note).toBeNull();
  });

  it("rejects the same account on both sides", () => {
    const result = transferSchema.safeParse({ ...valid, toAccountId: from });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["toAccountId"], message: "Choose two different accounts" });
  });

  it("rejects zero, negative and malformed amounts", () => {
    for (const amount of ["0", "-5", "abc", "1.234", ""]) {
      expect(transferSchema.safeParse({ ...valid, amount }).success).toBe(false);
    }
  });

  it("rejects bad ids, dates and long notes", () => {
    expect(transferSchema.safeParse({ ...valid, fromAccountId: "nope" }).success).toBe(false);
    expect(transferSchema.safeParse({ ...valid, toAccountId: "" }).success).toBe(false);
    expect(transferSchema.safeParse({ ...valid, date: "2026-13-40" }).success).toBe(false);
    expect(transferSchema.safeParse({ ...valid, note: "x".repeat(501) }).success).toBe(false);
  });
});
