import { z } from "zod";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { CATEGORY_ICON_KEYS } from "@/lib/category-icons";
import { msg, msgWith } from "@/lib/i18n/translate";

const CATEGORY_NAME_MAX = 50;
const CATEGORY_TYPES = ["income", "expense"] as const;

const nameField = z
  .string()
  .trim()
  .min(1, msg("Name is required"))
  .max(CATEGORY_NAME_MAX, msgWith("Name must be at most {max} characters", { max: CATEGORY_NAME_MAX }));

const appearance = {
  name: nameField,
  color: z.enum(CATEGORY_COLORS, msg("Choose a color")),
  icon: z.enum(CATEGORY_ICON_KEYS, msg("Choose an icon")),
};

export const createCategorySchema = z.object({
  type: z.enum(CATEGORY_TYPES, msg("Choose income or expense")),
  ...appearance,
});

/** The type is locked after creation, so it is not part of the update input. */
export const updateCategorySchema = z.object(appearance);

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
