"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { redirect } from "next/navigation";
import { consumeAuthToken, createAuthToken } from "@/lib/auth/tokens";
import { recordLoginAttempt } from "@/lib/auth/login-events";
import { isLockedOut, isRateLimited } from "@/lib/auth/rate-limit";
import { createSession, destroyCurrentSession } from "@/lib/auth/session";
import { materializeForUser } from "@/lib/recurring/materialize";
import { isSignupEnabled } from "@/lib/auth/settings";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  resetUserPassword,
} from "@/lib/auth/users";
import { buildAppUrl } from "@/lib/email/links";
import { passwordResetEmail, verificationEmail, welcomeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { getEnv } from "@/lib/env";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { NEUTRAL_RESEND_MESSAGE, NEUTRAL_RESET_MESSAGE } from "./auth-messages";
import { getT } from "@/lib/i18n/server";
import { failure, localize, validationFailure, type ActionResult } from "./result";
import { msg } from "@/lib/i18n/translate";

const INVALID_CREDENTIALS = msg("Invalid email or password");
const INVALID_LINK = msg("This link is invalid or has expired.");
const TOO_MANY_REQUESTS = msg("Too many attempts. Please wait a while and try again.");
const SIGNUP_CLOSED = msg("New signups are currently closed.");

async function sendVerificationEmail(user: { id: string; name: string; email: string }) {
  const token = await createAuthToken(user.id, "email_verification");
  await sendEmail({
    to: user.email,
    ...verificationEmail({
      t: await getT(),
      name: user.name,
      url: buildAppUrl("/verify-email", { token }),
    }),
  });
}

async function sendWelcomeEmail(user: { name: string; email: string }) {
  await sendEmail({
    to: user.email,
    ...welcomeEmail({ t: await getT(), name: user.name, url: buildAppUrl("/dashboard") }),
  });
}

export async function register(
  input: unknown,
): Promise<ActionResult<{ requiresVerification: true; email: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { name, email, password, currency, timezone } = parsed.data;
  if (await isRateLimited("register")) return failure(TOO_MANY_REQUESTS, "rate_limited");
  if (!(await isSignupEnabled())) return failure(SIGNUP_CLOSED);
  const requireVerification = getEnv().REQUIRE_EMAIL_VERIFICATION;

  const created = await createUser({ name, email, password, verified: !requireVerification, currency, timezone });
  if (!created.ok) {
    return localize({
      ok: false,
      error: msg("An account with this email already exists."),
      fieldErrors: { email: [msg("An account with this email already exists.")] },
    });
  }

  if (requireVerification) {
    await sendVerificationEmail({ id: created.id, name, email });
    return { ok: true, requiresVerification: true, email };
  }

  await createSession(created.id);
  await sendWelcomeEmail({ name, email });
  await revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { email, password } = parsed.data;

  // Checked before bcrypt so a flood of guesses does not also cost CPU. A locked email gets the
  // same answer whether or not the account exists.
  if ((await isRateLimited("login")) || (await isLockedOut(email))) {
    return failure(TOO_MANY_REQUESTS, "rate_limited");
  }

  const user = await findUserByEmail(email);
  const passwordMatches = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!user || !passwordMatches) {
    await recordLoginAttempt({
      email,
      userId: user?.id ?? null,
      success: false,
      reason: user ? "bad_password" : "unknown_email",
    });
    return failure(INVALID_CREDENTIALS);
  }

  // Same message as a wrong password, so a blocked account is not revealed to anyone who
  // does not already know the password; the admin sees the real reason in the login log.
  if (user.blockedAt) {
    await recordLoginAttempt({ email, userId: user.id, success: false, reason: "blocked" });
    return failure(INVALID_CREDENTIALS);
  }

  if (getEnv().REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    await recordLoginAttempt({ email, userId: user.id, success: false, reason: "unverified" });
    return failure(msg("Please verify your email before logging in."), "email_not_verified");
  }

  await createSession(user.id);
  await materializeForUser({ id: user.id, name: user.name }, { force: true });
  await recordLoginAttempt({ email, userId: user.id, success: true });
  await revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
  await revalidatePath("/", "layout");
  redirect("/login");
}

export async function resendVerification(input: unknown): Promise<ActionResult<{ message: string }>> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  if (await isRateLimited("resendVerification", parsed.data.email)) return failure(TOO_MANY_REQUESTS, "rate_limited");

  if (getEnv().REQUIRE_EMAIL_VERIFICATION) {
    const user = await findUserByEmail(parsed.data.email);
    if (user && !user.emailVerifiedAt) await sendVerificationEmail(user);
  }
  // Same answer whether or not the account exists, so emails cannot be enumerated.
  return { ok: true, message: (await getT())(NEUTRAL_RESEND_MESSAGE) };
}

export async function verifyEmail(token: string): Promise<ActionResult> {
  const userId = await consumeAuthToken(token, "email_verification");
  if (!userId) return failure(INVALID_LINK);
  await markEmailVerified(userId);
  const user = await findUserById(userId);
  if (user) await sendWelcomeEmail(user);
  return { ok: true };
}

export async function forgotPassword(input: unknown): Promise<ActionResult<{ message: string }>> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  if (await isRateLimited("forgotPassword", parsed.data.email)) return failure(TOO_MANY_REQUESTS, "rate_limited");

  const user = await findUserByEmail(parsed.data.email);
  if (user) {
    const token = await createAuthToken(user.id, "password_reset");
    await sendEmail({
      to: user.email,
      ...passwordResetEmail({
        t: await getT(),
        name: user.name,
        url: buildAppUrl("/reset-password", { token }),
      }),
    });
  }
  return { ok: true, message: (await getT())(NEUTRAL_RESET_MESSAGE) };
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  // Validated first, so a typo in the new password does not burn the one-time token.
  const userId = await consumeAuthToken(parsed.data.token, "password_reset");
  if (!userId) return failure(INVALID_LINK);

  await resetUserPassword(userId, parsed.data.password);
  await revalidatePath("/", "layout");
  redirect("/login?reset=1");
}
