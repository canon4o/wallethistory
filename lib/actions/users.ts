"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { deleteOtherSessions, destroyCurrentSession, requireUser } from "@/lib/auth/session";
import { findUserById, setUserPassword } from "@/lib/auth/users";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from "@/lib/i18n/locales";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS } from "@/lib/theme";
import { localeSchema } from "@/lib/validation/locale";
import { themeSchema } from "@/lib/validation/theme";
import { regionalSettingsSchema } from "@/lib/validation/regional";
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from "@/lib/validation/users";
import { guarded, notFoundFailure, validationFailure, type ActionResult } from "./result";
import { msg } from "@/lib/i18n/translate";
import { secureCookies } from "@/lib/auth/secure-cookie";

const WRONG_PASSWORD = msg("That password is not correct.");

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    await getDb().update(users).set({ name: parsed.data.name }).where(eq(users.id, user.id));
    // The name is shown in the sidebar on every page.
    await revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Display currency and timezone. Currency is only a label: existing amounts are not converted. */
export async function updateRegionalSettings(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = regionalSettingsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    await getDb()
      .update(users)
      .set({ currency: parsed.data.currency, timezone: parsed.data.timezone })
      .where(eq(users.id, user.id));
    // Every page formats amounts and works out "today" from these two values.
    await revalidatePath("/", "layout");
    return { ok: true };
  });
}

/**
 * Light, dark or follow the system. Stored only in a cookie, so it is per browser. Needs no
 * session (it is also switchable on the login pages) and touches no user data.
 */
export async function updateTheme(input: unknown): Promise<ActionResult> {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    (await cookies()).set(THEME_COOKIE, parsed.data.theme, {
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
      maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    });
    return { ok: true };
  });
}

/**
 * Chooses the language. Stored only in a cookie, so it is per browser. Needs no session (the
 * switcher is also on the login pages) and touches no user data.
 */
export async function setLocale(input: unknown): Promise<ActionResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    });
    await revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Requires the current password; afterwards every other session of the user is signed out. */
export async function changePassword(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const account = await findUserById(user.id);
    if (!account) return notFoundFailure();
    if (!(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
      return {
        ok: false,
        error: WRONG_PASSWORD,
        fieldErrors: { currentPassword: [WRONG_PASSWORD] },
      };
    }
    await setUserPassword(user.id, parsed.data.newPassword);
    await deleteOtherSessions(user.id);
    return { ok: true };
  });
}

/** Requires the password. Deleting the user cascades to every row they own. */
export async function deleteCurrentUser(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const result = await guarded(async (): Promise<ActionResult> => {
    const account = await findUserById(user.id);
    if (!account) return notFoundFailure();
    if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
      return { ok: false, error: WRONG_PASSWORD, fieldErrors: { password: [WRONG_PASSWORD] } };
    }
    await getDb().delete(users).where(eq(users.id, user.id));
    await destroyCurrentSession();
    return { ok: true };
  });
  if (!result.ok) return result;

  await revalidatePath("/", "layout");
  redirect("/login");
}
