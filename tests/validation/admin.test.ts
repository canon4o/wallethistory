import { describe, expect, it } from "vitest";
import {
  adminQuery,
  parseAdminLoginFilters,
  parseAdminUserFilters,
  parseOverviewRange,
} from "@/lib/validation/admin";

describe("admin search params", () => {
  it("parses user filters with defaults", () => {
    expect(parseAdminUserFilters({})).toEqual({ q: undefined, status: "all", page: 1 });
    expect(parseAdminUserFilters({ q: "  ann ", status: "blocked", page: "3" })).toEqual({
      q: "ann",
      status: "blocked",
      page: 3,
    });
  });

  it("ignores invalid values and takes the first of repeated params", () => {
    expect(parseAdminUserFilters({ status: "nope", page: "-2", q: "x".repeat(101) })).toEqual({
      q: undefined,
      status: "all",
      page: 1,
    });
    expect(parseAdminUserFilters({ status: ["admins", "blocked"] }).status).toBe("admins");
  });

  it("parses login filters", () => {
    const id = crypto.randomUUID();
    expect(parseAdminLoginFilters({ result: "failed", user: id, page: "2" })).toEqual({
      result: "failed",
      userId: id,
      page: 2,
    });
    expect(parseAdminLoginFilters({ result: "bad", user: "not-an-id" })).toEqual({
      result: "all",
      userId: undefined,
      page: 1,
    });
  });

  it("parses the overview range and falls back to 30 days", () => {
    expect(parseOverviewRange({ range: "7" })).toBe(7);
    expect(parseOverviewRange({ range: "90" })).toBe(90);
    expect(parseOverviewRange({ range: "15" })).toBe(30);
    expect(parseOverviewRange({})).toBe(30);
  });

  it("builds a query string without empty values, defaults, or page 1", () => {
    expect(adminQuery({ q: "ann", status: "all", page: 1 })).toBe("q=ann");
    expect(adminQuery({ status: "blocked", page: 2, user: undefined, empty: "" })).toBe("status=blocked&page=2");
    expect(adminQuery({})).toBe("");
  });
});
