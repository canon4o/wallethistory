// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { StatCard } from "@/components/admin/StatCard";
import { UserBreakdown } from "@/components/admin/UserBreakdown";
import { LoginsTable } from "@/components/admin/LoginsTable";
import { describeUserAgent } from "@/lib/user-agent";
import { translator } from "@/lib/i18n/translate";
import { UsersTable } from "@/components/admin/UsersTable";
import { NavLinks } from "@/components/layout/NavLinks";
import type { AdminLoginRow, AdminUserRow } from "@/lib/data/admin";
import { renderServer, rerenderServer } from "./helpers/server-render";

const pathname = vi.hoisted(() => ({ value: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

afterEach(() => {
  cleanup();
  pathname.value = "/admin";
});

describe("describeUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605", "Safari on macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:120) Firefox/120", "Firefox on Linux"],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537", "Chrome on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604", "Safari on iOS"],
    ["Mozilla/5.0 Chrome/120 OPR/100 (Windows)", "Opera on Windows"],
    ["curl/8.0", "Other browser"],
  ])("describes %s", (agent, expected) => {
    expect(describeUserAgent(agent, translator("en"))).toBe(expected);
  });

  it("handles a missing user agent", async () => {
    expect(describeUserAgent(null, translator("en"))).toBe("Unknown");
  });
});

describe("NavLinks", () => {
  it("shows the Admin group only to admins", async () => {
    const { rerender } = await renderServer(<NavLinks />);
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    await rerenderServer(rerender, <NavLinks isAdmin />);
    expect(screen.getByRole("button", { name: "Admin" })).toBeTruthy();
  });

  it("expands the Admin group on an admin page and marks only the current item", async () => {
    pathname.value = "/admin/users/abc";
    await renderServer(<NavLinks isAdmin />);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("marks Overview only on /admin itself", async () => {
    await renderServer(<NavLinks isAdmin />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("expands the Reports group on a report page", async () => {
    pathname.value = "/reports/spending";
    await renderServer(<NavLinks />);
    expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Balance" })).toHaveAttribute("href", "/reports/balance");
  });
});

describe("AdminPagination", () => {
  const hrefFor = (page: number) => `/admin/users?page=${page}`;

  it("renders nothing when there are no results", async () => {
    const { container } = await renderServer(<AdminPagination page={1} pageCount={1} total={0} noun="user" hrefFor={hrefFor} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the neighbouring pages and pluralises", async () => {
    await renderServer(<AdminPagination page={2} pageCount={3} total={60} noun="user" hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute("href", "/admin/users?page=1");
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/admin/users?page=3");
    expect(screen.getByText("Page 2 of 3 · 60 users")).toBeInTheDocument();
  });

  it("disables the ends and uses the singular", async () => {
    await renderServer(<AdminPagination page={1} pageCount={1} total={1} noun="user" hrefFor={hrefFor} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Page 1 of 1 · 1 user")).toBeInTheDocument();
  });
});

describe("StatCard trend", () => {
  it("shows the change and whether it is good", async () => {
    const { rerender } = await renderServer(<StatCard label="New" value={5} trend={{ current: 5, previous: 2, period: "last week" }} />);
    expect(screen.getByText("+3")).toBeInTheDocument();
    await rerenderServer(rerender, <StatCard label="Failed" value={1} trend={{ current: 1, previous: 4, period: "yesterday", lowerIsBetter: true }} />);
    expect(screen.getByText("-3").closest("p")).toHaveClass("text-income-text");
    await rerenderServer(rerender, <StatCard label="Same" value={1} trend={{ current: 1, previous: 1, period: "yesterday" }} />);
    expect(screen.getByText("No change vs yesterday")).toBeInTheDocument();
  });
});

describe("UserBreakdown", () => {
  it("lists active, not verified and blocked users with shares", async () => {
    await renderServer(<UserBreakdown overview={{ totalUsers: 10, active: 5, unverified: 4, blocked: 1 }} />);
    expect(screen.getByRole("img", { name: "Users: 5 active, 4 not verified, 1 blocked" })).toBeInTheDocument();
    expect(screen.getByText("50%", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Not verified" })).toHaveAttribute("href", "/admin/users?status=unverified");
    expect(screen.getByRole("link", { name: "Blocked" })).toHaveAttribute("href", "/admin/users?status=blocked");
  });

  it("says so when there are no users", async () => {
    await renderServer(<UserBreakdown overview={{ totalUsers: 0, active: 0, unverified: 0, blocked: 0 }} />);
    expect(screen.getByText("No users yet.")).toBeInTheDocument();
  });
});

describe("tables", () => {
  const login = (overrides: Partial<AdminLoginRow>): AdminLoginRow => ({
    id: crypto.randomUUID(),
    createdAt: new Date("2026-10-10T17:26:00Z"),
    userId: "11111111-1111-4111-8111-111111111111",
    userName: "Ann",
    email: "ann@test.local",
    success: true,
    reason: null,
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/120",
    ...overrides,
  });

  it("shows login results, reasons and unknown accounts", async () => {
    await renderServer(
      <LoginsTable
        rows={[
          login({}),
          login({ success: false, reason: "bad_password" }),
          login({ success: false, reason: "mystery" }),
          login({ userId: null, userName: null, email: "ghost@test.local", success: false, reason: "unknown_email", ip: null, userAgent: null }),
        ]}
      />,
    );
    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByText("Wrong password")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Unknown email")).toBeInTheDocument();
    expect(screen.getByText("No account")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Ann" })[0]).toHaveAttribute(
      "href",
      "/admin/users/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.getAllByText("Oct 10, 2026, 17:26 UTC")).toHaveLength(4);
  });

  it("shows times in the viewing admin's timezone", async () => {
    await renderServer(<LoginsTable rows={[login({})]} timezone="Asia/Tokyo" />);
    expect(screen.getAllByText("Oct 11, 2026, 02:26 GMT+9").length).toBeGreaterThan(0);
  });

  it("can hide the user column", async () => {
    await renderServer(<LoginsTable rows={[login({})]} showUser={false} />);
    expect(screen.queryByRole("columnheader", { name: "User" })).toBeNull();
  });

  it("shows user badges and last login", async () => {
    const user = (overrides: Partial<AdminUserRow>): AdminUserRow => ({
      id: crypto.randomUUID(),
      name: "Ann",
      email: "ann@test.local",
      role: "user",
      verified: true,
      blocked: false,
      lastLoginAt: null,
      createdAt: new Date("2026-10-01T08:00:00Z"),
      ...overrides,
    });
    await renderServer(
      <UsersTable
        rows={[
          user({ name: "Root", role: "admin", lastLoginAt: new Date("2026-10-10T17:26:00Z") }),
          user({ name: "Bob", blocked: true, verified: false }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Admin")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Oct 10, 2026, 17:26 UTC")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Blocked")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Not verified")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Never")).toBeInTheDocument();
  });
});
