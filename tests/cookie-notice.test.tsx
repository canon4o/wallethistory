// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CookieNotice } from "@/components/layout/CookieNotice";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("CookieNotice", () => {
  it("shows the notice until OK is clicked, then remembers the choice", async () => {
    const { unmount } = render(<CookieNotice />);
    expect(screen.getByRole("region", { name: "Cookie notice" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("region", { name: "Cookie notice" })).not.toBeInTheDocument();
    expect(localStorage.getItem("wh_cookie_notice_ok")).toBe("1");
    unmount();
    render(<CookieNotice />);
    expect(screen.queryByRole("region", { name: "Cookie notice" })).not.toBeInTheDocument();
  });
});
