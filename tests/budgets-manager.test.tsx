// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { optionNames, pickOption } from "./helpers/listbox";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { BudgetsManager } from "@/components/budgets/BudgetsManager";
import type { BudgetItem } from "@/lib/data/budgets";
import { renderServer, rerenderServer } from "./helpers/server-render";

const actions = vi.hoisted(() => ({
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
}));
vi.mock("@/lib/actions/budgets", () => actions);

const categories = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Groceries", icon: "shopping-cart", color: "#9cca56" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Rent", icon: "home", color: "#337ab7" },
];

const budget = (overrides: Partial<BudgetItem> = {}): BudgetItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  period: "monthly",
  amount: "400.00",
  category: { id: categories[0].id, name: "Groceries", color: "#9cca56", icon: "shopping-cart" },
  range: { start: "2026-10-01", end: "2026-10-31" },
  elapsedPercent: 50,
  projected: "200.00",
  planned: "0.00",
  history: [],
  spent: "100.00",
  remaining: "300.00",
  lastSpent: "120.00",
  forecast: "150.00",
  trend: "up",
  ...overrides,
});

beforeEach(() => {
  actions.createBudget.mockReset().mockResolvedValue({ ok: true });
  actions.updateBudget.mockReset().mockResolvedValue({ ok: true });
  actions.deleteBudget.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("BudgetsManager summary, pace, drill-down and filters", () => {
  const rent = budget({
    id: "22222222-2222-4222-8222-222222222222",
    category: { id: categories[1].id, name: "Rent", color: "#337ab7", icon: "home" },
    amount: "500.00",
    spent: "450.00",
    remaining: "50.00",
    projected: "600.00",
  });
  const over = budget({ id: "33333333-3333-4333-8333-333333333333", period: "weekly", amount: "50.00", spent: "60.00", remaining: "-10.00", projected: "120.00" });

  it("sums limits and spending per period and counts budgets near or over the limit", async () => {
    await renderServer(<BudgetsManager budgets={[budget(), rent, over]} categories={categories} />);
    const monthly = screen.getByRole("region", { name: "Monthly budgets summary" });
    expect(within(monthly).getByText("$900.00")).toBeInTheDocument();
    expect(within(monthly).getByText("$550.00")).toBeInTheDocument();
    expect(within(monthly).getByText("1 close to the limit")).toBeInTheDocument();
    const weekly = screen.getByRole("region", { name: "Weekly budgets summary" });
    expect(within(weekly).getByText("1 over the limit")).toBeInTheDocument();
  });

  it("says when the budgets are on track", async () => {
    await renderServer(<BudgetsManager budgets={[budget(), budget({ id: "44444444-4444-4444-8444-444444444444", period: "weekly" })]} categories={categories} />);
    expect(screen.getAllByText("All budgets are on track")).toHaveLength(2);
  });

  it("shows the pace, in red when it passes the limit, and hides it once over the limit", async () => {
    await renderServer(<BudgetsManager budgets={[budget(), rent, over]} categories={categories} />);
    expect(screen.getByText("At this pace you will spend $200.00 by the end of the period.")).toBeInTheDocument();
    expect(screen.getByText(/At this pace you will spend \$600.00, over the limit/)).toHaveClass("text-expense-text");
    expect(screen.getAllByText(/At this pace/)).toHaveLength(2);
  });

  it("marks the share of the period that has passed on the progress bar", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    const marker = screen.getByRole("img", { name: "Today: 50% of the period has passed" });
    expect(marker).toHaveStyle({ left: "50%" });
    expect(marker).toHaveAttribute("tabindex", "0");
  });

  it("links the spent amount to the category's transactions in the budget period", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    const link = screen.getByRole("link", { name: "View Groceries transactions" });
    expect(link).toHaveTextContent("$100.00");
    const url = new URL(link.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/transactions");
    expect(url.searchParams.get("category")).toBe("expense:Groceries");
    expect(url.searchParams.get("from")).toBe("2026-10-01");
    expect(url.searchParams.get("to")).toBe("2026-10-31");
  });

  it("filters by period and status, sorts, and explains an empty result", async () => {
    const user = userEvent.setup();
    await renderServer(<BudgetsManager budgets={[budget(), rent, over]} categories={categories} />);
    const names = () => screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(names()).toEqual(["Groceries", "Rent", "Groceries"]);

    await user.selectOptions(screen.getByLabelText("Sort by"), "name");
    expect(names()).toEqual(["Groceries", "Groceries", "Rent"]);
    await user.selectOptions(screen.getByLabelText("Sort by"), "remaining");
    expect(names()).toEqual(["Groceries", "Rent", "Groceries"]);

    await user.selectOptions(screen.getByLabelText("Period"), "weekly");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Period"), "all");
    await user.selectOptions(screen.getByLabelText("Status"), "near");
    expect(names()).toEqual(["Rent"]);
    await user.selectOptions(screen.getByLabelText("Status"), "over");
    await user.selectOptions(screen.getByLabelText("Period"), "monthly");
    expect(screen.getByText("No budgets match these filters.")).toBeInTheDocument();
  });
});

describe("BudgetsManager recurring and history", () => {
  const history = [
    ["2026-04-01", "2026-04-30", "300.00"],
    ["2026-05-01", "2026-05-31", "0.00"],
    ["2026-06-01", "2026-06-30", "450.00"],
    ["2026-07-01", "2026-07-31", "100.00"],
    ["2026-08-01", "2026-08-31", "200.00"],
    ["2026-09-01", "2026-09-30", "350.00"],
  ].map(([start, end, spent]) => ({ range: { start, end }, spent }));

  it("says how much recurring spending is still to come", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ planned: "50.00" })]} categories={categories} />);
    expect(screen.getByText("$50.00 of recurring expenses are still to come this period.")).toBeInTheDocument();
  });

  it("warns in red when the recurring expenses would exceed the limit", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ planned: "350.00" })]} categories={categories} />);
    expect(screen.getByText(/\$350.00 of recurring expenses are still to come, which would put you \$50.00 over the limit/)).toHaveClass(
      "text-expense-text",
    );
  });

  it("draws the recurring expenses after the spending on the progress bar", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ planned: "100.00" })]} categories={categories} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.firstElementChild).toHaveStyle({ width: "25%" });
    const planned = within(bar).getByTestId("progress-planned");
    expect(planned).toHaveStyle({ width: "25%" });
    expect(planned).toHaveClass("bg-primary");
    expect(planned.style.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("cuts the planned part of the progress bar at the limit and leaves it out once over", async () => {
    const { unmount } = await renderServer(<BudgetsManager budgets={[budget({ planned: "900.00" })]} categories={categories} />);
    expect(screen.getByTestId("progress-planned")).toHaveStyle({ width: "75%" });
    expect(screen.getByTestId("progress-planned")).toHaveClass("bg-expense");
    unmount();
    await renderServer(<BudgetsManager budgets={[budget({ planned: "50.00", spent: "450.00", remaining: "-50.00" })]} categories={categories} />);
    expect(screen.queryByTestId("progress-planned")).not.toBeInTheDocument();
  });

  it("does not warn about the future once the budget is already over", async () => {
    await renderServer(
      <BudgetsManager budgets={[budget({ planned: "50.00", spent: "450.00", remaining: "-50.00" })]} categories={categories} />,
    );
    expect(screen.getByText("$50.00 of recurring expenses are still to come this period.")).not.toHaveClass("text-expense-text");
  });

  it("shows nothing about recurring expenses when none are planned", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    expect(screen.queryByText(/recurring expenses/)).not.toBeInTheDocument();
  });

  it("shows the last six months as bars against the limit, over-limit months in red", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ history })]} categories={categories} />);
    expect(screen.getByText("Last 6 months")).toBeInTheDocument();
    expect(screen.getByText("June 2026: spent $450.00 of $400.00")).toBeInTheDocument();
    expect(screen.getByText("May 2026: spent $0.00 of $400.00")).toBeInTheDocument();
    const amounts = Array.from(document.querySelectorAll("details [aria-hidden] .truncate, details span.truncate.font-bold")).map((el) => el.textContent);
    expect(amounts).toEqual(["$300", "$0", "$450", "$100", "$200", "$350"]);
    const bars = document.querySelectorAll("details .rounded-t");
    expect(bars).toHaveLength(6);
    expect(bars[2]).toHaveClass("bg-expense");
    expect(bars[0]).toHaveClass("bg-primary");
    expect(bars[2]).toHaveStyle({ height: "100%" });
    expect(bars[0]).toHaveStyle({ height: `${(300 / 450) * 100}%` });
  });

  it("labels weekly history with the days of each week", async () => {
    const weeks = [
      ["2026-08-31", "2026-09-06"],
      ["2026-09-07", "2026-09-13"],
      ["2026-09-14", "2026-09-20"],
      ["2026-09-21", "2026-09-27"],
      ["2026-09-28", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
    ].map(([start, end]) => ({ range: { start, end }, spent: "10.00" }));
    await renderServer(
      <BudgetsManager
        budgets={[budget({ period: "weekly", range: { start: "2026-10-05", end: "2026-10-11" }, history: weeks })]}
        categories={categories}
      />,
    );
    expect(screen.getByText("Last 6 weeks")).toBeInTheDocument();
    expect(screen.getByText("Sep 7-13: spent $10.00 of $400.00")).toBeInTheDocument();
    expect(screen.getByText("Sep 28 - Oct 4: spent $10.00 of $400.00")).toBeInTheDocument();
  });
});

