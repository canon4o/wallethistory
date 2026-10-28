// @vitest-environment jsdom
import { cleanup, screen, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionsManager } from "@/components/transactions/TransactionsManager";
import type { TransactionItem } from "@/lib/data/transactions";

vi.mock("@/lib/actions/transactions", () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn() }));
vi.mock("@/lib/actions/transfers", () => ({ createTransfer: vi.fn(), updateTransfer: vi.fn(), deleteTransfer: vi.fn() }));
vi.mock("@/lib/actions/recurring", () => ({ createRecurringRule: vi.fn() }));

const account = { id: "a1", name: "Cash", ownerName: "Me", isMine: true };
const item = (extra: Partial<TransactionItem>): TransactionItem => ({
  id: "t1",
  type: "expense",
  amount: "10.00",
  date: "2026-03-01",
  note: null,
  recurring: false,
  account,
  transferTo: null,
  category: { id: "c1", name: "Rent", color: "#337ab7", icon: "home" },
  tags: [],
  owner: { id: "u1", name: "Me", isMine: true },
  ...extra,
});

describe("TransactionsManager", () => {
  afterEach(cleanup);

  it("marks entries created by a recurring rule", () => {
    render(
      <TransactionsManager
        items={[
          item({ id: "t1", recurring: true }),
          item({ id: "t2", recurring: true, category: null }),
          item({ id: "t3", recurring: true, type: "transfer", category: null, transferTo: { ...account, id: "a2", name: "Bank" } }),
          item({ id: "t4" }),
        ]}
        accounts={[{ id: "a1", name: "Cash", icon: "banknote", color: "#9cca56" }]}
        categories={[]}
        tags={[]}
        filtered={false}
      />,
    );
    // Each entry is shown twice (table and cards); three of the four rows are recurring.
    expect(screen.getAllByText("Recurring")).toHaveLength(6);
  });

  it("groups the phone list by day with a net total, and opens a row to edit or delete it", async () => {
    const user = userEvent.setup();
    render(
      <TransactionsManager
        items={[
          item({ id: "t1", date: "2026-03-02", amount: "100.00", type: "income" }),
          item({ id: "t2", date: "2026-03-02", amount: "40.50" }),
          item({ id: "t3", date: "2026-03-02", amount: "5.00", type: "transfer", category: null, transferTo: { ...account, id: "a2", name: "Bank" } }),
          item({ id: "t4", date: "2026-03-01", amount: "10.00" }),
        ]}
        accounts={[{ id: "a1", name: "Cash", icon: "banknote", color: "#9cca56" }]}
        categories={[]}
        tags={[]}
        filtered={false}
      />,
    );
    const days = screen.getAllByRole("listitem", { name: /Mar \d, 2026/ });
    expect(days).toHaveLength(2);
    // Income minus expenses; the transfer does not count.
    expect(within(days[0]).getByText("+$59.50")).toBeInTheDocument();
    expect(within(days[1]).getByTitle("Day total")).toHaveTextContent("-$10.00");

    await user.click(within(days[1]).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit transaction" });
    await user.click(within(edit).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete transaction" })).toBeInTheDocument();
  });
});
