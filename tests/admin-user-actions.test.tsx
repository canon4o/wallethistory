// @vitest-environment jsdom
import { translator } from "@/lib/i18n/translate";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditTable, describeDetail } from "@/components/admin/AuditTable";
import { UserActions } from "@/components/admin/UserActions";
import { UserSessions } from "@/components/admin/UserSessions";
import type { AdminAuditRow, AdminSessionRow } from "@/lib/data/admin";
import { renderServer } from "./helpers/server-render";

const actions = vi.hoisted(() => ({
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  changeUserRole: vi.fn(),
  deleteUser: vi.fn(),
  revokeUserSessions: vi.fn(),
  verifyUserEmail: vi.fn(),
  revokeUserSession: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/admin", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const user = { id: "u1", name: "Ann", email: "ann@test.local", role: "user" as const, blocked: false, verified: true };

beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset().mockResolvedValue({ ok: true });
  push.mockReset();
});
afterEach(cleanup);

describe("UserActions", () => {
  it("offers only the data export for the admin's own account", async () => {
    await renderServer(<UserActions user={user} isSelf />);
    expect(screen.getByText(/your own account/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Export data"]);
  });

  it("offers the data export next to the other actions", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    expect(screen.getByRole("button", { name: "Export data" })).toBeInTheDocument();
  });

  it("saves a changed role", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    const save = screen.getByRole("button", { name: "Save role" });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    await userEvent.click(save);
    expect(actions.changeUserRole).toHaveBeenCalledWith({ userId: "u1", role: "admin" });
  });

  it("shows the reason when an action fails", async () => {
    actions.changeUserRole.mockResolvedValue({ ok: false, error: "You no longer have admin access." });
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText("You no longer have admin access.")).toBeInTheDocument();
  });

  it("asks before blocking", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(actions.blockUser).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Block this user?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Block user" }));
    await waitFor(() => expect(actions.blockUser).toHaveBeenCalledWith({ userId: "u1" }));
  });

  it("unblocks a blocked user without a dialog", async () => {
    await renderServer(<UserActions user={{ ...user, blocked: true }} isSelf={false} />);
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(actions.unblockUser).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("offers email verification only for unverified users, after a confirmation", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    expect(screen.queryByRole("button", { name: "Verify email" })).toBeNull();
    cleanup();

    await renderServer(<UserActions user={{ ...user, verified: false }} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));
    expect(actions.verifyUserEmail).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Verify this email?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Verify email" }));
    await waitFor(() => expect(actions.verifyUserEmail).toHaveBeenCalledWith({ userId: "u1" }));
  });

  it("asks before signing a user out everywhere", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out everywhere?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(actions.revokeUserSessions).toHaveBeenCalledWith({ userId: "u1" }));
  });

  it("deletes only after the email is typed, then goes back to the list", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this user?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete user" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Type ann@test.local to confirm/), "ann@test.local");
    await userEvent.click(confirm);
    await waitFor(() => expect(actions.deleteUser).toHaveBeenCalledWith({ userId: "u1", confirmEmail: "ann@test.local" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users"));
  });

  it("shows a wrong confirmation email and stays on the page", async () => {
    actions.deleteUser.mockResolvedValue({
      ok: false,
      error: "That email does not match this user.",
      fieldErrors: { confirmEmail: ["That email does not match this user."] },
    });
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this user?" });
    await userEvent.type(within(dialog).getByLabelText(/Type/), "wrong@test.local");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
    expect(await within(dialog).findByText("That email does not match this user.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("cancelling the delete dialog clears what was typed", async () => {
    await renderServer(<UserActions user={user} isSelf={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this user?" });
    await userEvent.type(within(dialog).getByLabelText(/Type/), "abc");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));
    expect(await screen.findByLabelText(/Type/)).toHaveValue("");
  });
});

describe("UserSessions", () => {
  const session: AdminSessionRow = {
    id: "s1",
    createdAt: new Date("2026-10-10T10:00:00Z"),
    lastSeenAt: null,
    expiresAt: new Date("2026-11-10T10:00:00Z"),
    ip: null,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/120",
  };

  it("says when nobody is signed in", async () => {
    await renderServer(<UserSessions userId="u1" sessions={[]} canRevoke />);
    expect(screen.getByText("Not signed in anywhere")).toBeInTheDocument();
  });

  it("signs out one device", async () => {
    await renderServer(<UserSessions userId="u1" sessions={[session]} canRevoke />);
    expect(screen.getByText("Firefox on Linux")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(actions.revokeUserSession).toHaveBeenCalledWith({ userId: "u1", sessionId: "s1" });
  });

  it("shows why a sign-out failed", async () => {
    actions.revokeUserSession.mockResolvedValue({ ok: false, error: "This session no longer exists." });
    await renderServer(<UserSessions userId="u1" sessions={[session]} canRevoke />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("This session no longer exists.")).toBeInTheDocument();
  });

  it("has no sign-out buttons without permission", async () => {
    await renderServer(<UserSessions userId="u1" sessions={[session]} canRevoke={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("AuditTable", () => {
  const row = (overrides: Partial<AdminAuditRow>): AdminAuditRow => ({
    id: crypto.randomUUID(),
    createdAt: new Date("2026-10-10T17:26:00Z"),
    actorEmail: "root@test.local",
    actorId: "a1",
    targetUserId: "u1",
    targetEmail: "ann@test.local",
    action: "blocked",
    detail: null,
    ...overrides,
  });

  it("labels actions, links live users, and shows details", async () => {
    await renderServer(
      <AuditTable
        rows={[
          row({ action: "role_changed", detail: { from: "user", to: "admin" } }),
          row({ action: "deleted", detail: { transfersRemoved: 2 } }),
          row({ action: "signup_disabled", targetUserId: null, targetEmail: null }),
          row({ action: "something_new", targetUserId: null, targetEmail: "gone@test.local" }),
        ]}
      />,
    );
    expect(screen.getByText("Changed role")).toBeInTheDocument();
    expect(screen.getByText("user → admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ann@test.local" })).toHaveAttribute("href", "/admin/users/u1");
    expect(screen.getByText("2 incoming transfers removed")).toBeInTheDocument();
    expect(screen.getByText("Turned signups off")).toBeInTheDocument();
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByText("something_new")).toBeInTheDocument();
    expect(screen.getByText("gone@test.local")).toBeInTheDocument();
  });

  it("describes details safely", async () => {
    const t = translator("en");
    expect(describeDetail("blocked", null, t)).toBe("");
    expect(describeDetail("blocked", { secret: "x" }, t)).toBe("");
    expect(describeDetail("sessions_revoked", { count: 3 }, t)).toBe("3 sessions");
    expect(describeDetail("deleted", { transfersRemoved: 0 }, t)).toBe("");
    expect(
      describeDetail("regional_settings_changed", {
        currency: { from: "USD", to: "EUR" },
        timezone: { from: "UTC", to: "UTC" },
      }, t),
    ).toBe("USD → EUR");
    expect(
      describeDetail("regional_settings_changed", {
        currency: { from: "EUR", to: "EUR" },
        timezone: { from: "UTC", to: "Europe/Sofia" },
      }, t),
    ).toBe("UTC → Europe/Sofia");
    expect(describeDetail("regional_settings_changed", {}, t)).toBe("");
    expect(describeDetail("data_exported", { reason: "User asked" }, t)).toBe("Reason: User asked");
    expect(describeDetail("announcement_published", { level: "info", message: "Hi" }, t)).toBe("info: Hi");
  });
});
