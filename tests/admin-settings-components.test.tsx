// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { AnnouncementHistory } from "@/components/admin/AnnouncementHistory";
import { ExportUserButton } from "@/components/admin/ExportUserButton";
import { SignupToggle } from "@/components/admin/SignupToggle";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { DISMISSED_ANNOUNCEMENT_COOKIE } from "@/lib/announcement";
import { renderServer } from "./helpers/server-render";

const actions = vi.hoisted(() => ({
  setSignupEnabled: vi.fn(),
  publishAnnouncement: vi.fn(),
  clearAnnouncement: vi.fn(),
}));
vi.mock("@/lib/actions/admin", () => actions);

beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("SignupToggle", () => {
  it("turns signups off when they are on", async () => {
    await renderServer(<SignupToggle enabled />);
    expect(screen.getByText("Anyone can create an account.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn signups off" }));
    expect(actions.setSignupEnabled).toHaveBeenCalledWith({ enabled: false });
  });

  it("turns signups on when they are off", async () => {
    await renderServer(<SignupToggle enabled={false} />);
    expect(screen.getByText(/New signups are closed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn signups on" }));
    expect(actions.setSignupEnabled).toHaveBeenCalledWith({ enabled: true });
  });

  it("shows why it failed", async () => {
    actions.setSignupEnabled.mockResolvedValue({ ok: false, error: "Something went wrong." });
    await renderServer(<SignupToggle enabled />);
    await userEvent.click(screen.getByRole("button", { name: "Turn signups off" }));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });
});

describe("AnnouncementForm", () => {
  it("publishes a message with its style and counts characters", async () => {
    await renderServer(<AnnouncementForm current={null} />);
    expect(screen.getByText(/No banner is showing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove banner" })).toBeNull();
    await userEvent.type(screen.getByLabelText("Message"), "Maintenance");
    expect(screen.getByText("Plain text, 11 of 280 characters.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Style"), "warning");
    await userEvent.click(screen.getByRole("button", { name: "Publish banner" }));
    expect(actions.publishAnnouncement).toHaveBeenCalledWith({ message: "Maintenance", level: "warning" });
    expect(await screen.findByText("Banner published.")).toBeInTheDocument();
  });

  it("shows validation errors on the message", async () => {
    actions.publishAnnouncement.mockResolvedValue({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { message: ["Enter a message"] },
    });
    await renderServer(<AnnouncementForm current={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish banner" }));
    expect(await screen.findByText("Enter a message")).toBeInTheDocument();
  });

  it("removes the current banner", async () => {
    await renderServer(<AnnouncementForm current={{ message: "Hello", level: "info" }} />);
    expect(screen.getByLabelText("Message")).toHaveValue("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Remove banner" }));
    expect(actions.clearAnnouncement).toHaveBeenCalled();
    expect(await screen.findByText("Banner removed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("shows why removing failed", async () => {
    actions.clearAnnouncement.mockResolvedValue({ ok: false, error: "Something went wrong." });
    await renderServer(<AnnouncementForm current={{ message: "Hello", level: "warning" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove banner" }));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });
});

describe("AnnouncementBanner", () => {
  it("shows the message as plain text and remembers a dismissal in a cookie", async () => {
    await renderServer(<AnnouncementBanner id="a1" message="<b>Heads up</b>" level="warning" />);
    expect(screen.getByRole("status")).toHaveTextContent("<b>Heads up</b>");
    expect(screen.getByRole("status").querySelector("b")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.cookie).toContain(`${DISMISSED_ANNOUNCEMENT_COOKIE}=a1`);
  });

  it("renders the information style too", async () => {
    await renderServer(<AnnouncementBanner id="a2" message="News" level="info" />);
    expect(screen.getByText("News")).toBeInTheDocument();
  });
});

describe("ExportUserButton", () => {
  it("posts the reason to the export route from a dialog", async () => {
    await renderServer(<ExportUserButton userId="u1" name="Ann" />);
    await userEvent.click(screen.getByRole("button", { name: "Export data" }));
    const reason = await screen.findByLabelText("Why is this export needed?");
    expect(reason).toBeRequired();
    const form = reason.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/admin/users/u1/export");
    expect(screen.getByRole("button", { name: "Download export" })).toBeInTheDocument();
  });

  it("closes the dialog with Cancel", async () => {
    await renderServer(<ExportUserButton userId="u1" name="Ann" />);
    await userEvent.click(screen.getByRole("button", { name: "Export data" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("AnnouncementHistory", () => {
  it("shows an empty state when nothing was published", async () => {
    await renderServer(<AnnouncementHistory rows={[]} />);
    expect(screen.getByText("No announcements yet")).toBeInTheDocument();
  });

  it("lists announcements with style, author and status", async () => {
    const base = { createdAt: new Date("2026-10-01T10:00:00Z") };
    await renderServer(
      <AnnouncementHistory
        rows={[
          { ...base, id: "a2", message: "Maintenance tonight", level: "warning", active: true, createdByEmail: "boss@test.local" },
          { ...base, id: "a1", message: "Welcome", level: "info", active: false, createdByEmail: null },
        ]}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Maintenance tonight")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Showing")).toBeInTheDocument();
    expect(screen.getByText("boss@test.local")).toBeInTheDocument();
    expect(screen.getByText("Information")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("Deleted admin")).toBeInTheDocument();
  });
});
