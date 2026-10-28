import { z } from "zod";
import { THEMES } from "@/lib/theme";
import { msg } from "@/lib/i18n/translate";

export const themeSchema = z.object({
  theme: z.enum(THEMES, msg("Choose a theme")),
});

export type ThemeInput = z.input<typeof themeSchema>;
