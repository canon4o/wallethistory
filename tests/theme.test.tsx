// @vitest-environment jsdom
import { cleanup, screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { DEFAULT_THEME, THEMES, toTheme } from "@/lib/theme";
import { themeSchema } from "@/lib/validation/theme";

const mocks = vi.hoisted(() => ({ updateTheme: vi.fn() }));
vi.mock("@/lib/actions/users", () => ({ updateTheme: mocks.updateTheme }));

beforeEach(() => mocks.updateTheme.mockReset().mockResolvedValue({ ok: true }));
afterEach(cleanup);

describe("theme helpers", () => {
  it("defaults to system", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("accepts known themes and falls back for anything else", () => {
    for (const theme of THEMES) expect(toTheme(theme)).toBe(theme);
    expect(toTheme("blue")).toBe("system");
    expect(toTheme(undefined)).toBe("system");
  });

  it("validates the theme", () => {
    expect(themeSchema.safeParse({ theme: "dark" }).success).toBe(true);
    expect(themeSchema.safeParse({ theme: "sepia" }).success).toBe(false);
    expect(themeSchema.safeParse({}).success).toBe(false);
  });
});

describe("ThemeToggle", () => {
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("shows the current theme and what the click switches to", () => {
    render(<ThemeToggle theme="system" />);
    expect(screen.getByRole("button", { name: "Theme: System. Switch to Light" })).toBeInTheDocument();
  });

  it("cycles system, light, dark, applies the theme at once and saves it", async () => {
    render(<ThemeToggle theme="system" />);
    await userEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(mocks.updateTheme).toHaveBeenLastCalledWith({ theme: "light" });
    await userEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(mocks.updateTheme).toHaveBeenLastCalledWith({ theme: "dark" });
    await userEvent.click(screen.getByRole("button", { name: "Theme: Dark. Switch to System" }));
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(mocks.updateTheme).toHaveBeenLastCalledWith({ theme: "system" });
  });
});
