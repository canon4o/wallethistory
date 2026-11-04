// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/dashboard" }));
const load = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/lib/actions/quick-add", () => ({ loadQuickAddOptions: load }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Sheets(props: { kind: string; state: { status: string }; onRetry: () => void; onClose: () => void }) {
      return (
        <div data-testid="sheets" data-kind={props.kind} data-status={props.state.status}>
          <button onClick={props.onRetry}>retry</button>
          <button onClick={props.onClose}>close sheet</button>
        </div>
      );
    },
}));

import { QuickAdd } from "@/components/layout/QuickAdd";

const options = { accounts: [], transferTargets: [], categories: [], tags: [], goals: [] };

beforeEach(() => {
  pathname.value = "/dashboard";
  load.mockReset();
  load.mockResolvedValue({ ok: true, options });
});
afterEach(cleanup);

describe("QuickAdd speed dial", () => {
  it("renders nothing on pages without the button", () => {
    pathname.value = "/reports/cash-flow";
    render(<QuickAdd />);
    expect(screen.queryByRole("button", { name: "Quick add" })).not.toBeInTheDocument();
  });

  it("opens three actions, loads the options once and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    const toggle = screen.getByRole("button", { name: "Quick add" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Add transaction", "Add transfer", "Goal deposit"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Add transfer" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("opens the chosen form once the options are ready", async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("button", { name: "Add transfer" }));
    const sheets = screen.getByTestId("sheets");
    expect(sheets).toHaveAttribute("data-kind", "transfer");
    await waitFor(() => expect(sheets).toHaveAttribute("data-status", "ready"));
    await user.click(screen.getByRole("button", { name: "close sheet" }));
    expect(screen.queryByTestId("sheets")).not.toBeInTheDocument();
  });

  it("shows an error and retries when the options cannot be loaded", async () => {
    load.mockResolvedValueOnce({ ok: false, error: "Nope" });
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(screen.getByTestId("sheets")).toHaveAttribute("data-status", "error"));
    await user.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(screen.getByTestId("sheets")).toHaveAttribute("data-status", "ready"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown load as an error", async () => {
    load.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("button", { name: "Goal deposit" }));
    await waitFor(() => expect(screen.getByTestId("sheets")).toHaveAttribute("data-status", "error"));
  });

  it("is inert while a text field has focus", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <input aria-label="Search" />
        <QuickAdd />
      </>,
    );
    await user.click(screen.getByLabelText("Search"));
    expect(container.querySelector("[inert]")).not.toBeNull();
    await user.tab();
    expect(container.querySelector("[inert]")).toBeNull();
  });
});
