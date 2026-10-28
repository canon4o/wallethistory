import { z } from "zod";
import { ACCOUNT_ICON_KEYS } from "@/lib/account-icons";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { nonNegativeMoney } from "./money";
import { msg, msgWith } from "@/lib/i18n/translate";

const ACCOUNT_NAME_MAX = 100;

export const accountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg("Name is required"))
    .max(ACCOUNT_NAME_MAX, msgWith("Name must be at most {max} characters", { max: ACCOUNT_NAME_MAX })),
  type: z.enum(ACCOUNT_TYPES, msg("Choose an account type")),
  color: z.enum(CATEGORY_COLORS, msg("Choose a color")),
  icon: z.enum(ACCOUNT_ICON_KEYS, msg("Choose an icon")),
  initialBalance: nonNegativeMoney,
  /** Preselect this account on new transactions. Setting it clears the flag on the previous default. */
  isDefault: z.boolean().default(false),
});

export type AccountInput = z.input<typeof accountSchema>;
