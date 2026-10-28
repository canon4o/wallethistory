import { describe, expect, it } from "vitest";
import { householdInviteEmail, passwordResetEmail, verificationEmail, welcomeEmail } from "@/lib/email/templates";
import { translator } from "@/lib/i18n/translate";

describe("email templates", () => {
  it("default to English", () => {
    expect(verificationEmail({ name: "Ada", url: "http://x/y" }).subject).toBe("Verify your WalletHistory email");
  });

  it.each(["bg", "es"] as const)("are written in the given language (%s)", (locale) => {
    const t = translator(locale);
    const english = [
      verificationEmail({ name: "Ada", url: "http://x/y" }),
      passwordResetEmail({ name: "Ada", url: "http://x/y" }),
      welcomeEmail({ name: "Ada", url: "http://x/y" }),
      householdInviteEmail({ name: "Ada", inviterName: "Bob", url: "http://x/y" }),
    ];
    const localized = [
      verificationEmail({ name: "Ada", url: "http://x/y", t }),
      passwordResetEmail({ name: "Ada", url: "http://x/y", t }),
      welcomeEmail({ name: "Ada", url: "http://x/y", t }),
      householdInviteEmail({ name: "Ada", inviterName: "Bob", url: "http://x/y", t }),
    ];
    localized.forEach((mail, i) => {
      expect(mail.subject).not.toBe(english[i].subject);
      expect(mail.text).not.toBe(english[i].text);
      expect(mail.text).toContain("http://x/y");
    });
    expect(localized[3].text).toContain("Bob");
  });
});
