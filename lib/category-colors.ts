/** Preset palette for categories (the same colors the signup trigger uses for default categories). */
export const CATEGORY_COLORS = [
  "#1aaaba", // teal (primary)
  "#337ab7", // blue (accounts)
  "#9cca56", // green (income)
  "#df697f", // red (expense)
  "#ea9150", // orange (planning)
  "#ffd100", // yellow (goals)
  "#8e6bbf", // purple
  "#6b7c85", // slate
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const DEFAULT_CATEGORY_COLOR: CategoryColor = CATEGORY_COLORS[0];

const DARK_TEXT = "#1a2326";
const LIGHT_TEXT = "#ffffff";

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((start) => channel(parseInt(value.slice(start, start + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Readable icon/text color (dark or white) for a `#rrggbb` background: whichever has more contrast. */
export function readableTextColor(hex: string): string {
  const background = luminance(hex);
  return contrast(background, luminance(DARK_TEXT)) >= contrast(background, luminance(LIGHT_TEXT))
    ? DARK_TEXT
    : LIGHT_TEXT;
}
