// @vitest-environment jsdom
import { cleanup, screen, waitFor, within, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HouseholdManager } from "@/components/household/HouseholdManager";
import type { HouseholdOverview } from "@/lib/data/household";

const actions = vi.hoisted(() => ({
  acceptHouseholdInvite: vi.fn(),
  cancelHouseholdInvite: vi.fn(),
  declineHouseholdInvite: vi.fn(),
  inviteToHousehold: vi.fn(),
  leaveHousehold: vi.fn(),
  removeHouseholdMember: vi.fn(),
}));
vi.mock("@/lib/actions/household", () => actions);

const empty: HouseholdOverview = { members: [], incoming: [], outgoing: [] };
const together: HouseholdOverview = {
  members: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Ann", isMe: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Ben", isMe: false },
  ],
  incoming: [],
  outgoing: [],
};

function setup(overview: HouseholdOverview) {
  const user = userEvent.setup();
  render(<HouseholdManager overview={overview} />);
  return { user };
}

describe("HouseholdManager", () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("shows an empty state and the invite form", () => {
    setup(empty);
    expect(screen.getByText(/not sharing with anyone yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Invite by email")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave household" })).not.toBeInTheDocument();
  });

  it("sends an invitation and confirms without revealing whether the account exists", async () => {
    const { user } = setup(empty);
    await user.type(screen.getByLabelText("Invite by email"), "ben@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(actions.inviteToHousehold).toHaveBeenCalledWith({ email: "ben@example.com" }));
    expect(await screen.findByText(/If that email belongs to a WalletHistory account/)).toBeInTheDocument();
  });

  it("shows a server error on the email field", async () => {
    actions.inviteToHousehold.mockResolvedValue({
      ok: false,
      error: "You can't invite yourself.",
      fieldErrors: { email: ["You can't invite yourself."] },
    });
    const { user } = setup(empty);
    await user.type(screen.getByLabelText("Invite by email"), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect((await screen.findAllByText("You can't invite yourself.")).length).toBeGreaterThan(0);
  });

  it("accepts and declines incoming invitations", async () => {
    const { user } = setup({ ...empty, incoming: [{ id: "i1", inviterName: "Ann" }] });
    expect(screen.getByText(/includes? all your accounts|including past ones/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept invitation from Ann" }));
    expect(actions.acceptHouseholdInvite).toHaveBeenCalledWith("i1");
    await user.click(screen.getByRole("button", { name: "Decline invitation from Ann" }));
    expect(actions.declineHouseholdInvite).toHaveBeenCalledWith("i1");
  });

  it("shows an action error", async () => {
    actions.acceptHouseholdInvite.mockResolvedValue({ ok: false, error: "You are already in a household." });
    const { user } = setup({ ...empty, incoming: [{ id: "i1", inviterName: "Ann" }] });
    await user.click(screen.getByRole("button", { name: "Accept invitation from Ann" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You are already in a household.");
  });

  it("cancels a pending outgoing invitation", async () => {
    const { user } = setup({ ...empty, outgoing: [{ id: "o1", email: "ben@example.com" }] });
    await user.click(screen.getByRole("button", { name: "Cancel invitation to ben@example.com" }));
    expect(actions.cancelHouseholdInvite).toHaveBeenCalledWith("o1");
  });

  it("lists members and removes one after confirming", async () => {
    const { user } = setup(together);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Ann" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Ben" }));
    const dialog = await screen.findByRole("dialog");
    expect(actions.removeHouseholdMember).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(actions.removeHouseholdMember).toHaveBeenCalledWith(together.members[1].id));
  });

  it("leaves the household after confirming and keeps the dialog open on error", async () => {
    actions.leaveHousehold.mockResolvedValue({ ok: false, error: "Something went wrong." });
    const { user } = setup(together);
    await user.click(screen.getByRole("button", { name: "Leave household" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Ben's");
    await user.click(within(dialog).getByRole("button", { name: "Leave household" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong.");
    actions.leaveHousehold.mockResolvedValue({ ok: true });
    await user.click(within(dialog).getByRole("button", { name: "Leave household" }));
    await waitFor(() => expect(actions.leaveHousehold).toHaveBeenCalledTimes(2));
  });

  it("describes leaving a bigger household generically", async () => {
    const { user } = setup({
      ...together,
      members: [...together.members, { id: "33333333-3333-4333-8333-333333333333", name: "Cat", isMe: false }],
    });
    await user.click(screen.getByRole("button", { name: "Leave household" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("the other members'");
  });
});
