import { z } from "zod";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { currencyField, timezoneField } from "./regional";
import { msg, msgWith } from "@/lib/i18n/translate";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const NAME_MAX = 100;

export const nameField = z
  .string()
  .trim()
  .min(1, msg("Name is required"))
  .max(NAME_MAX, msgWith("Name must be at most {max} characters", { max: NAME_MAX }));

/** Emails are trimmed and lowercased before they are saved or compared. */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(msg("Enter a valid email address")).max(254, msg("Email is too long")));

/** bcrypt only uses the first 72 bytes, so the limit is enforced on UTF-8 bytes. */
export const passwordField = z
  .string()
  .min(PASSWORD_MIN, msgWith("Password must be at least {min} characters", { min: PASSWORD_MIN }))
  .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX, {
    message: msgWith("Password must be at most {max} characters", { max: PASSWORD_MAX }),
  });

const confirmedPassword = z.object({
  password: passwordField,
  confirmPassword: z.string(),
});

function passwordsMatch(value: { password: string; confirmPassword: string }) {
  return value.password === value.confirmPassword;
}

const mismatch = {
  message: msg("Passwords do not match"),
  path: ["confirmPassword"],
};

export const registerSchema = confirmedPassword
  .extend({
    name: nameField,
    email: emailField,
    // A missing or unknown choice falls back to the defaults instead of blocking the signup.
    currency: currencyField.catch(DEFAULT_CURRENCY),
    timezone: timezoneField.catch(DEFAULT_TIMEZONE),
  })
  .refine(passwordsMatch, mismatch);

/** Login only checks shape: any non-empty password, so old passwords never get "too short" hints. */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, msg("Enter your password")),
});

export const emailOnlySchema = z.object({ email: emailField });

export const resetPasswordSchema = confirmedPassword
  .extend({ token: z.string().min(1, msg("This reset link is invalid")) })
  .refine(passwordsMatch, mismatch);

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type EmailOnlyInput = z.input<typeof emailOnlySchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
