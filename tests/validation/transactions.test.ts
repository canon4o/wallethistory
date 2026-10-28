import { translate } from "@/lib/i18n/translate";
import { describe, expect, it } from "vitest";
import { isoDate } from "@/lib/validation/dates";
import { nonNegativeMoney, positiveMoney } from "@/lib/validation/money";
import {
  filtersToSearchParams,
  activeFilterCount,
  hasActiveFilters,
  parseTransactionFilters,
  transactionSchema,
} from "@/lib/validation/transactions";

const id1 = "6f1c2d6e-7b0a-4a52-9d6e-0f7a3c1b2d4e";
const id2 = "0b8d9c34-5a1e-4f3b-8c2d-7e6f5a4b3c21";

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), translate("en", i.message)]));
}

describe("money", () => {
  it("normalizes to two decimals", () => {
    expect(positiveMoney.parse("12")).toBe("12.00");
    expect(positiveMoney.parse(" 12.5 ")).toBe("12.50");
    expect(positiveMoney.parse("0.01")).toBe("0.01");
    expect(positiveMoney.parse("999999999999.99")).toBe("999999999999.99");
    expect(nonNegativeMoney.parse("0")).toBe("0.00");
  });

  it("positive money rejects zero, negatives, and malformed text", () => {
    expect(positiveMoney.safeParse("0").success).toBe(false);
    expect(positiveMoney.safeParse("0.00").success).toBe(false);
    expect(errors(positiveMoney.safeParse("0") as never)[""]).toMatch(/greater than 0/);
    for (const bad of ["", "-1", "abc", "1.234", "1e3", ".5", "1000000000000"]) {
      expect(positiveMoney.safeParse(bad).success, bad).toBe(false);
      expect(nonNegativeMoney.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("isoDate", () => {
  it("accepts real calendar dates only", () => {
    for (const ok of ["2026-01-31", "2024-02-29", "1999-12-31"]) expect(isoDate.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-1", "26-01-01", "", "today", "2026-01-01T00:00"]) {
      expect(isoDate.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("transactionSchema", () => {
  const valid = {
    type: "expense",
    amount: "12.5",
    date: "2026-03-04",
    accountId: id1,
    categoryId: id2,
    tagIds: [id1],
    note: " lunch ",
  };

  it("parses and normalizes a valid transaction", () => {
    expect(transactionSchema.parse(valid)).toEqual({ ...valid, amount: "12.50", note: "lunch" });
  });

  it("treats an empty category and an empty note as none, and tags as optional", () => {
    const parsed = transactionSchema.parse({ ...valid, categoryId: "", note: "  ", tagIds: undefined });
    expect(parsed).toMatchObject({ categoryId: null, note: null, tagIds: [] });
  });

  it("parses its own output (the form sends normalized values to the server action)", () => {
    for (const input of [
      valid,
      { ...valid, categoryId: "", note: "", tagIds: [] },
      { ...valid, categoryId: "", note: "   " },
    ]) {
      const once = transactionSchema.parse(input);
      expect(transactionSchema.parse(once)).toEqual(once);
    }
    expect(transactionSchema.parse({ ...valid, categoryId: null, note: null })).toMatchObject({ categoryId: null, note: null });
  });

  it("removes duplicate tags", () => {
    expect(transactionSchema.parse({ ...valid, tagIds: [id1, id1, id2] }).tagIds).toEqual([id1, id2]);
  });

  it("requires type, positive amount, valid date and an account", () => {
    expect(errors(transactionSchema.safeParse({ ...valid, type: "transfer" })).type).toBeTruthy();
    expect(errors(transactionSchema.safeParse({ ...valid, amount: "0" })).amount).toBeTruthy();
    expect(errors(transactionSchema.safeParse({ ...valid, amount: "" })).amount).toBeTruthy();
    expect(errors(transactionSchema.safeParse({ ...valid, date: "2026-02-30" })).date).toBeTruthy();
    expect(errors(transactionSchema.safeParse({ ...valid, accountId: "" })).accountId).toBe("Choose an account");
  });

  it("rejects malformed category and tag ids and overlong notes", () => {
    expect(transactionSchema.safeParse({ ...valid, categoryId: "nope" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...valid, tagIds: ["nope"] }).success).toBe(false);
    expect(errors(transactionSchema.safeParse({ ...valid, note: "x".repeat(501) })).note).toMatch(/at most 500/);
    expect(transactionSchema.safeParse({ ...valid, note: "x".repeat(500) }).success).toBe(true);
  });

  it("limits the number of tags", () => {
    const many = Array.from({ length: 21 }, () => crypto.randomUUID());
    expect(errors(transactionSchema.safeParse({ ...valid, tagIds: many })).tagIds).toMatch(/at most 20/);
  });
});

describe("transaction filters (URL search params)", () => {
  it("defaults to no filters on page 1", () => {
    expect(parseTransactionFilters({})).toEqual({ page: 1 });
    expect(hasActiveFilters(parseTransactionFilters({}))).toBe(false);
  });

  it("reads every filter", () => {
    const filters = parseTransactionFilters({
      from: "2026-01-01",
      to: "2026-01-31",
      type: "income",
      account: id1,
      category: id2,
      tag: id1,
      q: "  rent ",
      page: "3",
    });
    expect(filters).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      type: "income",
      accountId: id1,
      category: id2,
      tag: id1,
      q: "rent",
      page: 3,
    });
    expect(hasActiveFilters(filters)).toBe(true);
    expect(activeFilterCount(filters)).toBe(7);
    expect(activeFilterCount(parseTransactionFilters({ page: "2" }))).toBe(0);
  });

  it("keeps category and tag names as typed", () => {
    expect(parseTransactionFilters({ category: " expense:Shopping ", tag: "vacation" })).toMatchObject({
      category: "expense:Shopping",
      tag: "vacation",
    });
  });

  it("ignores empty and invalid values instead of failing", () => {
    const filters = parseTransactionFilters({
      from: "",
      to: "2026-02-30",
      type: "gift",
      account: "not-a-uuid",
      category: "x".repeat(151),
      tag: "   ",
      q: "x".repeat(101),
      page: "-4",
    });
    expect(filters).toEqual({ page: 1 });
    expect(parseTransactionFilters({ type: "transfer" }).type).toBe("transfer");
    expect(parseTransactionFilters({ page: "abc" }).page).toBe(1);
    expect(parseTransactionFilters({ page: "1.5" }).page).toBe(1);
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseTransactionFilters({ type: ["expense", "income"] }).type).toBe("expense");
    expect(parseTransactionFilters({ type: [] }).type).toBeUndefined();
  });

  it("round-trips through a query string and applies overrides", () => {
    const filters = parseTransactionFilters({ type: "expense", q: "a b&c", page: "2" });
    const params = filtersToSearchParams(filters);
    expect(params.get("q")).toBe("a b&c");
    expect(parseTransactionFilters(Object.fromEntries(params))).toEqual(filters);
    expect(filtersToSearchParams(filters, { page: 5 }).get("page")).toBe("5");
    expect(filtersToSearchParams(filters, { page: 1 }).has("page")).toBe(false);
    expect(filtersToSearchParams({ page: 1 }).toString()).toBe("");
  });
});
