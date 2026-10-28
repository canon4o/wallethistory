import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { GET } from "@/app/(app)/reports/export/route";
import { getReportFilterOptions } from "@/lib/data/reports";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const request = (query: string) => new Request(`http://localhost/reports/export?${query}`);

describe.skipIf(!TEST_DATABASE_URL)("report CSV export and filter options", () => {
  const users = useTestUsers();
  let alice: { id: string };

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    const accountId = await defaultAccountId(alice.id);
    const rows = [
      { type: "income" as const, amount: "100.00", date: "2026-10-01", category: "Salary", note: "=HYPERLINK()" },
      { type: "expense" as const, amount: "40.00", date: "2026-10-02", category: "Groceries", note: "weekly, big" },
      { type: "expense" as const, amount: "10.00", date: "2026-09-02", category: "Groceries", note: null },
    ];
    for (const row of rows) {
      await getDb()
        .insert(transactions)
        .values({ userId: alice.id, accountId, categoryId: await categoryIdByName(alice.id, row.category), ...row });
    }
  });
  afterAll(users.cleanup);

  it("needs a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(GET(request("report=cash-flow")))).toBe("/login");
  });

  it("rejects an unknown report", async () => {
    await signInAs(alice.id);
    expect((await GET(request("report=nope"))).status).toBe(404);
    expect((await GET(request(""))).status).toBe(404);
  });

  it("downloads cash flow as CSV", async () => {
    await signInAs(alice.id);
    const response = await GET(request("report=cash-flow&from=2026-09-01&to=2026-10-31"));
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="wallethistory-cash-flow-2026-09-01-to-2026-10-31.csv"',
    );
    expect(await response.text()).toBe(
      [
        "Month,Income,Expenses,Net",
        "2026-09,0.00,10.00,-10.00",
        "2026-10,100.00,40.00,60.00",
        "Total,100.00,50.00,50.00",
        "Savings rate (%),50.00",
        "",
      ].join("\r\n"),
    );
  });

  it("downloads spending by category, with the filters of the page", async () => {
    await signInAs(alice.id);
    const response = await GET(request("report=spending&from=2026-10-01&to=2026-10-31&type=expense"));
    expect(await response.text()).toBe(
      [
        "Category,Amount,Share of total (%),Previous period,Change (%)",
        "Groceries,40.00,100.00,10.00,300.00",
        "Total,40.00,100.00,10.00,300.00",
        "",
      ].join("\r\n"),
    );
    const filtered = await GET(request("report=spending&from=2026-10-01&to=2026-10-31&q=nothing-like-this"));
    expect(await filtered.text()).toBe("Category,Amount,Share of total (%),Previous period,Change (%)\r\nTotal,0.00,100.00,0.00,\r\n");
  });

  it("downloads a comparison and the balance", async () => {
    await signInAs(alice.id);
    const comparison = await GET(request("report=comparison&a=2026-10&b=2026-09"));
    expect(await comparison.text()).toBe(
      [
        ",Oct 2026,Sep 2026,Difference,Change (%)",
        "Income,100.00,0.00,100.00,",
        "Expenses,40.00,10.00,30.00,300.00",
        "Net,60.00,-10.00,70.00,",
        "",
        "Expense category,Oct 2026,Sep 2026,Difference,Change (%)",
        "Groceries,40.00,10.00,30.00,300.00",
        "",
      ].join("\r\n"),
    );
    const income = await GET(request("report=comparison&mode=year&a=2026&b=2025&type=income"));
    expect((await income.text()).split("\r\n")[5]).toBe("Income category,2026,2025,Difference,Change (%)");

    const balance = await GET(request("report=balance&from=2026-09-01&to=2026-10-31"));
    expect(await balance.text()).toBe(["Month,Cash,Total", "2026-09,-10.00,-10.00", "2026-10,50.00,50.00", ""].join("\r\n"));
  });

  it("offers accounts, categories, tags and people for the filter bar", async () => {
    await signInAs(alice.id);
    const options = await getReportFilterOptions();
    expect(options.accounts.map((account) => account.name)).toEqual(["Cash"]);
    expect(options.categories.length).toBeGreaterThan(0);
    expect(options.tags).toEqual([]);
    expect(options.people).toEqual([]);
  });
});
