/** The one fixed list of account icon keys. Stored in `accounts.icon`. */
export const ACCOUNT_ICON_KEYS = [
  "wallet",
  "banknote",
  "landmark",
  "credit-card",
  "piggy-bank",
  "briefcase",
  "home",
  "car",
  "plane",
  "smartphone",
  "gift",
  "tag",
] as const;

export type AccountIconKey = (typeof ACCOUNT_ICON_KEYS)[number];

export function isAccountIconKey(value: unknown): value is AccountIconKey {
  return typeof value === "string" && (ACCOUNT_ICON_KEYS as readonly string[]).includes(value);
}
