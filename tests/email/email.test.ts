import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAppUrl } from "@/lib/email/links";
import { householdInviteEmail, passwordResetEmail, verificationEmail, welcomeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { resetTestEnv, testEnv } from "../helpers/env";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport: (...args: unknown[]) => createTransport(...(args as [])) } }));

const message = { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi there" };

describe("buildAppUrl", () => {
  beforeEach(resetTestEnv);

  it("builds absolute links from APP_URL", () => {
    expect(buildAppUrl("/verify-email", { token: "abc" })).toBe("http://localhost:3000/verify-email?token=abc");
    testEnv.APP_URL = "https://app.example.org";
    expect(buildAppUrl("/dashboard")).toBe("https://app.example.org/dashboard");
  });

  it("encodes query values", () => {
    expect(buildAppUrl("/x", { token: "a b&c" })).toBe("http://localhost:3000/x?token=a+b%26c");
  });
});

describe("templates", () => {
  const url = "http://localhost:3000/verify-email?token=abc";

  it("verification email greets by name and contains the link in html and text", () => {
    const email = verificationEmail({ name: "Ada", url });
    expect(email.subject).toMatch(/verify/i);
    expect(email.html).toContain("Hi Ada,");
    expect(email.html).toContain(`href="${url}"`);
    expect(email.text).toContain("Hi Ada,");
    expect(email.text).toContain(url);
    expect(email.text).toMatch(/24 hours/);
  });

  it("password reset email mentions the 1 hour expiry", () => {
    const email = passwordResetEmail({ name: "Ada", url });
    expect(email.subject).toMatch(/reset/i);
    expect(email.text).toContain(url);
    expect(email.text).toMatch(/1 hour/);
  });

  it("welcome email links to the app", () => {
    const email = welcomeEmail({ name: "Ada", url: "http://localhost:3000/dashboard" });
    expect(email.subject).toMatch(/welcome/i);
    expect(email.text).toContain("http://localhost:3000/dashboard");
  });

  it("escapes HTML in names and urls", () => {
    const email = verificationEmail({ name: `<script>alert("x")</script>`, url: `${url}"onmouseover="x` });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain(`"onmouseover="x`);
    // The plain-text part is not HTML, so it keeps the raw characters.
    expect(email.text).toContain(`<script>alert("x")</script>`);
  });
});

describe("sendEmail", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    resetTestEnv();
    sendMail.mockReset().mockResolvedValue({});
    createTransport.mockClear();
    log.mockClear();
    error.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("prints to the console instead of sending when SMTP_HOST is empty", async () => {
    expect(await sendEmail(message)).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
    const printed = String(log.mock.calls[0][0]);
    expect(printed).toContain("To: ada@example.com");
    expect(printed).toContain("Subject: Hi");
    expect(printed).toContain("Hi there");
  });

  it("sends through SMTP with credentials when configured", async () => {
    Object.assign(testEnv, { SMTP_HOST: "smtp.test", SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: "u", SMTP_PASS: "p" });
    expect(await sendEmail(message)).toBe(true);
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.test",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
    expect(sendMail).toHaveBeenCalledWith({ from: testEnv.SMTP_FROM, ...message });
  });

  it("omits auth when no SMTP user is set", async () => {
    testEnv.SMTP_HOST = "smtp.test";
    await sendEmail(message);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("never throws: a failing SMTP server returns false and is logged", async () => {
    testEnv.SMTP_HOST = "smtp.test";
    sendMail.mockRejectedValue(new Error("connection refused"));
    expect(await sendEmail(message)).toBe(false);
    expect(error).toHaveBeenCalledWith("Failed to send email:", "connection refused");
  });

  it("logs non-Error failures too", async () => {
    testEnv.SMTP_HOST = "smtp.test";
    sendMail.mockRejectedValue("boom");
    expect(await sendEmail(message)).toBe(false);
    expect(error).toHaveBeenCalledWith("Failed to send email:", "boom");
  });
});

describe("household invite template", () => {
  it("names the inviter, warns about shared history, and escapes html", () => {
    const email = householdInviteEmail({ name: "Ben", inviterName: "<Ann>", url: "http://localhost:3000/profile/household" });
    expect(email.subject).toContain("<Ann>");
    expect(email.html).toContain("&lt;Ann&gt;");
    expect(email.html).not.toContain("<Ann>");
    expect(email.text).toContain("including past ones");
    expect(email.html).toContain('href="http://localhost:3000/profile/household"');
  });
});
