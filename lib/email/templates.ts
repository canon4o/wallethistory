import { translator, type Translate } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { EmailMessage } from "./transport";

// Emails are written in the language of the request that triggers them; English when none is given.
const english = translator(DEFAULT_LOCALE);

type Template = Pick<EmailMessage, "subject" | "html" | "text">;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(options: {
  t: Translate;
  name: string;
  paragraphs: string[];
  action: { label: string; url: string };
  footer: string;
}): Pick<Template, "html" | "text"> {
  const paragraphs = options.paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`);
  const url = escapeHtml(options.action.url);
  const button = `<p style="margin:16px 0"><a href="${url}" style="background:#1aaaba;color:#06282d;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(options.action.label)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#5f7277">${escapeHtml(options.t("Or open this link:"))} <a href="${url}">${url}</a></p>`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#1a2326;max-width:480px">
<p style="margin:0 0 12px">${escapeHtml(options.t("Hi {name},", { name: options.name }))}</p>
${paragraphs.join("\n")}
${button}
<p style="margin:16px 0 0;font-size:13px;color:#5f7277">${escapeHtml(options.footer)}</p>
</div>`;
  const text = [
    options.t("Hi {name},", { name: options.name }),
    "",
    ...options.paragraphs.flatMap((p) => [p, ""]),
    `${options.action.label}: ${options.action.url}`,
    "",
    options.footer,
  ].join("\n");
  return { html, text };
}

export function verificationEmail(input: { name: string; url: string; t?: Translate }): Template {
  const t = input.t ?? english;
  return {
    subject: t("Verify your WalletHistory email"),
    ...layout({
      t,
      name: input.name,
      paragraphs: [t("Confirm your email address to finish setting up your WalletHistory account.")],
      action: { label: t("Verify email"), url: input.url },
      footer: t("This link expires in 24 hours. If you did not sign up, you can ignore this email."),
    }),
  };
}

export function passwordResetEmail(input: { name: string; url: string; t?: Translate }): Template {
  const t = input.t ?? english;
  return {
    subject: t("Reset your WalletHistory password"),
    ...layout({
      t,
      name: input.name,
      paragraphs: [t("We received a request to reset your password.")],
      action: { label: t("Reset password"), url: input.url },
      footer: t("This link expires in 1 hour. If you did not ask for this, you can ignore this email."),
    }),
  };
}

export function welcomeEmail(input: { name: string; url: string; t?: Translate }): Template {
  const t = input.t ?? english;
  return {
    subject: t("Welcome to WalletHistory"),
    ...layout({
      t,
      name: input.name,
      paragraphs: [
        t("Your account is ready. A Cash account and a set of default categories are already set up for you."),
      ],
      action: { label: t("Open WalletHistory"), url: input.url },
      footer: t("Happy tracking!"),
    }),
  };
}

export function householdInviteEmail(input: { name: string; inviterName: string; url: string; t?: Translate }): Template {
  const t = input.t ?? english;
  return {
    subject: t("{inviter} invited you to share a household on WalletHistory", { inviter: input.inviterName }),
    ...layout({
      t,
      name: input.name,
      paragraphs: [
        t("{inviter} invited you to a shared household on WalletHistory.", { inviter: input.inviterName }),
        t("If you accept, everyone in the household can see each other's accounts and transactions, including past ones. Each person can still change only their own data."),
      ],
      action: { label: t("Review invitation"), url: input.url },
      footer: t("Sign in to accept or decline. The invitation expires in 14 days. If you do not know this person, decline it."),
    }),
  };
}
