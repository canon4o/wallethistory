// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecurringManager } from "@/components/recurring/RecurringManager";
import { splitRepeatErrors } from "@/components/recurring/RepeatFields";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransferForm } from "@/components/transactions/TransferForm";
import type { RecurringRuleItem } from "@/lib/data/recurring";
import { optionNames, pickOption } from "./helpers/listbox";
import { renderServer } from "./helpers/server-render";

const actions = vi.hoisted(() => ({
  createRecurringRule: vi.fn(),
  updateRecurringRule: vi.fn(),
  setRecurringRuleStatus: vi.fn(),
  deleteRecurringRule: vi.fn(),
}));
vi.mock("@/lib/actions/recurring", () => actions);
vi.mock("@/lib/actions/transactions", () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn() }));
vi.mock("@/lib/actions/transfers", () => ({ createTransfer: vi.fn(), updateTransfer: vi.fn() }));

const accounts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Cash", icon: "banknote", color: "#9cca56" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bank", icon: "landmark", color: "#337ab7" },
];
const categories = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "expense" as const, name: "Rent", icon: "home", color: "#337ab7" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", type: "income" as const, name: "Salary", icon: "banknote", color: "#9cca56" },
];
const tags = [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "home" }];
const goals = [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Japan" }];
const todayLocal = new Date().toLocaleDateString("en-CA");

describe("repeat section of the add forms", () => {
  beforeEach(() => {
    actions.createRecurringRule.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("turns a new transaction into a recurring rule", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    await renderServer(<TransactionForm accounts={accounts} categories={categories} tags={tags} onDone={onDone} />);
    expect(screen.queryByLabelText("Every")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Amount ($)"), "900");
    await pickOption(user, "Category", "Rent");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    await user.clear(screen.getByLabelText("Every"));
    await user.type(screen.getByLabelText("Every"), "2");
    await user.selectOptions(screen.getByLabelText("Frequency"), "weekly");
    await user.click(screen.getByRole("button", { name: "Add recurring transaction" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createRecurringRule).toHaveBeenCalledWith({
      kind: "expense",
      amount: "900.00",
      accountId: accounts[0].id,
      categoryId: categories[0].id,
      tagIds: [],
      note: null,
      frequency: "weekly",
      intervalCount: "2",
      startDate: todayLocal,
      endDate: "",
    });
  });

  it("shows server errors on the repeat fields and the date", async () => {
    actions.createRecurringRule.mockResolvedValue({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { intervalCount: ["Must be at most 365"], startDate: ["Enter a valid date"] },
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    await renderServer(<TransactionForm accounts={accounts} categories={categories} tags={tags} onDone={onDone} />);
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    fireEvent.change(screen.getByLabelText("Ends on (optional)"), { target: { value: "2099-01-01" } });
    await user.click(screen.getByRole("button", { name: "Add recurring transaction" }));
    expect(await screen.findByText("Must be at most 365")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid date")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows other server errors on the normal fields", async () => {
    actions.createRecurringRule.mockResolvedValue({
      ok: false,
      error: "Choose one of your accounts",
      fieldErrors: { accountId: ["Choose one of your accounts"] },
    });
    const user = userEvent.setup();
    await renderServer(<TransactionForm accounts={accounts} categories={categories} tags={tags} onDone={vi.fn()} />);
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    await user.click(screen.getByRole("button", { name: "Add recurring transaction" }));
    expect((await screen.findAllByText("Choose one of your accounts")).length).toBeGreaterThan(0);
  });

  it("does not offer repeat when editing", async () => {
    await renderServer(
      <TransactionForm
        accounts={accounts}
        categories={categories}
        tags={tags}
        transaction={{ id: "t1", type: "expense", amount: "5.00", date: "2026-03-01", accountId: accounts[0].id, categoryId: "", tagIds: [], note: "" }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByText("Repeat")).not.toBeInTheDocument();
  });

  it("creates a recurring transfer", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    await renderServer(<TransferForm accounts={accounts} onDone={onDone} />);
    await user.type(screen.getByLabelText("Amount ($)"), "50");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    fireEvent.change(screen.getByLabelText("Ends on (optional)"), { target: { value: "2099-12-31" } });
    await user.click(screen.getByRole("button", { name: "Add recurring transfer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createRecurringRule).toHaveBeenCalledWith({
      kind: "transfer",
      amount: "50.00",
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      note: null,
      frequency: "monthly",
      intervalCount: "1",
      startDate: todayLocal,
      endDate: "2099-12-31",
    });
  });

  it("shows transfer errors from the server", async () => {
    actions.createRecurringRule.mockResolvedValue({
      ok: false,
      error: "Choose one of your accounts",
      fieldErrors: { toAccountId: ["Choose one of your accounts"] },
    });
    const user = userEvent.setup();
    await renderServer(<TransferForm accounts={accounts} onDone={vi.fn()} />);
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    await user.click(screen.getByRole("button", { name: "Add recurring transfer" }));
    expect((await screen.findAllByText("Choose one of your accounts")).length).toBeGreaterThan(0);
  });

  it("does not offer repeat when editing a transfer", async () => {
    await renderServer(
      <TransferForm
        accounts={accounts}
        transfer={{ id: "t1", fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: "5.00", date: "2026-03-01", note: "" }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByText("Repeat")).not.toBeInTheDocument();
  });

  it("splits repeat errors from form errors", async () => {
    const { form, repeat } = splitRepeatErrors({
      ok: false,
      error: "x",
      fieldErrors: { frequency: ["f"], intervalCount: ["i"], endDate: ["e"], startDate: ["s"], amount: ["a"] },
    });
    expect(repeat).toEqual({ frequency: "f", intervalCount: "i", endDate: "e" });
    expect(form.fieldErrors).toEqual({ date: ["s"], amount: ["a"] });
    expect(splitRepeatErrors({ ok: false, error: "x" })).toEqual({ form: { ok: false, error: "x", fieldErrors: {} }, repeat: {} });
  });
});

const rule = (extra: Partial<RecurringRuleItem> = {}): RecurringRuleItem => ({
  id: "r1",
  kind: "expense",
  amount: "900.00",
  accountId: accounts[0].id,
  accountName: "Cash",
  categoryId: categories[0].id,
  categoryName: "Rent",
  fromAccountId: null,
  fromAccountName: null,
  toAccountId: null,
  toAccountName: null,
  goalId: null,
  goalName: null,
  tagIds: [],
  note: "flat",
  frequency: "monthly",
  intervalCount: 1,
  startDate: "2026-01-01",
  endDate: null,
  nextDueDate: "2026-11-01",
  status: "active",
  pausedReason: null,
  ...extra,
});

async function setup(rules: RecurringRuleItem[], props: { accounts?: typeof accounts } = {}) {
  const user = userEvent.setup();
  await renderServer(
    <RecurringManager
      rules={rules}
      accounts={props.accounts ?? accounts}
      transferTargets={accounts}
      categories={categories}
      tags={tags}
      goals={goals}
    />,
  );
  return { user };
}

describe("RecurringManager", () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("shows an empty state, or asks for an account first", async () => {
    await setup([]);
    expect(screen.getByText(/Nothing repeats yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add recurring" })).toBeEnabled();
    cleanup();
    await setup([], { accounts: [] });
    expect(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
  });

  it("lists rules with their schedule, next date and status", async () => {
    await setup([
      rule(),
      rule({ id: "r2", kind: "transfer", accountId: null, accountName: null, categoryId: null, categoryName: null, fromAccountName: "Cash", toAccountName: "Bank", amount: "50.00", frequency: "weekly", intervalCount: 2, note: null }),
      rule({ id: "r3", kind: "income", categoryName: null, status: "paused", pausedReason: "stale", endDate: "2027-01-01" }),
      rule({ id: "r4", status: "ended" }),
    ]);
    const items = within(screen.getByRole("list", { name: "Recurring transactions" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Rent · Cash");
    expect(items[0]).toHaveTextContent("Every month");
    expect(items[0]).toHaveTextContent("Next Nov 1, 2026");
    expect(items[1]).toHaveTextContent("Cash → Bank");
    expect(items[1]).toHaveTextContent("Every 2 weeks");
    expect(items[2]).toHaveTextContent("Uncategorized · Cash");
    expect(items[2]).toHaveTextContent("Paused: not used for over 2 years");
    expect(items[2]).toHaveTextContent("ends Jan 1, 2027");
    expect(items[3]).toHaveTextContent("Ended");
    expect(within(items[3]).queryByRole("button", { name: /^(Pause|Resume)/ })).not.toBeInTheDocument();
  });

  it("pauses and resumes a rule, and shows a failure", async () => {
    const { user } = await setup([rule(), rule({ id: "r2", status: "paused", pausedReason: "manual" })]);
    await user.click(screen.getAllByRole("button", { name: /^Pause/ })[0]);
    expect(actions.setRecurringRuleStatus).toHaveBeenCalledWith("r1", "paused");
    actions.setRecurringRuleStatus.mockResolvedValue({ ok: false, error: "This rule has ended." });
    await user.click(screen.getAllByRole("button", { name: /^Resume/ })[0]);
    expect(actions.setRecurringRuleStatus).toHaveBeenCalledWith("r2", "active");
    expect(await screen.findByText("This rule has ended.")).toBeInTheDocument();
  });

  it("deletes after confirming and shows a failure", async () => {
    const { user } = await setup([rule()]);
    await user.click(screen.getAllByRole("button", { name: /^Delete/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Delete recurring transaction" });
    expect(dialog).toHaveTextContent("Entries it already created stay in your history");
    actions.deleteRecurringRule.mockResolvedValueOnce({ ok: false, error: "This item no longer exists." });
    await user.click(within(dialog).getByRole("button", { name: "Delete recurring" }));
    expect(await within(dialog).findByText("This item no longer exists.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete recurring" }));
    await waitFor(() => expect(actions.deleteRecurringRule).toHaveBeenCalledTimes(2));
    expect(actions.deleteRecurringRule).toHaveBeenLastCalledWith("r1");
  });

  it("edits a rule", async () => {
    const { user } = await setup([rule({ tagIds: [tags[0].id] })]);
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Edit recurring transaction" });
    expect(within(dialog).getByLabelText("Amount ($)")).toHaveValue("900.00");
    expect(within(dialog).getByLabelText("Every")).toHaveValue(1);
    expect(within(dialog).getByLabelText("First entry on")).toHaveValue("2026-01-01");
    expect(within(dialog).getByText(/future entries only/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Amount ($)"));
    await user.type(within(dialog).getByLabelText("Amount ($)"), "950");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.updateRecurringRule).toHaveBeenCalled());
    expect(actions.updateRecurringRule).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ kind: "expense", amount: "950.00", accountId: accounts[0].id, tagIds: [tags[0].id], intervalCount: 1, endDate: null }),
    );
  });

  it("edits a transfer rule", async () => {
    const { user } = await setup([
      rule({ kind: "transfer", accountId: null, categoryId: null, fromAccountId: accounts[0].id, fromAccountName: "Cash", toAccountId: accounts[1].id, toAccountName: "Bank", note: null }),
    ]);
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Edit recurring transaction" });
    expect(within(dialog).getByRole("combobox", { name: "From account" })).toHaveTextContent("Cash");
    expect(within(dialog).getByRole("combobox", { name: "To account" })).toHaveTextContent("Bank");
    expect(await optionNames(user, "To account")).toEqual(["Bank"]);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(actions.updateRecurringRule).toHaveBeenCalledWith("r1", expect.objectContaining({ kind: "transfer", fromAccountId: accounts[0].id, toAccountId: accounts[1].id })),
    );
  });

  it("adds a rule from the page, switching between types", async () => {
    const { user } = await setup([rule()]);
    await user.click(screen.getByRole("button", { name: "Add recurring" }));
    const dialog = await screen.findByRole("dialog", { name: "Add recurring transaction" });
    expect(await optionNames(user, "Category")).toEqual(["No category", "Rent"]);
    await user.click(within(dialog).getByRole("radio", { name: "Income" }));
    expect(await optionNames(user, "Category")).toEqual(["No category", "Salary"]);
    await user.click(within(dialog).getByRole("radio", { name: "Transfer" }));
    expect(within(dialog).queryByRole("combobox", { name: "Category" })).not.toBeInTheDocument();
    await pickOption(user, "From account", "Bank");
    expect(within(dialog).getByRole("combobox", { name: "To account" })).toHaveTextContent("Cash");
    await user.type(within(dialog).getByLabelText("Amount ($)"), "20");
    await user.click(within(dialog).getByRole("button", { name: "Add recurring" }));
    await waitFor(() => expect(actions.createRecurringRule).toHaveBeenCalled());
    expect(actions.createRecurringRule).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "transfer", amount: "20.00", fromAccountId: accounts[1].id, toAccountId: accounts[0].id, frequency: "monthly", intervalCount: 1 }),
    );
  });

  it("adds a recurring deposit into a goal", async () => {
    const { user } = await setup([rule()]);
    await user.click(screen.getByRole("button", { name: "Add recurring" }));
    const dialog = await screen.findByRole("dialog", { name: "Add recurring transaction" });
    await user.click(within(dialog).getByRole("radio", { name: "Goal" }));
    expect(within(dialog).queryByRole("combobox", { name: "Category" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Goal" })).toHaveValue(goals[0].id);
    await user.type(within(dialog).getByLabelText("Amount ($)"), "200");
    await user.click(within(dialog).getByRole("button", { name: "Add recurring" }));
    await waitFor(() => expect(actions.createRecurringRule).toHaveBeenCalled());
    expect(actions.createRecurringRule).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "goal", amount: "200.00", accountId: accounts[0].id, goalId: goals[0].id }),
    );
  });

  it("lists goal rules as account to goal and edits them", async () => {
    const { user } = await setup([
      rule({ kind: "goal", categoryId: null, categoryName: null, goalId: goals[0].id, goalName: "Japan", note: null }),
      rule({ id: "r2", kind: "goal", categoryId: null, categoryName: null, goalId: goals[0].id, goalName: "Japan", status: "paused", pausedReason: "goal_closed" }),
    ]);
    expect(screen.getAllByText("Cash → Japan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paused: the goal is no longer open").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /^Edit goal/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Edit recurring transaction" });
    expect(within(dialog).getByRole("combobox", { name: "Goal" })).toHaveValue(goals[0].id);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(actions.updateRecurringRule).toHaveBeenCalledWith("r1", expect.objectContaining({ kind: "goal", goalId: goals[0].id, accountId: accounts[0].id })),
    );
  });

  it("shows server errors in the form", async () => {
    actions.createRecurringRule.mockResolvedValue({ ok: false, error: "Choose one of your accounts", fieldErrors: { accountId: ["Choose one of your accounts"] } });
    const { user } = await setup([]);
    await user.click(screen.getByRole("button", { name: "Add recurring" }));
    const dialog = await screen.findByRole("dialog", { name: "Add recurring transaction" });
    await user.type(within(dialog).getByLabelText("Amount ($)"), "20");
    await user.click(within(dialog).getByRole("button", { name: "Add recurring" }));
    expect((await within(dialog).findAllByText("Choose one of your accounts")).length).toBeGreaterThan(0);
  });
});
