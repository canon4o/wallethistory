// @vitest-environment jsdom
import { cleanup, screen, waitFor, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { optionNames, pickOption } from "./helpers/listbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferForm } from "@/components/transactions/TransferForm";

const actions = vi.hoisted(() => ({ createTransfer: vi.fn(), updateTransfer: vi.fn() }));
vi.mock("@/lib/actions/transfers", () => actions);

const accounts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Cash", icon: "banknote", color: "#9cca56" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bank", icon: "landmark", color: "#337ab7" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Savings", icon: "piggy-bank", color: "#ea9150" },
];

function setup(props: Partial<React.ComponentProps<typeof TransferForm>> = {}) {
  const onDone = vi.fn();
  const user = userEvent.setup();
  render(<TransferForm accounts={accounts} onDone={onDone} {...props} />);
  return { onDone, user };
}

describe("TransferForm", () => {
  beforeEach(() => {
    actions.createTransfer.mockReset().mockResolvedValue({ ok: true });
    actions.updateTransfer.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("starts with the first two accounts and today's date", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "From account" })).toHaveTextContent("Cash");
    expect(screen.getByRole("combobox", { name: "To account" })).toHaveTextContent("Bank");
    expect(screen.getByLabelText("Date")).toHaveValue(new Date().toLocaleDateString("en-CA"));
  });

  it("submits a normalized transfer and closes", async () => {
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText("Amount ($)"), "12.5");
    await user.type(screen.getByLabelText("Note"), " rent ");
    await user.click(screen.getByRole("button", { name: "Add transfer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createTransfer).toHaveBeenCalledWith({
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      amount: "12.50",
      date: new Date().toLocaleDateString("en-CA"),
      note: "rent",
    });
  });

  it("never offers the From account as the To account", async () => {
    const { user } = setup();
    expect(await optionNames(user, "To account")).toEqual(["Bank", "Savings"]);
    await pickOption(user, "From account", "Savings");
    expect(await optionNames(user, "To account")).toEqual(["Cash", "Bank"]);
  });

  it("moves To to another account when From is changed to the current To", async () => {
    const { user } = setup();
    await pickOption(user, "From account", "Bank");
    expect(screen.getByRole("combobox", { name: "To account" })).toHaveTextContent("Cash");
  });

  it("shows server errors and keeps the form open", async () => {
    actions.createTransfer.mockResolvedValue({ ok: false, error: "Something went wrong", fieldErrors: { toAccountId: ["Choose one of your accounts"] } });
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText("Amount ($)"), "5");
    await user.click(screen.getByRole("button", { name: "Add transfer" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Choose one of your accounts")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("edits an existing transfer", async () => {
    const { user, onDone } = setup({
      transfer: { id: "t1", fromAccountId: accounts[1].id, toAccountId: accounts[0].id, amount: "9.00", date: "2026-03-04", note: "" },
    });
    expect(screen.getByRole("combobox", { name: "From account" })).toHaveTextContent("Bank");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.updateTransfer).toHaveBeenCalledWith("t1", expect.objectContaining({ amount: "9.00", note: null }));
  });

  it("offers household members' accounts only as the destination", async () => {
    const targets = [...accounts, { id: "44444444-4444-4444-8444-444444444444", name: "Ben · Cash", icon: "banknote", color: "#9cca56" }];
    const { user } = setup({ accounts: accounts.slice(0, 1), toAccounts: targets });
    await user.type(screen.getByLabelText("Amount ($)"), "9");
    await pickOption(user, "To account", "Ben · Cash");
    await user.click(screen.getByRole("button", { name: "Add transfer" }));
    await waitFor(() =>
      expect(actions.createTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ fromAccountId: accounts[0].id, toAccountId: "44444444-4444-4444-8444-444444444444" }),
      ),
    );
  });
});
