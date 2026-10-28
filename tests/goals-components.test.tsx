// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalContributionForm } from "@/components/goals/GoalContributionForm";
import { GoalDetail } from "@/components/goals/GoalDetail";
import { GoalForm } from "@/components/goals/GoalForm";
import { GoalsManager } from "@/components/goals/GoalsManager";
import { DeletedGoalList } from "@/components/goals/DeletedGoalList";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { DeletedGoalItem, GoalContributionItem, GoalContributor, GoalItem } from "@/lib/data/goals";
import { pickOption } from "./helpers/listbox";
import { renderServer, rerenderServer } from "./helpers/server-render";

const actions = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  setGoalArchived: vi.fn(),
  deleteGoal: vi.fn(),
  restoreGoal: vi.fn(),
  deleteGoalPermanently: vi.fn(),
  addGoalContribution: vi.fn(),
  updateGoalContribution: vi.fn(),
  deleteGoalContribution: vi.fn(),
  createRecurringRule: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/actions/goals", () => actions);
vi.mock("@/lib/actions/goal-contributions", () => actions);
vi.mock("@/lib/actions/recurring", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: actions.push }) }));
// The chart is SVG measured by the browser; its data is checked through the props.
vi.mock("@/components/reports/charts", () => ({
  GoalHistoryChart: ({ data, target }: { data: Array<{ label: string; saved: number }>; target: number }) => (
    <div data-testid="history-chart" data-target={target} data-points={data.map((p) => `${p.label}:${p.saved}`).join("|")} />
  ),
}));

const today = "2026-10-11";
const accounts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Cash", icon: "banknote", color: "#9cca56" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bank", icon: "landmark", color: "#337ab7" },
];
const goalId = "99999999-9999-4999-8999-999999999999";

