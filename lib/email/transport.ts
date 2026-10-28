import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends an email and never throws: a failing mail server must not break the main action.
 * Returns whether the email was handed over (or printed, when SMTP_HOST is empty).
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const env = getEnv();

  if (!env.SMTP_HOST) {
    console.log(
      [
        "",
        "=== Email (SMTP_HOST is empty, printing instead of sending) ===",
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "===============================================================",
        "",
      ].join("\n"),
    );
    return true;
  }

  try {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return true;
  } catch (error) {
    console.error("Failed to send email:", error instanceof Error ? error.message : error);
    return false;
  }
}
