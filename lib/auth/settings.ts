import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

export const SIGNUP_ENABLED_KEY = "signup_enabled";

/**
 * Whether new accounts may be created. Needs no session on purpose: the register page and the
 * register action are public. A missing or malformed row means signups are ON (the default).
 */
export async function isSignupEnabled(): Promise<boolean> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SIGNUP_ENABLED_KEY));
  return row?.value === false ? false : true;
}
