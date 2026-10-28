// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetAlerts } from "@/components/budgets/BudgetAlerts";
import { RegionProvider } from "@/components/layout/RegionProvider";
import { BudgetAlertsForm } from "@/components/settings/BudgetAlertsForm";
import type { BudgetAlert } from "@/lib/data/budget-alerts";

const mocks = vi.hoisted(() => ({ dismissBudgetAlert: vi.fn(), updateBudgetAlertSettings: vi.fn() }));
vi.mock("@/lib/actions/budget-alerts", () => ({
  dismissBudgetAlert: mocks.dismissBudgetAlert,
  updateBudgetAlertSettings: mocks.updateBudgetAlertSettings,
}));

function alert(extra: Partial<BudgetAlert> = {}): BudgetAlert {
  return {
    budgetId: crypto.randomUUID(),
    level: "warning",
    period: "monthly",
    category: { name: "Groceries", icon: "shopping-cart", color: "#9cca56" },
    spent: "255.00",
    amount: "300.00",
    percent: 85,
    periodStart: "2026-10-01",
    ...extra,
  };
}

function renderAlerts(alerts: BudgetAlert[]) {
  return render(
    <RegionProvider region={{ currency: "EUR", timezone: "UTC" }}>
      <BudgetAlerts alerts={alerts} />
    </RegionProvider>,
  );
}

beforeEach(() => {
  mocks.dismissBudgetAlert.mockReset().mockResolvedValue({ ok: true });
  mocks.updateBudgetAlertSettings.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("BudgetAlerts", () => {
  it("renders nothing without alerts", () => {
    const { container } = renderAlerts([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a warning with the percent, the amounts in the user's currency and a link to the budgets", () => {
    renderAlerts([alert()]);
    const row = screen.getByRole("status");
    expect(row).toHaveAttribute("data-level", "warning");
    expect(row).toHaveTextContent("Groceries: 85% of your monthly budget used (€255.00 of €300.00)");
    expect(within(row).getByRole("link", { name: "View budgets" })).toHaveAttribute("href", "/budgets");
  });

  it("shows a weekly budget and an exceeded alert in their own words and style", () => {
    renderAlerts([
      alert({ level: "exceeded", period: "weekly", spent: "120.00", amount: "100.00", percent: 120 }),
      alert({ period: "weekly", category: { name: "Fun", icon: "film", color: "#df697f" }, spent: "90.00", amount: "100.00", percent: 90 }),
    ]);
    const [exceeded, warning] = screen.getAllByRole("status");
    expect(exceeded).toHaveAttribute("data-level", "exceeded");
    expect(exceeded).toHaveTextContent("Groceries: over your weekly budget (€120.00 of €100.00)");
    expect(exceeded.className).toContain("bg-expense");
    expect(warning).toHaveTextContent("Fun: 90% of your weekly budget used (€90.00 of €100.00)");
    expect(warning.className).toContain("bg-planning");
  });

  it("shows at most three alerts and '+N more' linking to the budgets", () => {
    renderAlerts(Array.from({ length: 5 }, (_, index) => alert({ category: { name: `Cat ${index}`, icon: "tag", color: "#337ab7" } })));
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "+2 more" })).toHaveAttribute("href", "/budgets");
  });

  it("has no '+N more' link with three or fewer", () => {
    renderAlerts(Array.from({ length: 3 }, () => alert()));
    expect(screen.queryByRole("link", { name: /more/ })).not.toBeInTheDocument();
  });

  it("dismisses an alert at once and saves it with its budget, level and period start", async () => {
    const target = alert({ level: "exceeded", periodStart: "2026-10-05" });
    renderAlerts([target]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss alert for Groceries" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.dismissBudgetAlert).toHaveBeenCalledWith({ budgetId: target.budgetId, level: "exceeded", periodStart: "2026-10-05" });
  });

  it("brings the next alert up after a dismissal", async () => {
    const alerts = Array.from({ length: 4 }, (_, index) => alert({ category: { name: `Cat ${index}`, icon: "tag", color: "#337ab7" } }));
    renderAlerts(alerts);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss alert for Cat 0" }));
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByText(/Cat 3:/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /more/ })).not.toBeInTheDocument();
  });

  it("shows the alert again when saving the dismissal fails", async () => {
    mocks.dismissBudgetAlert.mockResolvedValue({ ok: false, error: "Something went wrong. Please try again." });
    renderAlerts([alert()]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss alert for Groceries" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  it("gives the dismiss button a target of at least 40px", () => {
    renderAlerts([alert()]);
    expect(screen.getByRole("button", { name: "Dismiss alert for Groceries" }).className).toContain("size-10");
  });
});

describe("BudgetAlertsForm", () => {
  it("shows the saved values with labeled fields", () => {
    render(<BudgetAlertsForm enabled threshold={75} />);
    expect(screen.getByRole("checkbox", { name: "Show budget alerts" })).toBeChecked();
    const select = screen.getByRole("combobox", { name: "Warn me at" });
    expect(select).toHaveValue("75");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "50%", "55%", "60%", "65%", "70%", "75%", "80%", "85%", "90%", "95%",
    ]);
  });

  it("still offers a saved threshold between the steps", () => {
    render(<BudgetAlertsForm enabled threshold={99} />);
    expect(screen.getByRole("combobox", { name: "Warn me at" })).toHaveValue("99");
  });

  it("saves the changes and confirms", async () => {
    render(<BudgetAlertsForm enabled threshold={80} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warn me at" }), "60");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateBudgetAlertSettings).toHaveBeenCalledWith({ enabled: true, threshold: 60 });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("turns alerts off, which disables the threshold", async () => {
    render(<BudgetAlertsForm enabled threshold={80} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Show budget alerts" }));
    expect(screen.getByRole("combobox", { name: "Warn me at" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateBudgetAlertSettings).toHaveBeenCalledWith({ enabled: false, threshold: 80 });
  });

  it("shows the server's error next to the field", async () => {
    mocks.updateBudgetAlertSettings.mockResolvedValue({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { threshold: ["Choose a warning level between 50% and 99%"] },
    });
    render(<BudgetAlertsForm enabled threshold={80} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByText("Choose a warning level between 50% and 99%")).toBeInTheDocument();
  });
});
