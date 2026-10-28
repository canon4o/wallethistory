// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, readableTextColor } from "@/lib/category-colors";
import {
  CATEGORY_ICON_KEYS,
  DEFAULT_CATEGORY_ICON,
  isCategoryIconKey,
} from "@/lib/category-icons";
import { CategoryBadge, CategoryIcon } from "@/components/categories/CategoryIcon";

describe("category icon keys", () => {
  it("is the fixed list of 31 unique keys, including the ones the signup trigger uses", () => {
    expect(CATEGORY_ICON_KEYS).toHaveLength(31);
    expect(new Set(CATEGORY_ICON_KEYS).size).toBe(31);
    for (const key of [
      "banknote", "laptop", "gift", "undo-2", "ellipsis", "utensils", "shopping-cart", "home",
      "zap", "car", "heart-pulse", "film", "shopping-bag", "graduation-cap", "plane",
    ]) {
      expect(CATEGORY_ICON_KEYS).toContain(key);
    }
    expect(CATEGORY_ICON_KEYS).toContain(DEFAULT_CATEGORY_ICON);
  });

  it("recognizes keys and rejects anything else", () => {
    expect(isCategoryIconKey("wallet")).toBe(true);
    expect(isCategoryIconKey("not-an-icon")).toBe(false);
    expect(isCategoryIconKey(undefined)).toBe(false);
    expect(isCategoryIconKey(42)).toBe(false);
  });
});

describe("CategoryIcon", () => {
  it("renders an icon for every allowed key", () => {
    for (const key of CATEGORY_ICON_KEYS) {
      const { container, unmount } = render(<CategoryIcon icon={key} />);
      expect(container.querySelector("svg"), key).not.toBeNull();
      unmount();
    }
  });

  it("renders a neutral fallback for an unknown key instead of crashing", () => {
    const { container } = render(<CategoryIcon icon="removed-icon" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("hides the icon from assistive technology", () => {
    const { container } = render(<CategoryIcon icon="tag" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CategoryBadge", () => {
  it("draws the icon on a colored rounded badge with readable contrast", () => {
    const { container } = render(<CategoryBadge icon="gift" color="#ffd100" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.style.backgroundColor).toBe("rgb(255, 209, 0)");
    expect(badge.style.color).toBe("rgb(26, 35, 38)");
    expect(badge).toHaveClass("rounded-lg", "size-8");
  });

  it("supports a large size", () => {
    const { container } = render(<CategoryBadge icon="gift" color="#337ab7" size="lg" />);
    expect(container.firstElementChild).toHaveClass("size-10");
  });
});

describe("category colors", () => {
  it("offers a palette of unique #rrggbb colors", () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
    for (const color of CATEGORY_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("picks dark text on light colors and white on dark ones", () => {
    expect(readableTextColor("#ffd100")).toBe("#1a2326"); // yellow
    expect(readableTextColor("#9cca56")).toBe("#1a2326"); // green
    expect(readableTextColor("#1aaaba")).toBe("#1a2326"); // teal
    expect(readableTextColor("#337ab7")).toBe("#ffffff"); // blue
    expect(readableTextColor("#8e6bbf")).toBe("#ffffff"); // purple
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#ffffff")).toBe("#1a2326");
  });
});
