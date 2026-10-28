import { z } from "zod";
import { msg, msgWith } from "@/lib/i18n/translate";

const TAG_NAME_MAX = 50;

export const tagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg("Name is required"))
    .max(TAG_NAME_MAX, msgWith("Name must be at most {max} characters", { max: TAG_NAME_MAX })),
});

export type TagInput = z.input<typeof tagSchema>;
