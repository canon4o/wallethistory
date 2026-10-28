import { msg } from "@/lib/i18n/translate";

export const ACCOUNT_TYPES = ["cash", "bank", "card", "savings", "other"] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: msg("Cash"),
  bank: msg("Bank"),
  card: msg("Card"),
  savings: msg("Savings"),
  other: msg("Other"),
};

/** Icon and color preselected in the form for each type (and used to backfill existing rows). */
export const ACCOUNT_TYPE_DEFAULTS: Record<AccountType, { icon: string; color: string }> = {
  cash: { icon: "banknote", color: "#9cca56" },
  bank: { icon: "landmark", color: "#337ab7" },
  card: { icon: "credit-card", color: "#ea9150" },
  savings: { icon: "piggy-bank", color: "#1aaaba" },
  other: { icon: "wallet", color: "#6b7c85" },
};
