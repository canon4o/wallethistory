import { z } from "zod";
import { emailField } from "./auth";

export const inviteSchema = z.object({ email: emailField });

export type InviteInput = z.input<typeof inviteSchema>;
