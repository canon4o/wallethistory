// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, render } from "@testing-library/react";
import { optionNames, pickOption } from "./helpers/listbox";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { transactionSchema } from "@/lib/validation/transactions";

const actions = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));
vi.mock("@/lib/actions/transactions", () => actions);

const accounts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Cash", icon: "banknote", color: "#9cca56" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bank", icon: "landmark", color: "#337ab7" },
];
const categories = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "expense" as const, name: "Groceries", icon: "shopping-cart", color: "#9cca56" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", type: "expense" as const, name: "Rent", icon: "home", color: "#337ab7" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", type: "income" as const, name: "Salary", icon: "banknote", color: "#9cca56" },
];
const tags = [
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "trip" },
  { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "work" },
];

function setup(props: Partial<React.ComponentProps<typeof TransactionForm>> = {}) {
  const onDone = vi.fn();
  const user = userEvent.setup();
  render(<TransactionForm accounts={accounts} categories={categories} tags={tags} onDone={onDone} {...props} />);
  return { onDone, user };
}

const categoryOptions = (user: ReturnType<typeof userEvent.setup>) => optionNames(user, "Category");

describe("TransactionForm", () => {
  beforeEach(() => {
    actions.createTransaction.mockReset().mockResolvedValue({ ok: true });
    actions.updateTransaction.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("preselects the default account when given, and falls back to the first when it is unknown", () => {
    setup({ defaultAccountId: accounts[1].id });
    expect(screen.getByRole("combobox", { name: "Account" })).toHaveTextContent("Bank");
    cleanup();
    setup({ defaultAccountId: "99999999-9999-4999-8999-999999999999" });
    expect(screen.getByRole("combobox", { name: "Account" })).toHaveTextContent("Cash");
  });

  it("starts as an expense dated today on the first account, offering only expense categories", async () => {
    const { user } = setup();
    expect(screen.getByRole("radio", { name: "Expense" })).toBeChecked();
    expect(screen.getByLabelText("Date")).toHaveValue(new Date().toLocaleDateString("en-CA"));
    expect(screen.getByRole("combobox", { name: "Account" })).toHaveTextContent("Cash");
    expect(await categoryOptions(user)).toEqual(["No category", "Groceries", "Rent"]);
  });

  it("switching the type filters the categories and clears a category that no longer fits", async () => {
    const { user } = setup();
    await pickOption(user, "Category", "Rent");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Rent");

    await user.click(screen.getByRole("radio", { name: "Income" }));
    expect(await categoryOptions(user)).toEqual(["No category", "Salary"]);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("No category");

    await pickOption(user, "Category", "Salary");
    await user.click(screen.getByRole("radio", { name: "Expense" }));
    expect(await categoryOptions(user)).toEqual(["No category", "Groceries", "Rent"]);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("No category");
  });

  it("submits a normalized transaction with the selected tags", async () => {
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText("Amount ($)"), "12.5");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-04" } });
    await pickOption(user, "Account", "Bank");
    await pickOption(user, "Category", "Groceries");
    await user.click(screen.getByLabelText("trip"));
    await user.click(screen.getByLabelText("work"));
    await user.click(screen.getByLabelText("trip")); // toggled off again
    await user.type(screen.getByLabelText("Note"), "  weekly shop ");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createTransaction).toHaveBeenCalledWith({
      type: "expense",
      amount: "12.50",
      date: "2026-03-04",
      accountId: accounts[1].id,
      categoryId: categories[0].id,
      tagIds: [tags[1].id],
      note: "weekly shop",
    });
  });

  it("without a category or note, sends a payload the server schema accepts", async () => {
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const payload = actions.createTransaction.mock.calls[0][0];
    expect(payload).toMatchObject({ categoryId: null, note: null, tagIds: [] });
    // The Server Action validates this exact value again.
    expect(transactionSchema.safeParse(payload).success).toBe(true);
  });

  it("validates before calling the server", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("Enter an amount like 100 or 100.50")).toBeInTheDocument();
    expect(actions.createTransaction).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Amount ($)"), "0");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("Amount must be greater than 0")).toBeInTheDocument();
  });

  it("shows server errors on the matching field and keeps the form open", async () => {
    actions.createTransaction.mockResolvedValue({
      ok: false,
      error: "Choose one of your accounts",
      fieldErrors: { accountId: ["Choose one of your accounts"] },
    });
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    expect((await screen.findAllByText("Choose one of your accounts")).length).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("explains how to get tags when there are none", () => {
    setup({ tags: [] });
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });

  it("edits an existing transaction: prefilled, calls update, keeps its category and tags", async () => {
    const { user, onDone } = setup({
      transaction: {
        id: "99999999-9999-4999-8999-999999999999",
        type: "income",
        amount: "250.00",
        date: "2026-04-01",
        accountId: accounts[1].id,
        categoryId: categories[2].id,
        tagIds: [tags[0].id],
        note: "bonus",
      },
    });
    expect(screen.getByRole("radio", { name: "Income" })).toBeChecked();
    expect(screen.getByLabelText("Amount ($)")).toHaveValue("250.00");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Salary");
    expect(screen.getByLabelText("trip")).toBeChecked();
    expect(screen.getByLabelText("work")).not.toBeChecked();
    expect(screen.getByLabelText("Note")).toHaveValue("bonus");

    await user.clear(screen.getByLabelText("Amount ($)"));
    await user.type(screen.getByLabelText("Amount ($)"), "300");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.updateTransaction).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
      expect.objectContaining({ amount: "300.00", categoryId: categories[2].id, tagIds: [tags[0].id], type: "income" }),
    );
    expect(actions.createTransaction).not.toHaveBeenCalled();
  });

  it("cancel closes without saving", async () => {
    const { user, onDone } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDone).toHaveBeenCalled();
    expect(actions.createTransaction).not.toHaveBeenCalled();
  });
});
