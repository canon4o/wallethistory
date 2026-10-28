/** The one fixed list of category icon keys. Stored in `categories.icon`. */
export const CATEGORY_ICON_KEYS = [
  "banknote",
  "wallet",
  "piggy-bank",
  "credit-card",
  "receipt",
  "briefcase",
  "laptop",
  "gift",
  "undo-2",
  "utensils",
  "coffee",
  "shopping-cart",
  "shopping-bag",
  "home",
  "zap",
  "wifi",
  "smartphone",
  "car",
  "bus",
  "plane",
  "heart-pulse",
  "dumbbell",
  "film",
  "gamepad-2",
  "book-open",
  "graduation-cap",
  "baby",
  "paw-print",
  "wrench",
  "tag",
  "ellipsis",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const DEFAULT_CATEGORY_ICON: CategoryIconKey = "tag";

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === "string" && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}
