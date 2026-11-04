// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextHidden, useHideOnScroll } from "@/components/layout/useHideOnScroll";
import { showsQuickAdd } from "@/components/layout/quick-add-paths";

afterEach(cleanup);

describe("nextHidden", () => {
  it("hides when scrolling down and shows when scrolling up", () => {
    expect(nextHidden(false, 40, 400, 2000)).toBe(true);
    expect(nextHidden(true, -40, 360, 2000)).toBe(false);
  });
  it("ignores small movements", () => {
    expect(nextHidden(false, 3, 400, 2000)).toBe(false);
    expect(nextHidden(true, -3, 400, 2000)).toBe(true);
  });
  it("is always shown near the top and near the bottom", () => {
    expect(nextHidden(true, 40, 10, 2000)).toBe(false);
    expect(nextHidden(false, 40, 1990, 2000)).toBe(false);
  });
});

describe("useHideOnScroll", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0; // already ran, so nothing is pending
    });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });
  afterEach(() => vi.unstubAllGlobals());

  function scrollTo(y: number) {
    act(() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: y });
      window.dispatchEvent(new Event("scroll"));
    });
  }

  it("follows the scroll direction and calls onHide once when it hides", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const onHide = vi.fn();
    const { result } = renderHook(() => useHideOnScroll(onHide));
    expect(result.current).toBe(false);
    scrollTo(300);
    expect(result.current).toBe(true);
    scrollTo(500);
    expect(result.current).toBe(true);
    expect(onHide).toHaveBeenCalledTimes(1);
    scrollTo(450);
    expect(result.current).toBe(false);
  });
});

describe("showsQuickAdd", () => {
  it("shows on the main pages and their children only", () => {
    for (const path of ["/dashboard", "/transactions", "/budgets", "/goals", "/goals/abc"]) expect(showsQuickAdd(path)).toBe(true);
    for (const path of ["/reports/spending", "/profile/accounts", "/admin", "/goalsx"]) expect(showsQuickAdd(path)).toBe(false);
  });
});
