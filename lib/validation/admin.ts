import { z } from "zod";
import { idSchema } from "./common";
import { msg, msgWith } from "@/lib/i18n/translate";

// URL search params of the admin pages. Invalid or empty values are ignored instead of
// failing the page (same approach as the transaction filters).

type SearchParams = Record<string, string | string[] | undefined>;

export const USER_STATUS_FILTERS = ["all", "admins", "blocked", "unverified"] as const;
export const LOGIN_RESULT_FILTERS = ["all", "success", "failed"] as const;

export const OVERVIEW_RANGES = [7, 30, 90] as const;
export const DEFAULT_OVERVIEW_RANGE = 30;

export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];
export type LoginResultFilter = (typeof LOGIN_RESULT_FILTERS)[number];

export type AdminUserFilters = { q?: string; status: UserStatusFilter; page: number };
export type AdminLoginFilters = { result: LoginResultFilter; userId?: string; page: number };

const searchText = z.string().trim().min(1).max(100);
const pageNumber = z.coerce.number().int().min(1).max(100_000);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, params: SearchParams, key: string): T | undefined {
  const raw = first(params[key]);
  if (!raw) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function parseAdminUserFilters(params: SearchParams): AdminUserFilters {
  return {
    q: pick(searchText, params, "q"),
    status: pick(z.enum(USER_STATUS_FILTERS), params, "status") ?? "all",
    page: pick(pageNumber, params, "page") ?? 1,
  };
}

export function parseAdminLoginFilters(params: SearchParams): AdminLoginFilters {
  return {
    result: pick(z.enum(LOGIN_RESULT_FILTERS), params, "result") ?? "all",
    userId: pick(idSchema, params, "user"),
    page: pick(pageNumber, params, "page") ?? 1,
  };
}

export function parseOverviewRange(params: SearchParams): OverviewRange {
  const raw = Number(first(params.range));
  return OVERVIEW_RANGES.find((range) => range === raw) ?? DEFAULT_OVERVIEW_RANGE;
}

/** Query string for a list page; empty values and defaults are left out. */
export function adminQuery(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === "" || value === "all") continue;
    if (key === "page" && Number(value) <= 1) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

// --- Admin actions ---

export const userIdSchema = z.object({ userId: idSchema });

export const changeRoleSchema = z.object({
  userId: idSchema,
  role: z.enum(["user", "admin"], msg("Choose a role")),
});

export const deleteUserSchema = z.object({
  userId: idSchema,
  confirmEmail: z.string().trim().min(1, msg("Type the user's email to confirm")),
});

export const revokeSessionSchema = z.object({ userId: idSchema, sessionId: idSchema });

export type ChangeRoleInput = z.input<typeof changeRoleSchema>;
export type DeleteUserInput = z.input<typeof deleteUserSchema>;

export const signupSettingSchema = z.object({ enabled: z.boolean(msg("Choose on or off")) });

export const ANNOUNCEMENT_MAX = 280;
export const announcementSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, msg("Enter a message"))
    .max(ANNOUNCEMENT_MAX, msgWith("Use at most {max} characters", { max: ANNOUNCEMENT_MAX })),
  level: z.enum(["info", "warning"], msg("Choose a level")),
});

export const exportUserSchema = z.object({
  userId: idSchema,
  reason: z.string().trim().min(3, msg("Say why this export is needed")).max(300, msg("Use at most 300 characters")),
});

export type AnnouncementInput = z.input<typeof announcementSchema>;