describe("BudgetsManager", () => {
  it("shows the period, limit, spent, remaining and a progress bar", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Groceries")).toBeInTheDocument();
    expect(within(item).getByText("Monthly")).toBeInTheDocument();
    expect(within(item).getByText("October 2026")).toBeInTheDocument();
    expect(within(item).getByText("$100.00")).toBeInTheDocument();
    expect(within(item).getByText("$400.00")).toBeInTheDocument();
    expect(within(item).getByText("Remaining")).toBeInTheDocument();
    expect(within(item).getByText("$300.00")).toBeInTheDocument();
    const bar = within(item).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar.firstElementChild).toHaveClass("bg-primary");
  });

  it("shows the Monday-Sunday range for weekly budgets", async () => {
    await renderServer(
      <BudgetsManager
        budgets={[budget({ period: "weekly", range: { start: "2026-10-05", end: "2026-10-11" } })]}
        categories={categories}
      />,
    );
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Oct 5, 2026 – Oct 11, 2026")).toBeInTheDocument();
  });

  it("turns red and says 'Over by' when the limit is exceeded", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ spent: "450.00", remaining: "-50.00" })]} categories={categories} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.firstElementChild).toHaveClass("bg-expense");
    expect(screen.getByText("Over by")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toHaveClass("text-expense-text");
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
  });

  it("stays in the normal color exactly at the limit", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ spent: "400.00", remaining: "0.00" })]} categories={categories} />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-primary");
    expect(screen.getByText("Remaining")).toBeInTheDocument();
  });

  it("shows last month's spending and the forecast", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    expect(screen.getByText("Last month")).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(screen.getByText("Forecast")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).not.toHaveClass("text-expense-text");
  });

  it("says last week for a weekly budget and turns the forecast red above the limit", async () => {
    await renderServer(
      <BudgetsManager
        budgets={[budget({ period: "weekly", range: { start: "2026-10-05", end: "2026-10-11" }, amount: "100.00", forecast: "133.00" })]}
        categories={categories}
      />,
    );
    expect(screen.getByText("Last week")).toBeInTheDocument();
    expect(screen.queryByText("Last month")).not.toBeInTheDocument();
    expect(screen.getByText("$133.00")).toHaveClass("text-expense-text");
  });

  it("shows n/a when there is not enough history for a forecast", async () => {
    await renderServer(<BudgetsManager budgets={[budget({ forecast: null })]} categories={categories} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("marks where the spending is heading with an arrow next to the forecast", async () => {
    const { rerender } = await renderServer(<BudgetsManager budgets={[budget({ trend: "up" })]} categories={categories} />);
    expect(screen.getByTitle("Increasing")).toHaveClass("text-expense-text");
    await rerenderServer(rerender, <BudgetsManager budgets={[budget({ trend: "down" })]} categories={categories} />);
    expect(screen.getByTitle("Decreasing")).toHaveClass("text-income-text");
    await rerenderServer(rerender, <BudgetsManager budgets={[budget({ trend: "stable" })]} categories={categories} />);
    expect(screen.getByTitle("Stable")).toHaveClass("text-muted");
    await rerenderServer(rerender, <BudgetsManager budgets={[budget({ forecast: null, trend: null })]} categories={categories} />);
    expect(screen.queryByTitle("Increasing")).not.toBeInTheDocument();
  });

  it("shows an empty state with an add button", async () => {
    await renderServer(<BudgetsManager budgets={[]} categories={categories} />);
    expect(screen.getByText("No budgets yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add budget" })).toBeEnabled();
  });

  it("explains that an expense category is needed when there is none", async () => {
    await renderServer(<BudgetsManager budgets={[]} categories={[]} />);
    expect(screen.getByText(/Budgets need an expense category/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add budget" })).not.toBeInTheDocument();
  });

  it("disables adding and links to categories when budgets exist but no expense category does", async () => {
    await renderServer(<BudgetsManager budgets={[budget()]} categories={[]} />);
    expect(screen.getByRole("button", { name: "Add budget" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Profile → Categories" })).toHaveAttribute("href", "/profile/categories");
  });

  it("deletes after confirmation and reports a failure inside the dialog", async () => {
    const user = userEvent.setup();
    await renderServer(<BudgetsManager budgets={[budget()]} categories={categories} />);
    await user.click(screen.getByRole("button", { name: "Delete monthly budget for Groceries" }));

    actions.deleteBudget.mockResolvedValueOnce({ ok: false, error: "This item no longer exists." });
    await user.click(screen.getByRole("button", { name: "Delete budget" }));
    expect(await screen.findByText("This item no longer exists.")).toBeInTheDocument();
    expect(actions.deleteBudget).toHaveBeenCalledWith(budget().id);

    await user.click(screen.getByRole("button", { name: "Delete budget" }));
    await waitFor(() => expect(actions.deleteBudget).toHaveBeenCalledTimes(2));
  });
});

describe("BudgetForm", () => {
  it("offers exactly the categories it is given, monthly by default", async () => {
    await renderServer(<BudgetForm categories={categories} onDone={() => {}} />);
    expect(await optionNames(userEvent.setup(), "Category")).toEqual(["Groceries", "Rent"]);
    expect(screen.getByLabelText("Period")).toHaveValue("monthly");
  });

  it("shows last period's spending and the forecast under the limit, following the category and period", async () => {
    const user = userEvent.setup();
    const hints = {
      [categories[0].id]: {
        monthly: { lastSpent: "120.00", forecast: "150.00", trend: "up" as const },
        weekly: { lastSpent: "30.00", forecast: "34.62", trend: "up" as const },
      },
      [categories[1].id]: {
        monthly: { lastSpent: "1000.00", forecast: null, trend: null },
        weekly: { lastSpent: "0.00", forecast: null, trend: null },
      },
    };
    await renderServer(<BudgetForm categories={categories} hints={hints} onDone={() => {}} />);
    expect(screen.getByText("Last month: $120.00 · Forecast: $150.00")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Period"), "weekly");
    expect(screen.getByText("Last week: $30.00 · Forecast: $34.62")).toBeInTheDocument();
    await pickOption(user, "Category", "Rent");
    expect(screen.getByText("Last week: $0.00 · Forecast: n/a")).toBeInTheDocument();
  });

  it("submits a normalized budget", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<BudgetForm categories={categories} onDone={onDone} />);
    await pickOption(user, "Category", "Rent");
    await user.selectOptions(screen.getByLabelText("Period"), "weekly");
    await user.type(screen.getByLabelText("Limit ($)"), "75.5");
    await user.click(screen.getByRole("button", { name: "Add budget" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createBudget).toHaveBeenCalledWith({ categoryId: categories[1].id, amount: "75.50", period: "weekly" });
  });

  it("validates the limit before calling the server", async () => {
    const user = userEvent.setup();
    await renderServer(<BudgetForm categories={categories} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Add budget" }));
    expect(await screen.findByText("Enter an amount like 100 or 100.50")).toBeInTheDocument();
    expect(actions.createBudget).not.toHaveBeenCalled();
  });

  it("shows a duplicate error from the server on the category field and stays open", async () => {
    actions.createBudget.mockResolvedValue({
      ok: false,
      error: "A monthly budget for this category already exists",
      fieldErrors: { categoryId: ["A monthly budget for this category already exists"] },
    });
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<BudgetForm categories={categories} onDone={onDone} />);
    await user.type(screen.getByLabelText("Limit ($)"), "10");
    await user.click(screen.getByRole("button", { name: "Add budget" }));
    expect((await screen.findAllByText("A monthly budget for this category already exists")).length).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("edits an existing budget", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(
      <BudgetForm
        categories={categories}
        budget={{ id: "11111111-1111-4111-8111-111111111111", categoryId: categories[1].id, amount: "1000.00", period: "weekly" }}
        onDone={onDone}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Rent");
    expect(screen.getByLabelText("Period")).toHaveValue("weekly");
    await user.clear(screen.getByLabelText("Limit ($)"));
    await user.type(screen.getByLabelText("Limit ($)"), "900");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.updateBudget).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      categoryId: categories[1].id,
      amount: "900.00",
      period: "weekly",
    });
  });
});
