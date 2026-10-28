import { z } from "zod";
import { nameField, passwordField } from "./auth";
import { msg } from "@/lib/i18n/translate";

export const updateProfileSchema = z.object({ name: nameField });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, msg("Enter your current password")),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: msg("Passwords do not match"),
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: msg("Choose a password different from the current one"),
    path: ["newPassword"],
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, msg("Enter your password to confirm")),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