const goal = (extra: Partial<GoalItem> = {}): GoalItem => ({
  id: goalId,
  name: "Travel to Japan",
  icon: "plane",
  color: "#ffd100",
  targetAmount: "1000.00",
  deadline: null,
  shared: false,
  note: null,
  archived: false,
  saved: "250.00",
  mySaved: "250.00",
  used: true,
  owner: { id: "u1", name: "Ann", isMine: true },
  createdAt: new Date("2026-09-01T00:00:00Z"),
  ...extra,
});

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("ProgressBar goal tone", () => {
  it("uses the goals color, and turns green when the goal is complete", async () => {
    const { rerender } = await renderServer(<ProgressBar tone="goal" value={50} max={100} label="p" />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-goals");
    await rerenderServer(rerender, <ProgressBar tone="goal" value={100} max={100} label="p" />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-income");
    await rerenderServer(rerender, <ProgressBar value={150} max={100} label="p" />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-expense");
  });
});

describe("GoalCard", () => {
  it("links to the goal with its progress, badges and deadline", async () => {
    await renderServer(<ul><GoalCard goal={goal({ shared: true, deadline: "2026-12-01", owner: { id: "u2", name: "Ben", isMine: false } })} currency="USD" today={today} /></ul>);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/goals/${goalId}`);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("$250.00")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Ben's goal")).toBeInTheDocument();
    expect(screen.getByText(/Due Dec 1, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Travel to Japan progress" })).toHaveAttribute("aria-valuenow", "25");
  });

  it("marks completed, archived and overdue goals", async () => {
    await renderServer(<ul><GoalCard goal={goal({ saved: "1200.00", archived: true, deadline: "2026-09-01" })} currency="USD" today={today} /></ul>);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    cleanup();
    await renderServer(<ul><GoalCard goal={goal({ deadline: "2026-09-01" })} currency="USD" today={today} /></ul>);
    expect(screen.getByText(/Overdue since Sep 1, 2026/)).toBeInTheDocument();
  });
});

describe("GoalsManager", () => {
  it("shows an empty state that opens the add form", async () => {
    const user = userEvent.setup();
    await renderServer(<GoalsManager goals={[]} deletedGoals={[]} inHousehold={false} today={today} />);
    expect(screen.getByText("No goals yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect(await screen.findByRole("dialog", { name: "Add goal" })).toBeInTheDocument();
  });

  it("totals the open goals and filters by status", async () => {
    const user = userEvent.setup();
    await renderServer(
      <GoalsManager
        deletedGoals={[]}
        today={today}
        inHousehold={false}
        goals={[
          goal({ id: "a", name: "Alpha", saved: "100.00", targetAmount: "400.00" }),
          goal({ id: "b", name: "Beta", saved: "50.00", targetAmount: "50.00" }),
          goal({ id: "c", name: "Gamma", archived: true, saved: "999.00" }),
        ]}
      />,
    );
    const totals = screen.getByLabelText("Goals summary");
    expect(within(totals).getByText("$150.00")).toBeInTheDocument();
    expect(within(totals).getByText("$450.00")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Whose goals" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.getByText("Beta")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("shows an empty message for a filter without goals and filters by owner in a household", async () => {
    const user = userEvent.setup();
    await renderServer(
      <GoalsManager
        deletedGoals={[]}
        today={today}
        inHousehold
        goals={[
          goal({ id: "a", name: "Alpha" }),
          goal({ id: "b", name: "Beta", shared: true, owner: { id: "u2", name: "Ben", isMine: false } }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Shared with me" }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText("No archived goals")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Active" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("GoalForm", () => {
  it("creates a goal with its target, deadline and appearance", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<GoalForm inHousehold={false} onDone={onDone} />);
    await user.type(screen.getByLabelText("Name"), "New car");
    await user.type(screen.getByLabelText("Target ($)"), "15000");
    fireEvent.change(screen.getByLabelText("Deadline (optional)"), { target: { value: "2099-05-01" } });
    await user.click(screen.getByLabelText("car"));
    await user.click(screen.getByLabelText("#8e6bbf"));
    expect(screen.queryByRole("checkbox", { name: "Share with my household" })).not.toBeInTheDocument();
    expect(screen.getByText(/Join a household/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createGoal).toHaveBeenCalledWith({
      name: "New car",
      targetAmount: "15000.00",
      deadline: "2099-05-01",
      color: "#8e6bbf",
      icon: "car",
      shared: false,
      note: null,
    });
  });

  it("shares with the household, shows server errors and validates the name", async () => {
    const user = userEvent.setup();
    actions.createGoal.mockResolvedValueOnce({ ok: false, error: "Deadline must be today or later", fieldErrors: { deadline: ["Deadline must be today or later"] } });
    await renderServer(<GoalForm inHousehold onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Trip");
    await user.type(screen.getByLabelText("Target ($)"), "10");
    await user.click(screen.getByRole("checkbox", { name: "Share with my household" }));
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect((await screen.findAllByText("Deadline must be today or later")).length).toBeGreaterThan(0);
    expect(actions.createGoal).toHaveBeenCalledWith(expect.objectContaining({ shared: true }));
  });

  it("edits an existing goal", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(
      <GoalForm
        inHousehold={false}
        onDone={onDone}
        goal={{ id: goalId, name: "Trip", targetAmount: "100.00", deadline: "", color: "#ffd100", icon: "plane", shared: true, note: "" }}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Share with my household" })).toBeEnabled();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Trip 2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.updateGoal).toHaveBeenCalledWith(goalId, expect.objectContaining({ name: "Trip 2", shared: true }));
  });
});

describe("GoalContributionForm", () => {
  const base = { goal: { id: goalId, name: "Travel to Japan", completed: false }, accounts };

  it("adds money from an account", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<GoalContributionForm {...base} type="deposit" onDone={onDone} />);
    await pickOption(user, "From account", "Bank");
    await user.type(screen.getByLabelText("Amount ($)"), "75.5");
    await user.type(screen.getByLabelText("Note"), "bonus");
    await user.click(screen.getByRole("button", { name: "Add money" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.addGoalContribution).toHaveBeenCalledWith(
      expect.objectContaining({ goalId, type: "deposit", accountId: accounts[1].id, amount: "75.50", note: "bonus" }),
    );
  });

  it("makes the deposit recurring", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<GoalContributionForm {...base} type="deposit" onDone={onDone} />);
    await user.type(screen.getByLabelText("Amount ($)"), "200");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    await user.click(screen.getByRole("button", { name: "Add recurring deposit" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.createRecurringRule).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "goal", goalId, accountId: accounts[0].id, amount: "200.00", frequency: "monthly", intervalCount: "1", endDate: "" }),
    );
    expect(actions.addGoalContribution).not.toHaveBeenCalled();
  });

  it("splits server errors between the repeat fields and the form", async () => {
    const user = userEvent.setup();
    actions.createRecurringRule.mockResolvedValueOnce({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { intervalCount: ["Must be at least 1"], startDate: ["Enter a valid date"] },
    });
    await renderServer(<GoalContributionForm {...base} type="deposit" onDone={vi.fn()} />);
    await user.type(screen.getByLabelText("Amount ($)"), "200");
    await user.click(screen.getByRole("checkbox", { name: "Repeat this automatically" }));
    await user.click(screen.getByRole("button", { name: "Add recurring deposit" }));
    expect(await screen.findByText("Must be at least 1")).toBeInTheDocument();
    expect(screen.getAllByText("Enter a valid date").length).toBeGreaterThan(0);
  });

  it("takes money out with a hint and shows server errors", async () => {
    const user = userEvent.setup();
    actions.addGoalContribution.mockResolvedValueOnce({ ok: false, error: "No", fieldErrors: { amount: ["You can take out at most $10.00"] } });
    await renderServer(<GoalContributionForm {...base} type="withdrawal" withdrawable={10} onDone={vi.fn()} />);
    expect(screen.getByLabelText("To account")).toBeInTheDocument();
    expect(screen.getByText("You can take out up to $10.00.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Repeat this automatically" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Amount ($)"), "50");
    await user.click(screen.getByRole("button", { name: "Take money out" }));
    expect((await screen.findAllByText("You can take out at most $10.00")).length).toBeGreaterThan(0);
  });

  it("tells that the goal is complete but still takes money, and edits a contribution", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    await renderServer(<GoalContributionForm {...base} goal={{ ...base.goal, completed: true }} type="deposit" onDone={onDone} />);
    expect(screen.getByText(/already reached its target/)).toBeInTheDocument();
    cleanup();
    await renderServer(
      <GoalContributionForm
        {...base}
        type="deposit"
        contribution={{ id: "c1", accountId: accounts[1].id, amount: "20.00", date: "2026-10-01", note: "x" }}
        onDone={onDone}
      />,
    );
    expect(screen.queryByText(/already reached/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Repeat this automatically" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Amount ($)"));
    await user.type(screen.getByLabelText("Amount ($)"), "25");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(actions.updateGoalContribution).toHaveBeenCalledWith("c1", { accountId: accounts[1].id, amount: "25.00", date: "2026-10-01", note: "x" });
  });
});

describe("GoalDetail", () => {
  const contribution = (extra: Partial<GoalContributionItem> = {}): GoalContributionItem => ({
    id: "c1",
    type: "deposit",
    amount: "250.00",
    date: "2026-10-05",
    note: "first",
    account: { id: accounts[0].id, name: "Cash" },
    recurring: false,
    by: { id: "u1", name: "Ann", isMine: true },
    ...extra,
  });
  const setup = async (props: Partial<Parameters<typeof GoalDetail>[0]> = {}) =>
    await renderServer(
      <GoalDetail
        goal={goal()}
        contributors={[]}
        contributions={[contribution()]}
        history={[{ date: "2026-10-05", saved: "250.00" }]}
        accounts={accounts}
        inHousehold={false}
        today={today}
        {...props}
      />,
    );

  it("shows the numbers, the progress chart and the contributions", async () => {
    await setup({ goal: goal({ deadline: "2027-01-09", note: "Cherry blossoms" }) });
    expect(screen.getByRole("heading", { level: 1, name: "Travel to Japan" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Remaining").nextElementSibling).toHaveTextContent("$750.00");
    expect(screen.getByText(/Put aside/)).toHaveTextContent("$250.00");
    expect(screen.getByText(/Recently the goal gets about \$83\.33 a month/)).toBeInTheDocument();
    expect(screen.getByText("Cherry blossoms")).toBeInTheDocument();
    const chart = screen.getByTestId("history-chart");
    expect(chart).toHaveAttribute("data-target", "1000");
    expect(chart.getAttribute("data-points")).toBe("Oct 5, 2026:250|Oct 11, 2026:250");
    const [list] = screen.getAllByRole("list", { name: "Contributions" });
    expect(within(list).getByText("+$250.00")).toBeInTheDocument();
    expect(within(list).getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("Who saved")).not.toBeInTheDocument();
  });

  it("explains empty states", async () => {
    await setup({ goal: goal({ saved: "0.00", mySaved: "0.00", used: false }), contributions: [], history: [] });
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(screen.getByText("No money has been added to this goal yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take money out" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    cleanup();
    await setup({ accounts: [] });
    expect(screen.queryByRole("button", { name: "Add money" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile → Accounts" })).toBeInTheDocument();
  });

  it("shows who saved on a shared goal and hides owner actions from members", async () => {
    const contributors: GoalContributor[] = [
      { userId: "u1", name: "Ann", isMe: true, saved: "150.00" },
      { userId: "u2", name: "Ben", isMe: false, saved: "100.00" },
    ];
    await setup({
      goal: goal({ shared: true, owner: { id: "u2", name: "Ben", isMine: false }, mySaved: "150.00" }),
      contributors,
      contributions: [contribution({ by: { id: "u2", name: "Ben", isMine: false }, account: null })],
    });
    expect(screen.getByText("Who saved")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Ben's share of the goal" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("Ben's goal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit deposit/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take money out" })).toBeInTheDocument();
  });

  it("marks completed, overdue and archived goals", async () => {
    await setup({ goal: goal({ saved: "1300.00", archived: true }) });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Over target by").nextElementSibling).toHaveTextContent("$300.00");
    expect(screen.queryByRole("button", { name: "Add money" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByText(/Archived goals do not take new money/)).toBeInTheDocument();
    cleanup();
    await setup({ goal: goal({ deadline: "2026-09-01" }) });
    expect(screen.getByText(/Overdue since/)).toBeInTheDocument();
    expect(screen.queryByText(/Put aside/)).not.toBeInTheDocument();
  });

  it("adds, edits and takes out money through dialogs", async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(screen.getByRole("button", { name: "Add money" }));
    const add = await screen.findByRole("dialog", { name: "Add money" });
    await user.type(within(add).getByLabelText("Amount ($)"), "10");
    await user.click(within(add).getByRole("button", { name: "Add money" }));
    await waitFor(() => expect(actions.addGoalContribution).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add money" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Take money out" }));
    expect(await screen.findByText("You can take out up to $250.00.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getAllByRole("button", { name: /^Edit deposit/ })[0]);
    const edit = await screen.findByRole("dialog", { name: "Edit contribution" });
    expect(within(edit).getByLabelText("Amount ($)")).toHaveValue("250.00");
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.updateGoalContribution).toHaveBeenCalledWith("c1", expect.objectContaining({ amount: "250.00" })));
  });

  it("edits the goal and archives it", async () => {
    const user = userEvent.setup();
    await setup({ goal: goal({ deadline: "2027-01-09" }) });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit goal" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Travel to Japan");
    expect(within(dialog).getByLabelText("Deadline (optional)")).toHaveValue("2027-01-09");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.updateGoal).toHaveBeenCalledWith(goalId, expect.objectContaining({ name: "Travel to Japan" })));

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(actions.setGoalArchived).toHaveBeenCalledWith(goalId, true);
    actions.setGoalArchived.mockResolvedValueOnce({ ok: false, error: "This item no longer exists." });
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("This item no longer exists.")).toBeInTheDocument();
  });

  it("blocks deleting a goal with money and deletes an empty one", async () => {
    const user = userEvent.setup();
    await setup();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByText(/take all the money out first/)).toBeInTheDocument();
    cleanup();

    await setup({ goal: goal({ saved: "0.00", mySaved: "0.00" }) });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete goal" });
    expect(dialog).toHaveTextContent("Its history is kept");
    actions.deleteGoal.mockResolvedValueOnce({ ok: false, error: "This goal still has money in it." });
    await user.click(within(dialog).getByRole("button", { name: "Delete goal" }));
    expect(await within(dialog).findByText("This goal still has money in it.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(actions.push).toHaveBeenCalledWith("/goals"));
    cleanup();

    await setup({ goal: goal({ saved: "0.00", mySaved: "0.00", used: false }) });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete goal" })).toHaveTextContent("This cannot be undone");
  });

  it("deletes one of my contributions after confirming", async () => {
    const user = userEvent.setup();
    await setup({ contributions: [contribution({ type: "withdrawal", recurring: true })] });
    await user.click(screen.getByRole("button", { name: /^Delete withdrawal/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete contribution" });
    expect(dialog).toHaveTextContent("The balance of Cash is corrected");
    actions.deleteGoalContribution.mockResolvedValueOnce({ ok: false, error: "That would leave less in the goal than you already took out." });
    await user.click(within(dialog).getByRole("button", { name: "Delete contribution" }));
    expect(await within(dialog).findByText(/less in the goal/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete contribution" }));
    await waitFor(() => expect(actions.deleteGoalContribution).toHaveBeenCalledTimes(2));
    expect(actions.deleteGoalContribution).toHaveBeenLastCalledWith("c1");
  });
});

describe("Deleted goals", () => {
  const deleted = (extra: Partial<DeletedGoalItem> = {}): DeletedGoalItem => ({
    id: goalId,
    name: "Old trip",
    icon: "plane",
    color: "#ffd100",
    deletedAt: new Date("2026-10-01T10:00:00Z"),
    canDeletePermanently: true,
    ...extra,
  });

  it("is only a filter when something was deleted, and lists the goals there", async () => {
    const user = userEvent.setup();
    const { rerender } = await renderServer(<GoalsManager goals={[goal()]} deletedGoals={[]} inHousehold={false} today={today} />);
    expect(screen.queryByRole("button", { name: "Deleted" })).not.toBeInTheDocument();
    await rerenderServer(rerender, <GoalsManager goals={[goal()]} deletedGoals={[deleted()]} inHousehold={false} today={today} />);
    await user.click(screen.getByRole("button", { name: "Deleted" }));
    expect(screen.getByText("Old trip")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Whose goals" })).not.toBeInTheDocument();
  });

  it("shows deleted goals even when no other goal exists", async () => {
    const user = userEvent.setup();
    await renderServer(<GoalsManager goals={[]} deletedGoals={[deleted()]} inHousehold={false} today={today} />);
    expect(screen.queryByText("No goals yet")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deleted" }));
    expect(screen.getByText("Old trip")).toBeInTheDocument();
  });

  it("restores a goal and reports a failure", async () => {
    const user = userEvent.setup();
    actions.restoreGoal.mockResolvedValueOnce({ ok: false, error: "Not found" });
    await renderServer(<DeletedGoalList goals={[deleted()]} />);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(actions.restoreGoal).toHaveBeenCalledWith(goalId);
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("removes a goal permanently after confirming, and hides the button when balances would change", async () => {
    const user = userEvent.setup();
    actions.deleteGoalPermanently.mockResolvedValueOnce({ ok: false, error: "Still linked" });
    const { rerender } = await renderServer(<DeletedGoalList goals={[deleted()]} />);
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete goal permanently" });
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    expect(actions.deleteGoalPermanently).toHaveBeenCalledWith(goalId);
    expect(await within(dialog).findByText("Still linked")).toBeInTheDocument();

    actions.deleteGoalPermanently.mockResolvedValueOnce({ ok: true });
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await rerenderServer(rerender, <DeletedGoalList goals={[deleted({ canDeletePermanently: false })]} />);
    expect(screen.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();
  });
});
